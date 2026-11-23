// 막는 선수들. 가까운 차례로 관절 몸을 돌려 쓰고, 그 뒤 먼 선수는 굳힌 몸 하나를 여러 번 찍어 그린다.
// 규칙은 읽기만 한다: 자리와 상태에서 종류별 모습을 정하고, 이벤트(knock, hit, 제쳐짐)가 오면 그 선수에게 동작을 얹는다.
import * as THREE from './three.js';
import { laneX, KEEPER_TELL, KEEPER_FLY } from '../sim/constants.js';
import { isPickup } from '../sim/objects.js';
import { hash2 } from '../sim/rng.js';
import { PLAYERS, START_PLAYER } from '../data/players.js';
import { KITS, START_KITS, opponentKits } from '../data/kits.js';
import { FACE_COLORS } from '../data/face-colors.js';
import { makeRig, bakeRig, paint, tint } from './rig.js';
import { flatHead, loadFace, shadeFlats, faceCamera } from './heads.js';
import { apply, blend, mirror, sample, smooth } from './anim.js';
import { JOCKEY, SHUFFLE, SPRINT, COIL, KEEPER_READY, GUARD0, KEEPER0, LIE_BACK, LIE_Y, CLIPS, KNOCKS, hash } from './clips-def.js';

const RIGS = { low: 8, mid: 14, high: 14 };   // 품질 단계별로 관절 몸으로 그리는 수
const FIELD_RIGS = 14, KEEPER_RIGS = 4;        // 관절 몸의 수. 한 판에 나오는 얼굴도 이만큼이다. 골키퍼는 내 선수를 빼고도 넷이 남는다
const FAR_MAX = 40;
// 납작한 얼굴은 빛을 받지 않아, 하늘빛 세기를 따라 밝기를 맞춘다: 낮과 노을 1, 밤 0.72
const faceLevel = time => Math.min(1, 0.44 + time.hemi[2] / 3);

const FADE = 0.1;                         // 동작이 바뀔 때 앞 자세에서 넘어오는 시간(초)
const QUARTER = Math.PI / 2;
const FLAT = 1.5;                         // 등을 대고 누운 몸이 뒤로 넘어간 각
const FAR_HIP = 0.7;                      // 굳힌 몸의 골반 높이. 동작이 정한 골반 자리에 굳힌 몸을 맞춰 놓는 데 쓴다
const LIVE_FROM = 60, LIVE_FULL = 38;     // 이 거리(m)부터 몸놀림이 살아나 이 거리에서 다 살아난다. 더 멀면 굳힌 몸과 같은 자세라 바뀔 때 튀지 않는다
// 내 선수가 닿기까지 남은 시간(초)으로 재는 것들. 거리로 재면 빨라질수록 몸놀림이 눈에 안 보이게 짧아진다
const NEAR_FROM = 0.6, NEAR_FULL = 0.25;  // 자세를 낮추기 시작하는 때와 다 낮춘 때
const POKE_FROM = 0.34, POKE_FULL = 0.1;  // 지나가는 내 선수 쪽으로 다리를 뻗기 시작하는 때와 다 뻗은 때
const GONE = -0.45, BACK = 0.3;           // 지나친 뒤 제자리 자세로 다 돌아온 때와, 돌아오는 데 걸리는 시간
const BREAK_FROM = 0.6, BREAK_FULL = 0.25;   // 달려들다가 잔걸음으로 바꾸기 시작하는 때와 수비 자세에 가까워진 때
const POKE_SHY = 0.45;                    // 뻗은 발이 내 선수의 몸에 닿지 않게 남기는 틈(m)
const POKE_WIDE = 1.9;                    // 옆으로 이보다 멀리(m) 지나가면 시늉만 한다
const STRIDE = 2;                         // 달려드는 걸음 한 바퀴(두 걸음)에 가는 거리(m)
const SLIDE_FROM = 30, SLIDE_TO = 13;     // 태클이 발을 떼는 거리와 다 미끄러져 멈추는 거리(m)
const WAIT = 0.03;                        // 태클 동작의 이만큼까지는 벼르던 자세에서 넘어오는 중이다
const SAVE = KEEPER_TELL + KEEPER_FLY;    // 골키퍼가 몸짓을 시작해 눕기까지의 틱

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sided = (pose, dir) => (dir < 0 ? mirror(pose) : pose);
// 태클이 발을 뻗는 쪽: 바깥에서 안으로. 가운데 레인은 번갈아
const slideDir = o => (o.x > 0.1 ? -1 : o.x < -0.1 ? 1 : o.id % 2 ? 1 : -1);
const slideDef = o => (o.width > 1 ? CLIPS.slideWide : CLIPS.slide);
const knockOf = o => KNOCKS[o.id % KNOCKS.length];   // 선수마다 다르게 쓰러진다
const slideU = rel => clamp((SLIDE_FROM - rel) / (SLIDE_FROM - SLIDE_TO), 0, 1);
// 스스로 땅에 누웠거나 눕는 중인지(태클, 몸을 날린 골키퍼). rel 은 내 선수 앞 거리
const lying = (o, rel) => (o.kind === 'slide' ? slideU(rel) >= slideDef(o).drop : o.kind === 'keeper' && (o.state === 'fly' || o.state === 'down'));

