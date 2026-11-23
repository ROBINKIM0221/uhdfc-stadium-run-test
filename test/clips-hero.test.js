import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/render/three.js';
import { apply, layer, mirror, sample, JOINTS } from '../js/render/anim.js';
import { RUN, CLIPS, BALL_R, KICK_AT } from '../js/render/clips-hero.js';
import { lowest as low, settle, runOut, gone, DRIFT } from '../js/render/clip-tools.js';
import { JUMP_TICKS, JUMP_H, TICK, LANE_W } from '../js/sim/constants.js';

const MOVES = ['cut', 'bodyFeint', 'stepOver', 'marseille', 'flipFlap'];
const STILL = ['kick'], SLOW = {};   // 옆 레인으로 가지 않는 동작과, 디딘 발이 느리게 밀리는 동작

// rig.js 와 같은 길이의 뼈대. 그물 없이 관절만 세워 발이 어디로 가는지 잰다
const THIGH = 0.35, SHIN = 0.35, FOOT_H = 0.105, HIP_X = 0.126;
function skeleton() {
  const node = (parent, x = 0, y = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, 0); parent.add(o); return o; };
  const root = new THREE.Object3D(), body = node(root), j = { hips: node(body, 0, THIGH + SHIN + FOOT_H) };
  for (const k of ['spine', 'head', 'shL', 'elL', 'shR', 'elR']) j[k] = node(j.hips);
  for (const [s, x] of [['L', -HIP_X], ['R', HIP_X]]) {
    j['hp' + s] = node(j.hips, x); j['kn' + s] = node(j['hp' + s], 0, -THIGH); j['an' + s] = node(j['kn' + s], 0, -SHIN);
  }
  return { root, body, j, legLen: THIGH + SHIN + FOOT_H };
}

// 신발은 발목 아래에 앞뒤로 누운 캡슐이다: 양 끝 공의 가운데(발목 기준)와 반지름
const BOOT = [[0, -0.037, -0.16], [0, -0.037, 0.004]], BOOT_R = 0.068;
const rig = skeleton();
// 자세를 넣었을 때 신발 양 끝의 자리. { L: [앞, 뒤], R: [앞, 뒤] }
function boots(pose) {
  apply(rig, pose);
  rig.root.updateMatrixWorld(true);
  const ends = s => BOOT.map(p => rig.j['an' + s].localToWorld(new THREE.Vector3(...p)));
  return { L: ends('L'), R: ends('R') };
}
const lowest = pose => Math.min(...Object.values(boots(pose)).flat().map(p => p.y)) - BOOT_R;
// 신발 겉과 공 겉 사이의 틈(m). 닿아 있으면 0 언저리고, 음수면 파고든 것이다
function gap(pose, side) {
  const [a, b] = boots(pose)[side], ball = new THREE.Vector3(pose.ball.x, pose.ball.y, pose.ball.z);
  return new THREE.Line3(a, b).closestPointToPoint(ball, true, new THREE.Vector3()).distanceTo(ball) - BALL_R - BOOT_R;
}
// 자세를 넣었을 때 발목의 자리
function ankleOf(pose, side) {
  apply(rig, pose);
  rig.root.updateMatrixWorld(true);
  return rig.j['an' + side].getWorldPosition(new THREE.Vector3());
}
const PHASES = [0, 1.1, 2.3, 3.6, 5];
const steps = n => Array.from({ length: n + 1 }, (_, i) => i / n);
const between = (from, to, n = 20) => steps(n).map(k => from + (to - from) * k);
// 옆으로 가는 동작의 두 벌: [이름, 동작, 공이 먼 쪽에 있을 때의 것인지]. 이름 뒤의 .far 가 먼 쪽 것이다
const variants = names => names.flatMap(n => [[n, CLIPS[n], false], ...(CLIPS[n].far ? [[n + '.far', CLIPS[n].far, true]] : [])]);
const clipOf = name => (name.endsWith('.far') ? CLIPS[name.slice(0, -4)].far : CLIPS[name]);
const at = (name, sec) => sample(clipOf(name), sec / clipOf(name).dur);

