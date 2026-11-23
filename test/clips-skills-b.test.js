import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/render/three.js';
import { apply, layer, mirror, sample, JOINTS } from '../js/render/anim.js';
import { RUN, CLIPS, BALL_R } from '../js/render/clips-hero.js';
import { settle, runOut, gone, DRIFT } from '../js/render/clip-tools.js';
import { SKILLS_B } from '../js/render/clips-skills-b.js';
import { LANE_W } from '../js/sim/constants.js';

const MOVES = ['shotFeint', 'cruyff', 'chop', 'mcgeady', 'hocusPocus'];
const STILL = [], SLOW = { cruyff: 1.2 };   // 옆 레인으로 가지 않는 동작과, 디딘 발이 느리게 밀리는 동작(그 빠르기)
const mid = ([toe, heel]) => toe.clone().lerp(heel, 0.5);

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

test('기술 다섯 가지가 제 이름으로 들어 있고, 길이가 약속한 범위다. 호커스 포커스만 한 벌이다', () => {
  assert.deepEqual(Object.keys(SKILLS_B).sort(), [...MOVES].sort());
  for (const name of MOVES) {
    assert.equal(CLIPS[name], SKILLS_B[name], name);
    assert.equal(!!CLIPS[name].far, name !== 'hocusPocus', name);
  }
  for (const [name, clip] of variants(MOVES)) assert.ok(clip.dur >= 0.45 && clip.dur <= 0.7, name);
});

test('달리기 위에 얹어 섞어도, 골반을 올려 맞춘 뒤에는 발이 잔디 밑으로 내려가지 않는다', () => {
  for (const [name, clip, far] of variants(MOVES)) for (const flip of [false, true]) for (const ph of PHASES) for (const u of steps(60)) {
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
  shotFeint: [['R', 0.134, 0.136]],
  "shotFeint.far": [['L', 0.04, 0.04], ['R', 0.13, 0.14]],
  cruyff: [['L', 0.09, 0.138]],
  "cruyff.far": [['L', 0.06, 0.108]],
  chop: [['L', 0.133, 0.137]],
  "chop.far": [['L', 0.03, 0.04], ['L', 0.13, 0.14]],
  mcgeady: [['R', 0.04, 0.13], ['L', 0.186, 0.194]],
  "mcgeady.far": [['L', 0.04, 0.13], ['R', 0.185, 0.195]],
  hocusPocus: [['R', 0.12, 0.127]],
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
  shotFeint: [['L', 0.043, 0.136], ['R', 0.275, 0.39]],
  "shotFeint.far": [['R', 0.005, 0.04], ['L', 0.066, 0.136], ['R', 0.283, 0.39]],
  cruyff: [['R', 0.056, 0.146], ['R', 0.275, 0.394]],
  "cruyff.far": [['R', 0.026, 0.1], ['R', 0.275, 0.394]],
  chop: [['R', 0.215, 0.328]],
  "chop.far": [['R', 0.215, 0.328]],
  mcgeady: [['L', 0.025, 0.12], ['R', 0.163, 0.335]],
  "mcgeady.far": [['R', 0.025, 0.12], ['L', 0.163, 0.25], ['R', 0.28, 0.328]],
  hocusPocus: [['R', 0.005, 0.066], ['L', 0.09, 0.114], ['R', 0.275, 0.39]],
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
  for (const [name, clip, far] of variants(MOVES)) for (const key of clip.keys.filter(k => k.t >= 0.76)) {
    const run = runOut(clip.dur, key.t * clip.dur, far);
    for (const side of ['L', 'R']) assert.ok(ankleOf(key, side).distanceTo(ankleOf(run, side)) < 1e-6, `${name} t=${key.t.toFixed(2)}: ${side} 발이 달리기와 다른 자리에 있다`);
    for (const k of ['spine', 'head', 'shL', 'shR', 'elL', 'elR']) for (const i of [0, 1, 2]) assert.ok(Math.abs(key[k][i] - run[k][i]) < 1e-9, `${name} t=${key.t.toFixed(2)}: ${k}`);
  }
});

test('기술마다 그 기술로 알아볼 모양이 있다', () => {
  const early = (name, sec = 0.3) => steps(200).map(u => ({ sec: u * clipOf(name).dur, ...sample(clipOf(name), u) })).filter(p => p.sec <= sec);
  // 슛 페인팅: 오른발이 뒤로 높이 젖혀진다
  for (const name of ['shotFeint', 'shotFeint.far']) assert.ok(early(name, 0.2).some(p => { const m = mid(boots(p).R); return m.z > 0.4 && m.y > 0.35; }), `${name}: 오른다리를 뒤로 젖히지 않는다`);
  // 크루이프 턴: 몸이 가는 쪽으로 옆을 보고, 공이 디딘 오른발의 뒤꿈치 뒤를 돌아 그 발 바깥으로 나온다
  for (const name of ['cruyff', 'cruyff.far']) {
    assert.ok(early(name).some(p => p.root.yaw < -0.9), `${name}: 몸이 옆으로 돌지 않는다`);
    assert.ok(early(name).some(p => { const m = mid(boots(p).R); return p.ball.z > m.z + 0.2 && p.ball.x > m.x + 0.1; }), `${name}: 공이 디딘 발 뒤로 오지 않는다`);
    assert.ok(early(name).every(p => p.root.y < 0.05), `${name}: 찹처럼 뜨면 안 된다`);
  }
  // 찹: 몸이 뜨고, 뜬 동안 두 발이 다 땅에서 떨어진다
  for (const name of ['chop', 'chop.far']) {
    const up = early(name, 0.2).filter(p => p.root.y >= 0.25);
    assert.ok(up.length && up.every(p => lowest(p) > 0.15), `${name}: 뛰어오르지 않는다`);
  }
  // 맥기디 스핀: 마르세유 턴과 반대쪽(왼쪽)으로 한 바퀴 돌고, 공이 튄다
  for (const name of ['mcgeady', 'mcgeady.far']) {
    const yaws = early(name, 1).map(p => p.root.yaw);
    assert.ok(Math.max(...yaws) > Math.PI * 2 - 0.01 && Math.min(...yaws) >= 0, `${name}: 왼쪽으로 한 바퀴 돌지 않는다`);
    assert.ok(early(name, 0.35).some(p => p.ball.y > BALL_R + 0.1), `${name}: 공이 튀지 않는다`);
  }
  // 호커스 포커스: 오른발이 선 왼발의 뒤 왼쪽에 가 있고(다리가 꼬임), 공도 선 발의 왼쪽에 있다
  assert.ok(early('hocusPocus', 0.25).some(p => { const b = boots(p); return mid(b.R).x < mid(b.L).x - 0.25 && mid(b.R).z > mid(b.L).z && p.ball.x < mid(b.L).x - 0.15; }), 'hocusPocus: 다리가 꼬이지 않는다');
});
