import test from 'node:test';
import assert from 'node:assert/strict';
import { JOINTS, sample } from '../js/render/anim.js';
import { stance, bake, JOCKEY, SHUFFLE, SPRINT, COIL, KEEPER_READY, GUARD0, KEEPER0, LIE_BACK, LIE_SIDE, CLIPS, KNOCKS } from '../js/render/clips-def.js';

// 자세에서 관절의 자리를 되짚는다. rig.js 의 뼈 길이와 관절 회전 순서(x 다음 y 다음 z 축 차례로 곱함)를 따른다
const HIP_X = 0.126, HIP_Y = 0.805, BONE = 0.35, ANKLE = 0.105;
const rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mul = (a, b) => a.map((_, i) => { const r = i - i % 3, c = i % 3; return a[r] * b[c] + a[r + 1] * b[c + 3] + a[r + 2] * b[c + 6]; });
const rot = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
const eul = ([x, y, z]) => [rx(x), ry(y), rz(z)].reduce(mul);
const add = (a, b) => a.map((v, i) => v + b[i]);

// 선 자리에 놓인 몸의 관절들. place 는 defenders.js 가 몸을 놓는 값(동작의 path): 골반이 (x, y, z) 에 오고 pitch·yaw·roll 로 눕는다.
// 없으면 발밑이 원점인 선 몸이고, 자리는 몸의 왼쪽이 -x, 앞이 -z 다. 있으면 경기장 기준(오른쪽 +x, 내 선수 쪽 +z)이다
function joints(pose, place) {
  const r = pose.root, turn = place ? [ry(Math.PI + place.yaw), rx(place.pitch), rz(place.roll)].reduce(mul) : rx(0);
  const body = mul(turn, mul(ry(r.yaw), rz(r.lean))), hips = mul(body, eul(pose.hips)), spine = mul(hips, eul(pose.spine));
  const J = { hips: place ? [place.x, place.y, place.z] : rot(body, [r.x, HIP_Y + r.y, 0]) };
  const waist = add(J.hips, rot(hips, [0, 0.035, 0]));
  J.head = add(waist, rot(spine, [0, 0.756, 0]));
  for (const [s, side] of [[-1, 'L'], [1, 'R']]) {
    const sh = mul(spine, eul(pose['sh' + side])), el = mul(sh, eul(pose['el' + side]));
    const elbow = add(add(waist, rot(spine, [s * 0.25, 0.434, 0])), rot(sh, [0, -0.289, 0]));
    J['hand' + side] = add(elbow, rot(el, [0, -0.3, 0]));
    const hp = mul(hips, eul(pose['hp' + side])), kn = mul(hp, eul(pose['kn' + side]));
    J['knee' + side] = add(add(J.hips, rot(hips, [s * HIP_X, 0, 0])), rot(hp, [0, -BONE, 0]));
    J['ankle' + side] = add(J['knee' + side], rot(kn, [0, -BONE, 0]));
    J['boot' + side] = mul(kn, eul(pose['an' + side]));
  }
  return J;
}
// 동작의 u 시점에 놓인 몸
const placed = (clip, u) => joints(sample(clip, u), sample(clip.path, u).root);
const span = (J, axis) => { const v = Object.values(J).filter(p => p.length === 3).map(p => p[axis]); return [Math.min(...v), Math.max(...v)]; };

