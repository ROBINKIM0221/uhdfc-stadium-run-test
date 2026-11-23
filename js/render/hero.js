// 내 선수와 공. 규칙이 정한 자리(run.x, run.y)에 세우고, 달리기 위에 동작을 얹는다.
import * as THREE from './three.js';
import { TICK, BALL_SPEED, BOOST_TICKS, BOOST_REACH, SPEED0, SPEED_MAX } from '../sim/constants.js';
import { kitById } from '../data/kits.js';
import { byNo, LEFT_FOOTED } from '../data/players.js';
import { pickSkill } from '../data/skills.js';
import { FACE_COLORS } from '../data/face-colors.js';
import { makeRig } from './rig.js';
import { flatHead, loadFace, faceCamera } from './heads.js';
import { apply, blend, layer, mirror, smooth } from './anim.js';
import { RUN, CLIPS, BALL_R, KICK_AT } from './clips-hero.js';
import { settle } from './clip-tools.js';

const FADE = 0.1;          // 동작이 바뀔 때 앞 자세에서 넘어오는 시간(초)
const BOOST = BOOST_TICKS * TICK, FLIGHT = BOOST_REACH / BALL_SPEED;   // 아이템 4초, 그중 공이 날아가는 시간
const LIFT = 0.35;         // 날아가는 공이 가장 높이 뜨는 높이(m)
const CRUISE = 7;          // 날아간 공이 느려진 뒤 선수 앞에서 굴러가는 거리(m)
const SLOW = 1.8;          // 거기까지 느려지는 시간(초)
const RETURN = 0.7;        // 아이템이 끝나기 전 이 시간 동안 공이 발밑으로 돌아온다
const TAKE = 0.25;         // 뺏긴 공이 막은 선수 발밑으로 가는 시간
// 걸음 빠르기(초당 바퀴): 초속 12m 에서 1.9, 29m 에서 2.7. 시간과 거리에서 바로 얻어 같은 틱이면 같은 자세가 된다
const stride = (t, dist) => Math.PI * 2 * (1.214 * t + 0.0536 * dist);

// 차 낸 공이 발밑보다 얼마나 앞에 있는지(m). tau: 차기 시작한 뒤 흐른 시간, gone: 그동안 달린 거리.
// 규칙이 막는 선수를 쓰러뜨리는 시각과 맞도록 FLIGHT 동안은 길 위를 BALL_SPEED 로 날고,
// 그 뒤에는 느려져 CRUISE 앞에서 같이 굴러가다가 아이템이 끝나는 순간 발밑에 닿는다
function shotAhead(tau, gone) {
  if (tau < FLIGHT) return (BALL_SPEED * tau - gone) * smooth((tau - KICK_AT) / 0.2);
  const far = BOOST_REACH - gone * FLIGHT / tau;   // 다 날아갔을 때의 거리. 아이템 동안에는 달리는 빠르기가 거의 같다
  return (far + (CRUISE - far) * smooth((tau - FLIGHT) / SLOW)) * (1 - smooth((tau - BOOST + RETURN) / RETURN));
}

function ballTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), N = 12, golden = Math.PI * (3 - Math.sqrt(5));
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#15171c';
  for (let i = 0; i < N; i++) {
    const lat = Math.asin(1 - (i + 0.5) / N * 2), u = (i * golden / (2 * Math.PI)) % 1, v = 0.5 - lat / Math.PI;
    const ry = 10, rx = ry / Math.max(0.25, Math.cos(lat));   // 극 쪽 점은 감기며 좁아지므로 미리 넓힌다
    for (const du of [-1, 0, 1]) { g.beginPath(); g.ellipse((u + du) * 256, v * 128, rx, ry, 0, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function create(ctx) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshLambertMaterial({ map: ballTexture() }));
  ball.castShadow = true;
  ctx.scene.add(ball);
  ctx.ball = ball;         // 효과 조각이 공의 자리를 읽는다

  let rig = null, worn = {}, flat = false;   // flat: 지금 납작한 사진 머리를 쓰고 있다
  let clip = null;         // { def, flip, t0 }: 지금 얹혀 있는 동작
  let from = null, fadeAt = 0, last = null;
  let shot = null;         // { at, dist }: 공을 차기 시작한 시각과 그때의 거리. 아이템이 끝날 때까지 공은 발밑에 없다
  let taken = null;        // { at, x, z }: 공을 뺏긴 시각과 공이 가서 멈출 자리
  let skill = null;        // 바로 앞에 쓴 기술. 같은 기술이 연달아 나오지 않게 한다
  let step0 = 0;           // 걸음을 밀어 둔 양(라디안)

  // 선수가 바뀌면 몸을 새로 만들고, 유니폼만 바뀌면 다시 칠한다
  function dress() {
    const { hero, kit } = ctx.look;
    if (worn.hero !== hero) {
      if (rig) { ctx.scene.remove(rig.root); rig.dispose(); }
      const who = byNo(hero);
      rig = makeRig({ kit: kitById(kit), no: hero, name: who.name, gk: who.pos === 'GK', long: true, ...FACE_COLORS[hero] });
      ctx.scene.add(rig.root);
      flat = false;
      loadFace(hero, true).catch(() => {});   // 못 받으면 얼굴 없는 머리로 둔다
    } else if (worn.kit !== kit) rig.dress({ kit: kitById(kit) });
    worn = { hero, kit };
  }

  // 얼굴이 카메라 쪽을 향하면 사진 머리를, 등을 보이면 입체 뒤통수를 쓴다. 경계에서 깜박이지 않게 바꾸는 각을 벌려 둔다
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), headQ = new THREE.Quaternion();
  const was = { x: 0, z: 0, dist: 0 }, axis = new THREE.Vector3(), turn = new THREE.Quaternion();   // 공이 앞 프레임에 있던 자리와, 굴리는 데 쓰는 축·회전
  function turnHead() {
    const head = rig.j.head;
    head.getWorldPosition(eye).sub(ctx.camera.position).negate().normalize();
    const toward = fwd.set(0, 0, -1).applyQuaternion(head.getWorldQuaternion(headQ)).dot(eye);
    const photo = (flat ? toward > 0 : toward > 0.2) && flatHead(worn.hero, rig.headR, true);
    if (!!photo !== flat) { rig.setHead(photo || null); flat = !!photo; }
    if (flat) faceCamera(head, ctx.camera);
  }

  function play(def, flip, t0) {
    clip = { def, flip, t0 };
    // 돌던 몸은 가까운 쪽으로 풀려야 한다: 앞 자세의 방향을 반 바퀴 안쪽 값으로 바꿔 둔다
    from = last && { ...last, root: { ...last.root, yaw: Math.atan2(Math.sin(last.root.yaw), Math.cos(last.root.yaw)) } };
    fadeAt = t0;
  }

  // 공을 dir 쪽(왼쪽 -1, 오른쪽 1)으로 보낸 동작이 끝날 때 달리기의 공도 그쪽 발 앞에 와 있도록 걸음을 민다.
  // 동작이 몸을 다 덮고 있을 때 밀기 때문에 걸음이 건너뛰는 것은 보이지 않는다
  function landBall(dir, run) {
    const end = clip.t0 + clip.def.dur;
    step0 = (1 + dir * 0.5) * Math.PI - stride(end, run.pdist + run.speed * clip.def.dur);
  }

  return {
    reset() {
      dress();
      clip = shot = taken = skill = null; step0 = 0;
      from = last; fadeAt = ctx.now;
    },

    update(run, alpha) {
      // 첫 화면은 선수 카드가 대신한다. 달리기 시작하면 그 자리에 나타난다
      rig.root.visible = ball.visible = ctx.mode !== 'home';
      if (ctx.mode === 'home') return;
      const t = ctx.now, dist = run.pdist + (run.dist - run.pdist) * alpha;
      const x = run.px + (run.x - run.px) * alpha;
      // 떠 있다가 부딪혔으면 판이 멈춘 높이에서 땅으로 내려온다
      const y = (run.py + (run.y - run.py) * alpha) * (taken ? 1 - smooth((t - taken.at) / TAKE) : 1);

      // 빠를수록 걸음이 커진다. 왼발잡이는 좌우를 뒤집어 왼발로 공을 몬다(반 바퀴 밀어 어느 다리가 앞인지는 그대로 둔다)
      const phase = stride(t, dist) + step0, pace = Math.min(1, Math.max(0, (run.speed - SPEED0) / (SPEED_MAX - SPEED0)));
      const base = LEFT_FOOTED.includes(worn.hero) ? mirror(RUN(phase + Math.PI, pace)) : RUN(phase, pace);
      let pose = base;
      if (clip) {
        const u = (t - clip.t0) / clip.def.dur;
        if (u >= 1 && !clip.def.hold) clip = null;
        else pose = layer(base, clip.def, Math.min(1, u), clip.flip);
      }
      if (from) {
        const k = (t - fadeAt) / FADE;
        if (k >= 1) from = null;
        else pose = blend(from, pose, smooth(k));
      }
      pose = settle(pose);
      last = pose;
      apply(rig, pose);
      rig.root.position.set(x, y, 0);
      turnHead();
      ctx.blob(x, 0, 0.42 - 0.12 * (y + Math.max(0, pose.root.y)));   // 동작이 몸을 띄울 때도 그림자가 작아진다

      const b = pose.ball;
      let bx = x + b.x, by = b.y, bz = b.z;
      if (shot) {
        // 발을 떠난 공은 몸동작을 따르지 않고 선수 앞을 곧게 간다
        const tau = t - shot.at, ahead = shotAhead(tau, dist - shot.dist), free = Math.min(1, ahead);
        bx += (x - bx) * free;
        by += (BALL_R + LIFT * Math.sin(Math.PI * Math.min(1, tau / FLIGHT)) - by) * free;
        bz += (-0.7 - bz) * free - ahead;
      }
      if (taken) {
        const k = smooth((t - taken.at) / TAKE);
        bx += (taken.x - bx) * k; by += (BALL_R - by) * k; bz += (taken.z - bz) * k;
      }
      ball.position.set(bx, by, bz);
      // 공은 땅 위를 움직인 만큼 그 방향으로 구른다. 달린 만큼 땅이 뒤로 가므로 그것도 움직인 거리다. 판이 바뀌어 자리가 건너뛴 프레임은 넘긴다
      const dx = bx - was.x, dz = bz - was.z - (dist - was.dist), far = Math.hypot(dx, dz);
      if (far > 1e-6 && far < 3) ball.quaternion.premultiply(turn.setFromAxisAngle(axis.set(dz / far, 0, -dx / far), far / BALL_R));
      was.x = bx; was.z = bz; was.dist = dist;
      ctx.blob(bx, bz, 0.2);
    },

    onEvent(ev, run) {
      const t0 = ctx.now, left = LEFT_FOOTED.includes(worn.hero);
      if (ev.type === 'move') {
        if (run.air > 0) return;   // 떠 있을 때는 몸만 옮긴다
        skill = pickSkill(run.seed, ev.index, skill);
        // 공은 모는 발 쪽 앞에 있다. 공에서 먼 쪽으로 갈 때는 먼 쪽에서 시작하는 동작(far)을 쓰고, 그것이 없는 기술은 가까운 쪽 동작으로 대신한다
        const def = CLIPS[skill] || CLIPS.cut;
        play(((ev.dir < 0) !== left && def.far) || def, ev.dir < 0, t0);
        landBall(ev.dir, run);
      } else if (ev.type === 'jump') { play(CLIPS.rainbow, left, t0); landBall(left ? -1 : 1, run); }   // 플릭은 오른발로 모는 쪽으로 만든 것이라 왼발잡이는 뒤집는다
      // 슛은 왼발로 차는 쪽으로 만든 것이라 오른발잡이는 뒤집는다. 끝날 때의 걸음도 그 발에 맞춘다
      else if (ev.type === 'item') { play(CLIPS.kick, !left, t0); landBall(left ? 1 : -1, run); shot = { at: t0, dist: run.pdist }; }
      else if (ev.type === 'boostEnd') shot = null;
      else if (ev.type === 'hit') {
        play(CLIPS.tackled, false, t0);
        // 공은 막은 선수의 발 옆으로 간다. 주저앉는 몸에 가리지 않게, 벌려 선 두 발 가운데 내 선수에게서 먼 쪽 바깥에 둔다
        const o = run.objs.find(o => o.id === ev.id);
        if (o) taken = { at: t0, x: o.x + (o.x < run.x ? -0.55 : 0.55), z: run.dist - o.d + 0.15 };
      }
    },
  };
}
