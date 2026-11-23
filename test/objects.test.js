import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step } from '../js/sim/run.js';
import { makeStand, makeShift, makeRush, makeSlide, makeKeeper, boxOf } from '../js/sim/objects.js';
import { laneX, LANE_W, HIT_DX } from '../js/sim/constants.js';

// 막는 것을 직접 놓은 판. 길 만들기는 끈다
function runWith(...objs) {
  const run = createRun(1);
  run.track = null;
  run.objs.push(...objs);
  return run;
}
const rel = (run, o) => o.d - run.dist;
// 끝나거나 dist 가 until 을 넘을 때까지 돌린다. plan(run) 이 그 틱의 입력을 준다
function play(run, until, plan = () => []) {
  const all = [];
  while (run.alive && run.dist < until) all.push(...step(run, plan(run)));
  return all;
}

test('서 있는 수비수에게 달려가면 공을 뺏긴다', () => {
  const o = makeStand(1, 30, 2), run = runWith(o);
  const ev = play(run, 40);
  assert.equal(run.alive, false);
  assert.deepEqual(ev.at(-1), { type: 'hit', id: 1 });
  assert.ok(run.dist > 29 && run.dist < 30.7, `dist=${run.dist}`);
});

test('닿기 전에 옆 레인으로 가면 산다', () => {
  const run = runWith(makeStand(1, 30, 2));
  let sent = false;
  play(run, 40, r => (!sent && r.dist > 20 ? (sent = true, ['R']) : []));
  assert.equal(run.alive, true);
});

test('몸 상자가 겹칠 때만 부딪힌다', () => {
  const near = makeStand(1, 30, 2); near.x = HIT_DX - 0.01;
  const far = makeStand(1, 30, 2); far.x = HIT_DX + 0.01;
  const a = runWith(near), b = runWith(far);
  play(a, 40); play(b, 40);
  assert.equal(a.alive, false);
  assert.equal(b.alive, true);
});

test('슬라이딩 태클은 뛰어서 넘는다', () => {
  const o = makeSlide(1, 40, 2, 1), run = runWith(o);
  let sent = false;
  play(run, 50, r => (!sent && rel(r, o) < 2.8 ? (sent = true, ['U']) : []));
  assert.equal(run.alive, true);
});

test('슬라이딩 태클을 땅에서 만나면 끝난다', () => {
  const run = runWith(makeSlide(1, 40, 2, 1));
  play(run, 50);
  assert.equal(run.alive, false);
});

test('두 레인짜리 태클은 두 레인을 다 막고 옆은 비운다', () => {
  const box = boxOf(makeSlide(1, 40, 1, 2));
  assert.equal(box.low, true);
  for (const lane of [1, 2]) assert.ok(Math.abs(laneX(lane) - box.x) < box.halfW, `lane ${lane}`);
  for (const lane of [0, 3]) assert.ok(Math.abs(laneX(lane) - box.x) > box.halfW, `lane ${lane}`);
});

test('서 있는 수비수는 뛰어도 못 넘는다', () => {
  const o = makeStand(1, 40, 2), run = runWith(o);
  let sent = false;
  play(run, 50, r => (!sent && rel(r, o) < 2.8 ? (sent = true, ['U']) : []));
  assert.equal(run.alive, false);
});

test('골키퍼는 멀리서는 선 자리를 막는다', () => {
  const box = boxOf(makeKeeper(1, 80, 3, -1));
  assert.deepEqual(box, { x: laneX(3), halfW: HIT_DX, low: false });
});

test('골키퍼는 미리 몸을 날려 옆 두 레인에 눕고 선 자리를 비운다', () => {
  const o = makeKeeper(1, 80, 3, -1), run = runWith(o);
  let downAt = null;
  while (rel(run, o) > 1) { step(run); if (o.state === 'down' && downAt === null) downAt = rel(run, o) / run.speed; }
  const box = boxOf(o);
  assert.equal(o.state, 'down');
  assert.equal(box.low, true);
  for (const lane of [1, 2]) assert.ok(Math.abs(laneX(lane) - box.x) < box.halfW, `lane ${lane}`);
  for (const lane of [0, 3, 4]) assert.ok(Math.abs(laneX(lane) - box.x) > box.halfW, `lane ${lane}`);
  assert.ok(downAt > 0.8, `누운 때가 도착 ${downAt}초 전`);
});

test('골키퍼가 날아가는 동안에는 부딪히지 않는다', () => {
  const o = makeKeeper(1, 80, 3, -1), run = runWith(o);
  let flying = 0;
  while (rel(run, o) > 1) { step(run); if (o.state === 'fly') { flying++; assert.equal(boxOf(o), null); } }
  assert.equal(flying, 33);
});

test('골키퍼가 서 있던 레인으로 지나가면 산다', () => {
  const o = makeKeeper(1, 80, 3, -1), run = runWith(o);
  let sent = false;
  play(run, 90, r => (!sent && rel(r, o) < 6 ? (sent = true, ['R']) : []));
  assert.equal(run.alive, true);
});

test('달려드는 수비수는 서 있는 수비수보다 먼저 닿는다', () => {
  const rush = makeRush(1, 60, 0), stand = makeStand(2, 60, 4), run = runWith(rush, stand);
  let tRush = null, tStand = null;
  while (run.dist < 70) {
    step(run);
    if (tRush === null && rush.d - run.dist <= 0) tRush = run.tick;
    if (tStand === null && stand.d - run.dist <= 0) tStand = run.tick;
  }
  assert.ok(tRush < tStand - 5, `${tRush} vs ${tStand}`);
});

test('옆으로 움직이는 수비수는 두 레인 사이만 오간다', () => {
  const o = makeShift(1, 500, 1, 3, 120, 0), run = runWith(o);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 300; i++) { step(run); min = Math.min(min, o.x); max = Math.max(max, o.x); }
  assert.ok(min >= laneX(1) - 1e-9 && max <= laneX(3) + 1e-9);
  assert.ok(min < laneX(1) + 0.05 && max > laneX(3) - 0.05, `${min}..${max}`);
});

test('지나친 것은 지운다', () => {
  const run = runWith(makeStand(1, 30, 0));
  play(run, 45);
  assert.equal(run.objs.length, 0);
  assert.equal(LANE_W, 1.5);
});