// 옆으로 누워 있다가 맞은 골키퍼: 그 자리에서 하늘을 보고 뻗는다
const KEEPER_OUT = { ...LIE_BACK, root: { ...LIE_BACK.root, yaw: -QUARTER } };

// 막는 것마다 적어 두는 것: 틱 사이를 잇는 데 쓸 앞 틱의 자리, 처음 본 거리(d0), 쓰러진 순간의 자리(down = { x, rel, lying })
const notes = new WeakMap();
function note(o, tick) {
  let r = notes.get(o);
  if (!r) notes.set(o, r = { tick, x: o.x, d: o.d, px: o.x, pd: o.d, d0: o.d, down: null });
  else if (r.tick !== tick) {
    // 한 화면에 여러 틱이 지났으면 바로 앞 틱의 자리를 어림한다
    const n = tick - r.tick;
    r.px = o.x - (o.x - r.x) / n; r.pd = o.d - (o.d - r.d) / n; r.x = o.x; r.d = o.d; r.tick = tick;
  }
  return r;
}

// 막는 것 하나의 모습. 몸의 mid 높이(발밑에서 잰 거리)가 (x, y, z) 에 오고, 이쪽을 본 채 yaw 만큼 돌아서서
// pitch 만큼 뒤로, roll 만큼 경기장 오른쪽으로 눕는다. 구운 동작을 얹으면 그 자리는 골반이고 mid 는 골반의 높이다.
// pose 는 관절 몸일 때만 채운다
const at = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, mid: 0, pose: null };

// 구운 동작의 u(0..1) 시점을 지금 자리에 얹는다: 골반이 동작의 길을 따라가고, 몸은 그 골반에 매달린다. dir 이 -1 이면 좌우를 뒤집는다
function put(def, u, dir, posed) {
  const w = sample(def.path, u).root;
  at.x += dir * w.x; at.y = at.mid = w.y; at.z += w.z; at.pitch = w.pitch; at.yaw = dir * w.yaw; at.roll = dir * w.roll;
  at.pose = posed ? sided(sample(def, u), dir) : null;
}

// 멀리 있는 관절 몸은 굳힌 몸의 자세(still)에 가깝게 둔다
function distant(still, pose, rel) {
  const live = smooth((LIVE_FROM - rel) / (LIVE_FROM - LIVE_FULL));
  return live < 1 ? blend(still, pose, live) : pose;
}