test('옆으로 가는 동작마다 두 벌이 있고, 길이가 약속한 범위다. 플릭은 체공 시간과 같다', () => {
  for (const name of MOVES) {
    assert.ok(CLIPS[name].far, `${name}: 공이 먼 쪽에 있을 때의 것이 없다`);
    for (const clip of [CLIPS[name], CLIPS[name].far]) assert.ok(clip.dur >= 0.45 && clip.dur <= 0.7, name);
  }
  assert.ok(Math.abs(CLIPS.rainbow.dur - JUMP_TICKS * TICK) < 1e-9, '플릭은 체공 시간과 같다');
  assert.equal(CLIPS.jump, undefined, '쓰지 않는 뛰어넘기 동작은 없다');
});

test('달리는 발은 디딜 때 땅에 닿고, 어느 순간에도 잔디 밑으로 내려가지 않는다', () => {
  for (const k of [0, 0.5, 1]) {
    const lows = steps(80).map(u => lowest(RUN(u * Math.PI * 2, k)));
    assert.ok(Math.min(...lows) > -0.012, `k=${k}: ${Math.min(...lows).toFixed(3)}`);
    assert.ok(lows.filter(v => v < 0.02).length >= 40, `k=${k}: 땅에 닿아 있는 순간이 너무 적다`);
  }
});

test('발이 땅에서 뜬 높이를 뼈대로 잰 값과 식으로 잰 값이 같다', () => {
  for (const ph of PHASES) for (const u of steps(10)) {
    const pose = layer(RUN(ph + u * 6), CLIPS.stepOver, u, u > 0.5);
    assert.ok(Math.abs(low(pose) - lowest(pose)) < 1e-6, `phase=${ph} u=${u}: ${low(pose)} / ${lowest(pose)}`);
  }
  const run = RUN(1, 0.5), up = { ...run, root: { ...run.root, y: 0.1 } };
  assert.equal(settle(up), up, '땅 위에 떠 있는 자세는 그대로 둔다');
});

test('달리기 위에 얹어 섞어도, 골반을 올려 맞춘 뒤에는 발이 잔디 밑으로 내려가지 않는다', () => {
  for (const [name, clip, far] of [...variants(MOVES), ['rainbow', CLIPS.rainbow, false], ['kick', CLIPS.kick, false]]) for (const flip of [false, true]) for (const ph of PHASES) for (const u of steps(60)) {
    // 먼 쪽 것은 반대 발로 공을 모는 달리기 위에 얹힌다
    const base = far ? mirror(RUN(ph + u * 6 + Math.PI)) : RUN(ph + u * 6), mixed = layer(base, clip, u, flip), fixed = settle(mixed);
    assert.ok(lowest(fixed) > -1e-6, `${name} flip=${flip} phase=${ph} u=${u}: ${lowest(fixed).toFixed(3)}`);
  }
});

test('공은 달리기의 공 자리에서 출발해 0.35초 안에 옆 레인에 닿고, 끝에는 앞을 보며 달리기의 공 자리에 있다', () => {
  for (const [name, clip, far] of variants(MOVES)) {
    const dur = clip.dur, ps = steps(100).map(u => ({ sec: u * dur, ...sample(clip, u) })), end = ps.at(-1), run = runOut(dur, dur, far).ball;
    for (const key of clip.keys) for (const k of JOINTS) assert.ok(key[k].every(Number.isFinite), `${name} t=${key.t}: ${k}`);
    assert.ok(Math.abs(ps[0].ball.x - (far ? -0.43 : 0.43)) < 1e-9, `${name}: 공이 모는 발 앞에서 출발하지 않는다`);
    assert.ok(ps.some(p => p.sec <= 0.35 && p.ball.x + gone(p.sec) >= LANE_W + (far ? -0.6 : 0)), `${name}: 공이 제때 옆 레인으로 가지 않는다`);
    assert.ok(ps.every(p => p.ball.y >= BALL_R - 1e-9), `${name}: 공이 잔디에 묻힌다`);
    assert.ok(Math.hypot(end.ball.x - run.x, end.ball.y - run.y, end.ball.z - run.z) < 1e-6, `${name}: 끝에 공이 달리기의 공 자리에 없다`);
    assert.ok(Math.abs(end.root.yaw) < 1e-9, `${name}: 끝에 앞을 보지 않는다`);
  }
});