const close = (a, b, eps, what) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} != ${b}`);
const full = (p, what) => { for (const k of [...JOINTS, 'root']) assert.ok(p[k], `${what}: ${k} 없음`); };
const SINK = 0.005;   // 발끝을 든 발은 뒤꿈치가 땅에 닿아 발목이 이만큼까지 낮아진다
const ARMS = { spine: [0, 0, 0], shL: [0, 0, 0], elL: [0, 0, 0], shR: [0, 0, 0], elR: [0, 0, 0] };

test('stance: 몸을 돌리고 기울여도 두 발이 말한 자리에, 말한 방향으로 놓인다', () => {
  const cases = [
    [{ y: -0.12 }, [-0.3, 0, 0], [0.3, 0, 0], {}],
    [{ x: -0.3, y: -0.25 }, [-0.9, 0, -0.2], [0.15, 0, 0.05], {}],
    [{ x: 0.05, y: -0.3, yaw: 0.4, lean: 0.1 }, [-0.06, 0.05, -0.4, 0.2, 0.3, 0.2], [0.32, 0, 0.15, -0.3, -0.4, -0.3], { hips: [-0.2, 0.3, 0.1] }],
    [{ x: 0.1, y: -0.2, yaw: -0.6 }, [-0.2, 0.3, 0.35, 0, 0, 0.5], [0.5, 0.1, -0.3], { hips: [0.1, -0.2, -0.15] }],
  ];
  for (const [root, L, R, upper] of cases) {
    const J = joints({ ...ARMS, ...stance(root, L, R, upper) });
    for (const [side, foot] of [['L', L], ['R', R]]) {
      const toe = foot[3] || 0, turn = foot[4] || 0, at = J['ankle' + side];
      // 발끝을 내리면 앞꿈치가 땅에 남고 발목이 올라간다
      const lift = foot[1] + 0.068 + 0.037 * Math.cos(toe) + 0.16 * Math.max(0, -Math.sin(toe));
      close(at[0], foot[0], 1e-9, `${side} x`); close(at[1], lift, 1e-9, `${side} y`); close(at[2], foot[2], 1e-9, `${side} z`);
      const want = [-Math.sin(turn) * Math.cos(toe), Math.sin(toe), -Math.cos(turn) * Math.cos(toe)];
      rot(J['boot' + side], [0, 0, -1]).forEach((v, i) => close(v, want[i], 1e-9, `${side} 발끝이 향한 쪽`));
    }
  }
});

test('stance: 닿지 않는 자리면 그쪽으로 다리를 다 편다', () => {
  const p = stance({ x: 0, y: 0 }, [-2, 0, -1], [0.126, 0, -3], {});
  for (const k of ['hpL', 'knL', 'anL', 'hpR', 'knR', 'anR']) assert.ok(p[k].every(Number.isFinite), k);
  const a = joints({ ...ARMS, ...p }).ankleR;
  close(Math.hypot(a[0] - HIP_X, a[1] - HIP_Y, a[2]), BONE * 2, 0.01, '다리 길이');
  assert.ok(a[2] < -0.6, '앞으로 뻗는다');
});

test('서서 하는 몸놀림은 모든 관절을 채우고 발이 땅 밑으로 내려가지 않는다', () => {
  const standing = { GUARD0, KEEPER0 };
  for (let t = 0; t < 6; t += 0.37) {
    standing[`JOCKEY(${t.toFixed(2)})`] = JOCKEY(t, 3, Math.sin(t) * 2, 0.5, t % 1, 0.9);
    standing[`KEEPER_READY(${t.toFixed(2)})`] = KEEPER_READY(t, 2, Math.cos(t));
    standing[`COIL(${t.toFixed(2)})`] = COIL(t, 5);
    standing[`SPRINT(${t.toFixed(2)})`] = SPRINT(t, t % 1);
  }
  for (let c = 0; c <= 3; c += 0.05) standing[`SHUFFLE(${c.toFixed(2)})`] = SHUFFLE(c, c < 1.5 ? 0.75 : 1, 0.3, 4, 0.5, 1 - c / 1.5);
  for (const [name, p] of Object.entries(standing)) {
    full(p, name);
    const J = joints(p);
    for (const side of ['L', 'R']) assert.ok(J['ankle' + side][1] > ANKLE - SINK, `${name}: ${side} 발이 땅을 뚫는다`);
  }
  assert.equal(SPRINT(1).ball, undefined);
});

test('JOCKEY: 선수마다 서는 버릇이 다르고, 내 선수 쪽으로 뻗은 발은 말한 거리에 닿는다', () => {
  const sides = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(id => Math.sign(JOCKEY(0, id).hips[1])));
  assert.equal(sides.size, 2, '왼발을 앞에 둔 선수와 오른발을 앞에 둔 선수가 섞여 있다');
  close(joints(JOCKEY(1, 3, 1.2, 1, 1, 0.9)).ankleL[0], -0.9, 1e-6, '왼쪽(aim > 0)으로 뻗은 발');
  close(joints(JOCKEY(1, 3, -1.2, 1, 1, 0.9)).ankleR[0], 0.9, 1e-6, '오른쪽으로 뻗은 발');
});

test('SHUFFLE: 디딘 발은 미끄러지지 않고, 두 발은 엇갈리지 않으며, 걸음 바퀴마다 끊기지 않고 되풀이된다', () => {
  for (const S of [0.75, 1]) {
    const planted = { L: null, R: null };
    for (let c = 0; c <= 3; c += 0.01) {
      const J = joints(SHUFFLE(c, S)), ph = c - Math.floor(c);
      assert.ok(J.ankleR[0] - J.ankleL[0] > 0.2, `S=${S} c=${c.toFixed(2)}: 두 발 사이 ${J.ankleR[0] - J.ankleL[0]}`);
      // 몸은 왼쪽(-x)으로 c·S 만큼 갔다. 땅에 닿아 있는 발의 경기장 자리는 그대로여야 한다
      for (const side of ['L', 'R']) {
        const down = J['ankle' + side][1] < ANKLE + 1e-6, x = J['ankle' + side][0] - c * S;
        if (down && planted[side] !== null) close(x, planted[side], 1e-6, `S=${S} c=${c.toFixed(2)} ${side} 발이 미끄러진다`);
        planted[side] = down && ph > 0.005 && Math.abs(ph - 0.5) > 0.005 ? x : null;
      }
    }
    const a = SHUFFLE(0.3, S, 1), b = SHUFFLE(1.3, S, 1), e = SHUFFLE(0.9999, S, 1), f = SHUFFLE(1.0001, S, 1);
    for (const k of JOINTS) a[k].forEach((v, i) => { close(v, b[k][i], 1e-9, k); close(e[k][i], f[k][i], 0.01, `${k} 이음매`); });
  }
});

test('bake: 골반이 움직여도 디딘 발과 짚은 손은 제자리에 남고, ride 로 적은 자리는 골반을 따라간다', () => {
  const base = { t: 0, P: [0, 0.7, 0], rot: [0, 0, 0], twist: 0, hips: [0, 0, 0], spine: [-0.3, 0, 0], head: [0, 0, 0], L: [-0.3, 0, 0], R: [0.3, 0, 0], HL: [-0.5, 0.8, -0.3], HR: [0.4, 1.3, -0.2] };
  const fixed = bake([base, { t: 0.5, P: [0.2, 0.6, -0.15], rot: [0.1, 0.4, 0.15], twist: 0.2, hips: [-0.2, 0.1, 0], spine: [-0.5, 0.3, 0.1] }]);
  // 구운 길은 경기장 기준이라 x 와 z 의 부호가 뒤집힌다
  for (const u of [0, 0.3, 0.7, 1]) {
    const J = placed(fixed, u);
    [['ankleL', [0.3, ANKLE, 0]], ['ankleR', [-0.3, ANKLE, 0]], ['handL', [0.5, 0.8, 0.3]], ['handR', [-0.4, 1.3, 0.2]]]
      .forEach(([k, want]) => want.forEach((v, i) => close(J[k][i], v, 1e-6, `u=${u} ${k}[${i}]`)));
  }
  const riding = placed(bake([{ ...base, ride: true }, { t: 0.5, P: [0.5, 0.7, -1] }]), 1);
  close(riding.ankleL[0], 0.3 - 0.5, 1e-6, '따라간 발 x'); close(riding.handR[2], 0.2 + 1, 1e-6, '따라간 손 z');
  const stepping = bake([base, { t: 0.5, L: [-0.3, 0, -0.3] }]);
  assert.ok(placed(stepping, 0.5).ankleL[1] > ANKLE + 0.05, '옮겨 딛는 발은 들었다 놓는다');
  close(placed(stepping, 1).ankleL[1], ANKLE, 1e-6, '옮겨 디딘 발');
});

test('동작: 끝 자세에 머물고, 키마다 온몸과 골반의 길을 다 적으며, 서서 시작한다', () => {
  const FIELDS = ['x', 'y', 'z', 'pitch', 'roll', 'yaw'];
  for (const [name, clip] of Object.entries(CLIPS)) {
    const keys = clip.path.keys;
    assert.ok(clip.hold, `${name}: 끝 자세에 머문다`);
    assert.equal(keys.length, clip.keys.length, name);
    for (const k of clip.keys) full(k, `${name}@${k.t}`);
    assert.equal(keys[0].t, 0, name); assert.equal(keys.at(-1).t, 1, name);
    for (const f of ['pitch', 'roll', 'yaw']) assert.equal(keys[0].root[f], 0, `${name}: 처음 ${f}`);
    assert.ok(keys[0].root.y > 0.6, `${name}: 서서 시작한다`);
    keys.forEach((k, i) => {
      assert.deepEqual(Object.keys(k.root).sort(), [...FIELDS].sort(), `${name}[${i}]`);
      assert.ok(Object.values(k.root).every(Number.isFinite), `${name}[${i}]`);
      close(k.root.y, clip.keys[i].root.y + HIP_Y, 1e-9, `${name}[${i}]: 자세의 골반 높이는 길의 높이와 같다`);
      if (i) assert.ok(k.t > keys[i - 1].t, `${name}[${i}] 순서`);
    });
  }
  for (const name of ['tackle', 'beaten']) for (let u = 0; u <= 1; u += 0.02) {
    const J = placed(CLIPS[name], u);
    for (const side of ['L', 'R']) assert.ok(J['ankle' + side][1] > ANKLE - SINK, `${name}@${u.toFixed(2)}: ${side} 발이 땅을 뚫는다`);
  }
  full(LIE_BACK, 'LIE_BACK'); full(LIE_SIDE, 'LIE_SIDE');
});

test('누운 몸은 막는 레인을 덮고 낮으며, 땅 밑으로 꺼지지 않는다', () => {
  const LANE = 1.5;
  // 한 레인 태클: 선 자리의 레인 안에 눕는다
  const one = placed(CLIPS.slide, 1);
  assert.ok(span(one, 0)[0] > -LANE / 2 && span(one, 0)[1] < LANE / 2, `한 레인 ${span(one, 0)}`);
  assert.ok(span(one, 2)[0] < -0.5 && span(one, 2)[1] > 0.5, `부딪히는 깊이를 덮는다 ${span(one, 2)}`);
  // 두 레인 태클: 두 레인 사이의 줄을 가운데로 양쪽 레인에 걸쳐 눕는다
  const [l, r] = span(placed(CLIPS.slideWide, 1), 0);
  assert.ok(l < -0.75 && l > -LANE && r > 0.75 && r < LANE, `두 레인 ${[l, r]}`);
  // 골키퍼: 선 레인에서 2.25m 옆(두 레인의 가운데)을 한가운데로 눕는다
  const [a, b] = span(placed(CLIPS.save, 1), 0);
  close((a + b) / 2, 1.5 * LANE, 0.15, '골키퍼 몸의 가운데');
  assert.ok(b - a > 1.7 && a > LANE * 0.5 && b < LANE * 2.5, `골키퍼 ${[a, b]}`);
  for (const clip of [CLIPS.slide, CLIPS.slideWide, CLIPS.save, ...KNOCKS]) {
    const [bottom, top] = span(placed(clip, 1), 1);
    assert.ok(bottom > 0.02 && top < 0.75, `높이 ${[bottom, top]}`);
  }
  // 태클은 내달리는 동안 옆 레인으로 벗어나지 않는다
  for (const clip of [CLIPS.slide, CLIPS.slideWide]) for (let u = 0; u < clip.drop; u += 0.02) close(sample(clip.path, u).root.x, 0, 0.1, '내달리는 길');
});