// 규칙의 상태에서 모습을 정한다. r: 그 막는 것에 적어 둔 것, x: 가로 자리, rel: 내 선수 앞 거리, hx: 내 선수의 가로 자리, t: 시계(초),
// held: 쓰러졌거나 동작을 얹은 순간의 기록({ rel, lying }). 서 있다가 그렇게 된 선수는 선 자리만 정해 주고, 몸은 부른 쪽이 얹는다
function shape(o, r, x, rel, hx, alpha, t, run, held, posed) {
  at.x = x; at.y = 0; at.z = -rel; at.pitch = at.yaw = at.roll = at.mid = 0; at.pose = null;
  const dx = hx - x, side = Math.abs(dx);
  // 코앞을 지나갈 때 고개가 홱 돌아가지 않게, 가까이 스칠수록 앞쪽에 있는 것으로 친다
  const aim = Math.atan2(dx, Math.max(rel, 1 - side));

  if (o.kind === 'slide') {
    // 쓰러지거나 동작을 얹으면 하던 데서 멈춘다
    const def = slideDef(o), u = slideU(held ? held.rel : rel);
    put(def, u, slideDir(o), posed && !held && u > 0);
    if (!posed && u < def.drop) at.y = at.mid = 0;   // 굳힌 몸은 서 있는 동안 발밑을 땅에 둔다
    if (u >= def.drop) {
      if (held) { at.pitch = FLAT; at.roll = 0; at.y = at.mid = LIE_Y; at.pose = LIE_BACK; }   // 누운 채 맞았다: 그 자리에서 큰대자로 뻗는다
      return;
    }
    // 아직 서 있다. 벼르는 동안은 제자리에서 몸을 들썩이다가, 발을 떼면서 동작으로 넘어간다
    if (held) at.y = at.mid = at.pitch = at.yaw = at.roll = 0;
    else if (posed && u < WAIT) at.pose = distant(GUARD0, u > 0 ? blend(COIL(t, o.id), at.pose, u / WAIT) : COIL(t, o.id), rel);
    return;
  }
  if (o.kind === 'keeper' && o.state !== 'stand' && !(held && !held.lying)) {
    const n = (o.state === 'tell' ? o.t : o.state === 'fly' ? KEEPER_TELL + o.t : SAVE + 1) - 1 + alpha;
    at.x = laneX(o.lane);
    put(CLIPS.save, clamp(n / SAVE, 0, 1), o.side, posed);
    if (held) { at.y = at.mid = LIE_Y; at.pose = sided(KEEPER_OUT, o.side); }
    else if (posed && n < 4) at.pose = blend(KEEPER_READY(t, o.id, aim), at.pose, smooth(n / 4));
    return;
  }
  if (held || !posed) return;

  let pose;
  if (o.kind === 'keeper') pose = KEEPER_READY(t, o.id, aim);
  else if (o.kind === 'shift') {
    // 떠난 끝에서 온 거리로 걸음을 센다. 한 레인은 두 바퀴, 두 레인은 세 바퀴에 간다.
    // 지금 자리는 앞 틱의 것이고, 오가는 박자의 앞 절반이 a 에서 b 로 가는 길이다
    const out = (run.tick - 1 + o.phase) % o.period * 2 < o.period, from = laneX(out ? o.a : o.b), to = laneX(out ? o.b : o.a);
    const span = Math.abs(to - from), n = span > 2 ? 3 : 2, gone = Math.abs(x - from), c = n * gone / span, acc = 1 - 2 * gone / span;
    pose = to > from ? SHUFFLE(c, span / n, t, o.id, aim, acc) : mirror(SHUFFLE(c, span / n, t, o.id, -aim, acc));
  } else {
    const due = rel / run.speed, back = smooth((due - GONE) / BACK), near = smooth((NEAR_FROM - due) / (NEAR_FROM - NEAR_FULL)) * back;
    const poke = smooth((POKE_FROM - due) / (POKE_FROM - POKE_FULL)) * back * smooth((side - 0.3) / 0.5) * lerp(1, 0.3, smooth((side - POKE_WIDE) / 0.8));
    pose = JOCKEY(t, o.id, aim, near, poke, clamp(side - POKE_SHY, 0.3, 0.95));
    const ran = r.d0 - r.pd - (r.d - r.pd) * alpha;   // 달려온 거리
    if (o.kind === 'rush' && o.running && run.alive && ran > 0) {
      const brk = smooth((BREAK_FROM - due) / (BREAK_FROM - BREAK_FULL));
      pose = blend(pose, SPRINT(ran / STRIDE + 0.35 * brk + hash(o.id), (1 - smooth((ran - 0.4) / 3)) * (1 - brk)), smooth(ran / 0.9) * (1 - 0.7 * brk));
    }
  }
  at.pose = distant(o.kind === 'keeper' ? KEEPER0 : GUARD0, pose, rel);
}

// 한 판에 막는 쪽으로 나올 선수들의 번호를 섞어 준다. 내 선수(hero)는 빠지고, 골키퍼는 따로 모은다
export function cast(hero, rnd) {
  const out = { field: [], gk: [] };
  for (const p of PLAYERS) if (p.no !== hero) out[p.pos === 'GK' ? 'gk' : 'field'].push(p.no);
  for (const list of [out.field, out.gk]) for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return out;
}