// 공을 치거나 끄는 대목: [발, 시작 초, 끝 초]. 그동안 그 발이 공에 닿아 있어야 한다
const TOUCH = {
  cut: [['R', 0.083, 0.087]],
  "cut.far": [['L', 0.042, 0.05]],
  bodyFeint: [['R', 0.113, 0.117]],
  "bodyFeint.far": [['L', 0.04, 0.05], ['R', 0.112, 0.118]],
  stepOver: [['R', 0.042, 0.05], ['R', 0.198, 0.203]],
  "stepOver.far": [['L', 0.04, 0.05], ['R', 0.195, 0.205]],
  marseille: [['L', 0.04, 0.13], ['R', 0.185, 0.29]],
  "marseille.far": [['L', 0.04, 0.13], ['R', 0.185, 0.29]],
  flipFlap: [['R', 0.04, 0.092], ['R', 0.11, 0.15]],
  "flipFlap.far": [['L', 0.04, 0.09], ['L', 0.11, 0.15]],
};
test('공을 치고 끄는 동안 그 발이 공에 닿아 있고, 어느 때에도 발이 공을 뚫고 지나가지 않는다', () => {
  for (const [name, clip] of variants(MOVES)) {
    for (const [side, from, to] of TOUCH[name]) for (const sec of between(from, to)) {
      const g = gap(at(name, sec), side);
      assert.ok(Math.abs(g) < 0.06, `${name} ${side} ${sec.toFixed(3)}초: 발과 공 사이 ${g.toFixed(3)}m`);
    }
    for (const u of steps(300)) for (const side of ['L', 'R']) {
      const g = gap(sample(clip, u), side);
      assert.ok(g > -0.05, `${name} ${side} ${(u * clip.dur).toFixed(3)}초: ${g.toFixed(3)}m 파고든다`);
    }
  }
});

// 발을 디디고 있는 대목: [발, 시작 초, 끝 초]. 몸이 옆으로 건너가고 앞으로 달리는 동안에도 발목은 운동장의 그 자리에 있어야 한다
const PLANT = {
  cut: [['L', 0.025, 0.095], ['R', 0.215, 0.328]],
  "cut.far": [['R', 0.005, 0.065], ['L', 0.066, 0.092], ['R', 0.215, 0.328]],
  bodyFeint: [['R', 0.005, 0.065], ['L', 0.036, 0.095], ['R', 0.215, 0.328]],
  "bodyFeint.far": [['R', 0.005, 0.065], ['L', 0.066, 0.095], ['R', 0.215, 0.328]],
  stepOver: [['L', 0.005, 0.08], ['R', 0.098, 0.165], ['L', 0.18, 0.197], ['R', 0.275, 0.328]],
  "stepOver.far": [['R', 0.005, 0.055], ['R', 0.098, 0.165], ['L', 0.18, 0.197], ['R', 0.275, 0.328]],
  marseille: [['R', 0.025, 0.135], ['L', 0.165, 0.285], ['R', 0.32, 0.358]],
  "marseille.far": [['R', 0.025, 0.135], ['L', 0.165, 0.285], ['R', 0.32, 0.358]],
  flipFlap: [['L', 0.005, 0.07], ['R', 0.215, 0.328]],
  "flipFlap.far": [['R', 0.005, 0.07], ['L', 0.17, 0.19], ['R', 0.215, 0.328]],
  kick: [['R', 0.035, 0.2]],
};
test('디딘 발은 운동장에서 미끄러지지 않는다', () => {
  for (const name in PLANT) for (const [side, from, to] of PLANT[name]) {
    const lane = STILL.includes(name) ? 0 : 1, drift = SLOW[name.replace('.far', '')] ?? DRIFT;
    const spot = sec => { const p = ankleOf(at(name, sec), side); return new THREE.Vector2(p.x + lane * gone(sec), p.z - drift * sec); };
    for (const sec of between(from, to)) {
      const slip = spot(sec).distanceTo(spot(from));
      assert.ok(slip < 0.02, `${name} ${side} ${sec.toFixed(3)}초: ${slip.toFixed(3)}m 미끄러진다`);
    }
  }
});

