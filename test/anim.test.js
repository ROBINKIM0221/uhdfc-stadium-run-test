import test from 'node:test';
import assert from 'node:assert/strict';
import { JOINTS, sample, mirror, blend, apply, layer } from '../js/render/anim.js';
import { RUN, CLIPS as HERO } from '../js/render/clips-hero.js';
import { JOCKEY, LIE_BACK, LIE_SIDE, CLIPS as DEF } from '../js/render/clips-def.js';

const A = { hips: [0.1, 0.2, 0.3], shL: [1, 2, 3], shR: [4, 5, 6], root: { yaw: 0.5, y: -0.1, x: 0.2, lean: 0.3 }, ball: { x: 0.4, y: 0.15, z: -0.6 } };
const B = { hips: [0.3, 0.6, 0.9], shL: [3, 4, 5], shR: [6, 7, 8], root: { yaw: 1.5, y: -0.3, x: 0.4, lean: 0.5 }, ball: { x: 0.8, y: 0.35, z: -1 } };
const CLIP = { dur: 0.5, keys: [{ t: 0, ...A }, { t: 0.4, ease: 'lin', ...B }, { t: 1, ...A }] };

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('관절은 열세 개이고 좌우가 짝을 이룬다', () => {
  assert.equal(JOINTS.length, 13);
  for (const k of JOINTS) if (k.endsWith('L')) assert.ok(JOINTS.includes(k.slice(0, -1) + 'R'), k);
});

test('sample: 키가 놓인 시각에서는 그 키의 자세가 그대로 나온다', () => {
  assert.deepEqual(sample(CLIP, 0), A);
  assert.deepEqual(sample(CLIP, 0.4), B);
  assert.deepEqual(sample(CLIP, 1), A);
});

test('sample: 범위 밖은 양 끝 키에 붙는다', () => {
  assert.deepEqual(sample(CLIP, -0.5), A);
  assert.deepEqual(sample(CLIP, 2), A);
});

test('sample: 두 키 사이는 섞이고, ease 는 도착하는 키의 것을 쓴다', () => {
  const lin = sample(CLIP, 0.1);                 // 0 → 0.4 구간의 1/4, 직선
  near(lin.hips[0], 0.15); near(lin.root.yaw, 0.75); near(lin.ball.z, -0.7);
  const half = sample(CLIP, 0.7);                // 0.4 → 1 구간의 가운데, 기본은 부드럽게
  near(half.shL[0], 2);
  const early = sample(CLIP, 0.55);              // 같은 구간의 1/4: 부드럽게라 직선(2.5)보다 B 에 가깝다
  assert.ok(early.shL[0] > 2.5 && early.shL[0] < 3);
});

test('sample: 돌려준 자세를 고쳐도 동작 자료는 변하지 않는다', () => {
  const p = sample(CLIP, 0);
  p.hips[0] = 99; p.root.yaw = 99; p.ball.x = 99;
  assert.equal(CLIP.keys[0].hips[0], 0.1);
  assert.equal(CLIP.keys[0].root.yaw, 0.5);
  assert.equal(CLIP.keys[0].ball.x, 0.4);
});

test('mirror: 좌우 관절을 바꾸고 y·z 회전, 공의 x, 몸의 yaw·x·lean 을 뒤집는다', () => {
  const m = mirror(A);
  assert.deepEqual(m.shR, [1, -2, -3]);
  assert.deepEqual(m.shL, [4, -5, -6]);
  assert.deepEqual(m.hips, [0.1, -0.2, -0.3]);
  assert.deepEqual(m.ball, { x: -0.4, y: 0.15, z: -0.6 });
  assert.deepEqual(m.root, { yaw: -0.5, y: -0.1, x: -0.2, lean: -0.3 });
  assert.deepEqual(mirror(m), A);
  assert.equal(A.shL[1], 2);                     // 원래 자세는 그대로
});

test('blend: 양 끝은 두 자세 그대로, 가운데는 평균', () => {
  assert.deepEqual(blend(A, B, 0), A);
  assert.deepEqual(blend(A, B, 1), B);
  const h = blend(A, B, 0.5);
  near(h.hips[1], 0.4); near(h.root.lean, 0.4); near(h.ball.y, 0.25);
});

test('blend: 한쪽에만 있는 관절과 값은 그대로 남는다', () => {
  const part = { shL: [3, 4, 5], root: { yaw: 1.5 } };
  const p = blend(A, part, 1);
  assert.deepEqual(p.shL, [3, 4, 5]);
  assert.deepEqual(p.shR, A.shR);
  assert.deepEqual(p.root, { yaw: 1.5, y: -0.1, x: 0.2, lean: 0.3 });
  assert.deepEqual(p.ball, A.ball);
});