export function create(ctx) {
  const slots = [];
  const slot = gk => {
    const rig = makeRig({ kit: KITS[0], gk });
    rig.root.visible = false;
    ctx.scene.add(rig.root);
    // no: 이번 판에 맡은 선수, flat: 납작한 사진 머리를 썼는지,
    // o: 맡은 막는 것, clip: 얹힌 동작 { def, dir, t0, dur, x, d, rel, lying }, from·last·fade: 모습이 갑자기 바뀔 때 잇는 자세와 그 시각
    slots.push({ rig, gk, no: 0, flat: false, id: 0, o: null, clip: null, from: null, last: null, fade: 0, seen: false });
  };
  for (let i = 0; i < FIELD_RIGS + KEEPER_RIGS; i++) slot(i >= FIELD_RIGS);
  const byId = new Map();

  // 먼 선수용: 준비 자세로 굳힌 몸. 머리는 그린 머리 그대로다
  const far = gk => {
    const rig = makeRig({ kit: KITS[0], gk });
    apply(rig, gk ? KEEPER0 : GUARD0);
    const mesh = new THREE.InstancedMesh(bakeRig(rig), new THREE.MeshLambertMaterial({ vertexColors: true }), FAR_MAX);
    rig.dispose();
    mesh.castShadow = true; mesh.frustumCulled = false; mesh.count = 0;
    ctx.scene.add(mesh);
    return mesh;
  };
  const farField = far(false), farKeeper = far(true);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), v = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);

  // 사진이 와 있으면 납작한 사진 머리를 씌운다. 아니면 그린 머리로 두었다가 사진이 오면 바꾼다
  function wear(s) {
    const no = s.no, head = flatHead(no, s.rig.headR);
    s.rig.setHead(head); s.flat = !!head;
    if (!head) loadFace(no).then(() => { if (s.no === no) wear(s); }, () => {});
  }

  // 판마다 한 번 누가 나오고 무엇을 입을지 정한다: 내 선수와 다른 차림, 내 선수가 아닌 얼굴.
  // 규칙의 난수는 건드리지 않는다
  const shown = { seed: -1, hero: 0, kit: '' };
  function dress(run) {
    const { hero, kit } = ctx.look || { hero: START_PLAYER, kit: START_KITS[0] };
    if (shown.seed === run.seed && shown.hero === hero && shown.kit === kit) return;
    Object.assign(shown, { seed: run.seed, hero, kit });
    const kits = opponentKits(kit, Math.random), who = cast(hero, Math.random);
    for (const s of slots) {
      s.no = (s.gk ? who.gk : who.field).pop();
      s.rig.dress({ kit: s.gk ? kits.gk : kits.field, no: s.no, ...FACE_COLORS[s.no] });
      wear(s);
    }
    paint(farField.geometry, tint({ kit: kits.field }));
    paint(farKeeper.geometry, tint({ kit: kits.gk }));
  }

  // 비어 있는 몸 하나를 맡긴다. 어느 몸(= 어느 선수)부터 찾을지는 판의 씨앗과 막는 것의 번호로 정해, 같은 판이면 같은 선수가 나온다.
  // 그 몸이 쓰이고 있으면 다음 빈 몸으로 넘어간다
  function take(o, seed) {
    const from = o.kind === 'keeper' ? FIELD_RIGS : 0, count = from ? KEEPER_RIGS : FIELD_RIGS, start = hash2(seed, o.id) % count;
    let s = null;
    for (let i = 0; i < count && !s; i++) { const c = slots[from + (start + i) % count]; if (c.id === 0) s = c; }
    if (!s) return null;
    s.id = o.id; s.o = o; s.clip = s.from = s.last = null; s.rig.root.visible = true;
    byId.set(o.id, s);
    return s;
  }
  function release(s) {
    byId.delete(s.id);
    s.id = 0; s.o = null; s.rig.root.visible = false;
  }

  // 서 있는 선수에게 동작을 얹는다. 그때의 자리에 붙들어 두고, flip 이면 왼쪽(-x)으로 가는 쪽으로 뒤집는다.
  // 한 줄에 선 선수들이 같이 쓰러져도 박자가 어긋나게, 선수마다 빠르기를 조금 달리한다
  function play(s, def, flip, run) {
    const o = s.o, rel = o.d - run.dist;
    if (lying(o, rel)) return;
    s.clip = { def, dir: flip ? -1 : 1, t0: ctx.now, dur: def.dur * (0.9 + 0.25 * hash(o.id + 0.3)), x: o.x, d: o.d, rel, lying: false };
    s.from = s.last; s.fade = ctx.now;
  }

  let lit = null;   // 납작한 얼굴의 밝기를 맞춘 시간대 값

  return {
    reset() { for (const s of slots) if (s.id) release(s); },

    update(run, alpha) {
      const dist = run.pdist + (run.dist - run.pdist) * alpha, hx = run.px + (run.x - run.px) * alpha;
      const t = ctx.now, cap = RIGS[ctx.quality];
      let n = 0;
      if (ctx.mode !== 'home') dress(run);   // 첫 화면에서는 막는 선수가 보이지 않는다
      if (lit !== ctx.time) shadeFlats(faceLevel(lit = ctx.time));
      farField.count = farKeeper.count = 0;
      for (const s of slots) s.seen = false;
      // run.objs 는 가까운 것부터 놓여 있다
      for (const o of run.objs) {
        if (isPickup(o)) continue;
        const r = note(o, run.tick), s = n++ < cap ? byId.get(o.id) || take(o, run.seed) : null, c = s && s.clip;
        let x = r.px + (r.x - r.px) * alpha, rel = r.pd + (r.d - r.pd) * alpha - dist;
        if (o.down && !r.down) {
          r.down = { x, rel, lying: lying(o, rel) };
          if (s && !c) { s.from = s.last; s.fade = t; }
        }
        // 쓰러졌거나 동작을 하는 동안은 규칙이 옆으로 옮겨도 그 자리에 둔다
        if (c) { x = c.x; rel = c.d - dist; } else if (r.down) x = r.down.x;
        shape(o, r, x, rel, hx, alpha, t, run, c || r.down, !!s);
        if (c) put(c.def, Math.min(1, (t - c.t0) / c.dur), c.dir, true);
        else if (r.down && !r.down.lying) put(knockOf(o), 1, o.id % 2 ? 1 : -1, !!s);   // 멀리서 쓰러진 선수는 다 쓰러진 모습으로 나온다

        e.set(at.pitch, Math.PI + at.yaw, at.roll, 'YXZ');   // 이쪽을 보고 서서, 돌아선 다음 눕는다
        v.set(0, 1, 0).applyEuler(e);                        // 몸이 뻗은 쪽
        const mid = s || !at.mid ? at.mid : FAR_HIP;
        p.set(at.x - v.x * mid, at.y - v.y * mid, at.z - v.z * mid);
        ctx.blob(at.x + v.x * 0.2, at.z + v.z * 0.2, 0.45 + 0.4 * (1 - Math.abs(v.y)));   // 누운 몸은 골반에서 머리 쪽으로 조금 간 데가 한가운데다

        if (s) {
          s.seen = true;
          let pose = at.pose;
          if (s.from) {
            const k = (t - s.fade) / FADE;
            if (k >= 1) s.from = null; else pose = blend(s.from, pose, smooth(k));
          }
          s.last = pose;
          apply(s.rig, pose);
          s.rig.root.position.copy(p);
          s.rig.root.rotation.copy(e);
          if (s.flat) faceCamera(s.rig.j.head, ctx.camera);
        } else {
          const mesh = o.kind === 'keeper' ? farKeeper : farField;
          if (mesh.count < FAR_MAX) mesh.setMatrixAt(mesh.count++, m.compose(p, q.setFromEuler(e), ONE));
        }
      }
      for (const s of slots) if (s.id && !s.seen) release(s);
      farField.instanceMatrix.needsUpdate = farKeeper.instanceMatrix.needsUpdate = true;
    },

    onEvent(ev, run) {
      if (ev.type === 'move') {
        // 코앞에서 피하기 시작했다: 그 선수는 내 선수가 가는 반대쪽으로 헛디딘다
        for (const o of run.objs) { const s = o.beat && byId.get(o.id); if (s && !s.clip) play(s, CLIPS.beaten, ev.dir > 0, run); }
        return;
      }
      // 판이 끝나면 달려들던 선수도 멈춰 선다. 그 자세로 튀지 않고 넘어가게 한다
      if (ev.type === 'hit') for (const s of slots) if (s.id) { s.from = s.last; s.fade = ctx.now; }
      const s = byId.get(ev.id);
      if (!s) return;
      const hero = run.x - s.o.x;   // 내 선수가 있는 쪽
      if (ev.type === 'hit') play(s, CLIPS.tackle, hero > 0, run);   // 공은 내 선수 반대쪽 옆으로 끌어낸다
      else if (ev.type === 'knock') play(s, knockOf(s.o), hero > 0 || (hero === 0 && s.o.id % 2 === 1), run);
      else if (ev.type === 'beat' && !s.clip) play(s, CLIPS.beaten, hero > 0, run);
    },
  };
}