test('끝부분은 달리기 자세 그대로라 달리기로 섞여 들 때 발이 튀지 않는다', () => {
  for (const [name, clip, far] of [...variants(MOVES), ['rainbow', CLIPS.rainbow, false], ['kick', CLIPS.kick, true]]) for (const key of clip.keys.filter(k => k.t >= 0.76)) {
    const run = runOut(clip.dur, key.t * clip.dur, far);
    for (const side of ['L', 'R']) assert.ok(ankleOf(key, side).distanceTo(ankleOf(run, side)) < 1e-6, `${name} t=${key.t.toFixed(2)}: ${side} 발이 달리기와 다른 자리에 있다`);
    for (const k of ['spine', 'head', 'shL', 'shR', 'elL', 'elR']) for (const i of [0, 1, 2]) assert.ok(Math.abs(key[k][i] - run[k][i]) < 1e-9, `${name} t=${key.t.toFixed(2)}: ${k}`);
  }
});

test('마르세유 턴은 가는 쪽(오른쪽)으로 한 바퀴를 돌아 제자리로 온다', () => {
  for (const [name, clip] of variants(['marseille'])) {
    const yaws = steps(200).map(u => sample(clip, u).root.yaw);
    assert.ok(Math.min(...yaws) < -Math.PI * 2 + 0.01, name);
    assert.equal(yaws.at(-1), 0, name);
  }
});

test('슛: 공을 맞히는 순간 왼발 끝이 공에 닿아 있다', () => {
  const pose = sample(CLIPS.kick, KICK_AT / CLIPS.kick.dur), toe = boots(pose).L[0];
  const far = toe.distanceTo(new THREE.Vector3(pose.ball.x, pose.ball.y, pose.ball.z)) - BALL_R - BOOT_R;
  assert.ok(far < 0.08, `발끝과 공 사이 ${far.toFixed(3)}m`);
});

test('레인보우 플릭: 공이 발뒤꿈치 뒤에서 떠서 머리 위를 넘어 앞에 떨어진다', () => {
  const dur = CLIPS.rainbow.dur, air = sec => JUMP_H * 4 * (sec / dur) * (1 - sec / dur);
  const ps = steps(120).map(u => ({ sec: u * dur, ...sample(CLIPS.rainbow, u) }));
  assert.ok(ps.filter(p => p.sec <= 0.12).every(p => p.ball.z > 0), '처음에 공이 발 뒤에 없다');
  // 발 자리는 떠 있는 몸에서 잰 값이라, 공의 높이에서 몸이 뜬 만큼을 빼고 견준다
  const carried = (sec, side) => { const p = at('rainbow', sec); return gap({ ...p, ball: { ...p.ball, y: p.ball.y - air(sec) } }, side); };
  for (const [sec, side] of [[0, 'R'], [0.07, 'R'], [0.12, 'L']]) assert.ok(Math.abs(carried(sec, side)) < 0.08, `${sec}초 ${side}: 발이 공에서 ${carried(sec, side).toFixed(3)}m 떨어져 있다`);
  assert.ok(ps.some(p => Math.abs(p.ball.z) < 0.3 && p.ball.y > air(p.sec) + 1.75 + BALL_R), '공이 머리 위를 넘지 않는다');
  const end = ps.at(-1).ball;
  assert.ok(end.z < -0.5 && Math.abs(end.y - BALL_R) < 1e-9, '끝에 공이 앞의 땅에 없다');
});

test('뺏김: 끝 자세에 머물고, 엉덩이를 대고 앉아 두 발이 땅에 닿아 있다', () => {
  const end = CLIPS.tackled.keys.at(-1);
  assert.equal(CLIPS.tackled.hold, true);
  assert.ok(end.root.y < -0.5, `골반 높이 ${end.root.y.toFixed(3)}`);
  assert.ok(Math.abs(lowest(end)) < 0.02, `발이 땅에서 ${lowest(end).toFixed(3)}m 떠 있다`);
});