function fakeRig() {
  const j = {};
  for (const k of JOINTS) j[k] = { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0.8, z: 0 } };
  return { j, body: { rotation: { x: 0, y: 0, z: 0 } }, legLen: 0.8 };
}

test('apply: 관절 회전과 몸의 높이·기울기를 넣고, weight 만큼만 다가간다', () => {
  const rig = fakeRig();
  apply(rig, A);
  assert.deepEqual(rig.j.shL.rotation, { x: 1, y: 2, z: 3 });
  near(rig.j.hips.position.y, 0.7); near(rig.j.hips.position.x, 0.2);
  near(rig.body.rotation.y, 0.5); near(rig.body.rotation.z, 0.3);
  apply(rig, B, 0.5);
  near(rig.j.shL.rotation.x, 2); near(rig.j.hips.position.y, 0.6); near(rig.body.rotation.y, 1);
  assert.deepEqual(rig.j.spine.rotation, { x: 0, y: 0, z: 0 });   // 자세에 없는 관절은 건드리지 않는다
});

test('layer: 동작의 끝은 바탕 자세로 돌아가고, hold 동작은 끝 자세에 머문다', () => {
  const base = RUN(1), clip = { dur: 1, keys: [{ t: 0, shL: [9, 9, 9] }, { t: 1, shL: [9, 9, 9] }] };
  assert.deepEqual(layer(base, clip, 0.2).shL, [9, 9, 9]);
  assert.deepEqual(layer(base, clip, 1), base);
  assert.deepEqual(layer(base, { ...clip, hold: true }, 1).shL, [9, 9, 9]);
  assert.deepEqual(layer(base, clip, 0.2, true).shR, [9, -9, -9]);
});

// 동작 자료가 약속한 꼴인지: 키는 0 에서 1 까지 시간 순서, 이름은 아는 관절뿐
function checkPose(p, where) {
  for (const k in p) {
    if (k === 't' || k === 'ease') continue;
    if (k === 'root') { for (const f in p.root) assert.ok(['yaw', 'y', 'x', 'lean'].includes(f) && Number.isFinite(p.root[f]), `${where} root.${f}`); continue; }
    if (k === 'ball') { for (const f of ['x', 'y', 'z']) assert.ok(Number.isFinite(p.ball[f]), `${where} ball.${f}`); continue; }
    assert.ok(JOINTS.includes(k), `${where}: 모르는 관절 ${k}`);
    assert.ok(p[k].length === 3 && p[k].every(Number.isFinite), `${where} ${k}`);
  }
}

test('동작 자료: 키가 0 에서 시작해 1 에서 끝나고 시간 순서다', () => {
  for (const [name, clip] of [...Object.entries(HERO), ...Object.entries(DEF)]) {
    assert.ok(clip.dur > 0, name);
    assert.equal(clip.keys[0].t, 0, name);
    assert.equal(clip.keys.at(-1).t, 1, name);
    clip.keys.forEach((k, i) => { checkPose(k, `${name}[${i}]`); if (i) assert.ok(k.t > clip.keys[i - 1].t, `${name}[${i}] 순서`); });
  }
  for (const name of ['cut', 'kick', 'tackled']) assert.ok(HERO[name], name);
});

test('달리기와 수비 자세는 모든 관절을 채우고, 달리기는 한 바퀴마다 되풀이된다', () => {
  const full = (p, where) => { checkPose(p, where); for (const k of [...JOINTS, 'root']) assert.ok(p[k], `${where}: ${k} 없음`); };
  full(RUN(0.7), 'RUN'); full(JOCKEY(1.3), 'JOCKEY'); full(LIE_BACK, 'LIE_BACK'); full(LIE_SIDE, 'LIE_SIDE');
  assert.ok(RUN(0.7).ball, '달리기에는 공 자리가 있다');
  const a = RUN(0.7), b = RUN(0.7 + Math.PI * 2);
  for (const k of JOINTS) a[k].forEach((v, i) => near(v, b[k][i]));
  const l = RUN(0.7), r = RUN(0.7 + Math.PI);   // 반 바퀴 뒤에는 앞에 나온 다리가 바뀐다
  assert.ok((l.hpL[0] - l.hpR[0]) * (r.hpL[0] - r.hpR[0]) < 0);
});
