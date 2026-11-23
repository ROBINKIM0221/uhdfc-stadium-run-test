import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step } from '../js/sim/run.js';
import { JUMP_H, laneX } from '../js/sim/constants.js';

// 명령 하나를 넣고 n 틱을 돌린다. 나온 이벤트를 모아 돌려준다
function go(run, n, first = []) {
  const all = [];
  for (let i = 0; i < n; i++) all.push(...step(run, i === 0 ? first : []));
  return all;
}

test('1초에 12m 남짓 나아간다', () => {
  const run = createRun(1);
  go(run, 60);
  assert.ok(run.dist >= 12.1 && run.dist <= 12.3, `dist=${run.dist}`);
  assert.equal(run.tick, 60);
});

test('오른쪽으로 밀면 17틱 뒤 옆 레인에 선다', () => {
  const run = createRun(1);
  const ev = go(run, 17, ['R']);
  assert.equal(run.lane, 3);
  assert.equal(run.x, laneX(3));
  assert.equal(run.move, null);
  assert.deepEqual(ev.filter(e => e.type === 'move'), [{ type: 'move', dir: 1, index: 0 }]);
});

test('옆으로 가는 동안 가로 위치는 두 레인 사이에 있다', () => {
  const run = createRun(1);
  go(run, 8, ['R']);
  assert.ok(run.x > 0 && run.x < 1.5, `x=${run.x}`);
  assert.ok(run.px < run.x);
});

test('이동 중에 온 입력은 하나 기억했다가 이어서 한다', () => {
  const run = createRun(1);
  step(run, ['R']);
  step(run, ['R']);
  go(run, 32);
  assert.equal(run.lane, 4);
  assert.equal(run.x, laneX(4));
  assert.equal(run.moves, 2);
});

test('기억하는 입력은 하나뿐이고 나중 것이 남는다', () => {
  const run = createRun(1);
  step(run, ['R']);
  step(run, ['R']);
  step(run, ['L']);
  go(run, 40);
  assert.equal(run.lane, 2);
});

test('끝 레인에서 바깥으로 밀면 제자리다', () => {
  const run = createRun(1);
  go(run, 17, ['R']);
  go(run, 17, ['R']);
  const ev = go(run, 17, ['R']);
  assert.equal(run.lane, 4);
  assert.deepEqual(ev, [{ type: 'bump', dir: 1 }]);
});

test('위로 밀면 18틱에 꼭대기, 36틱에 땅', () => {
  const run = createRun(1);
  const moves = events => events.filter(e => e.type !== 'coin');   // 출발선부터 놓인 코인을 줍는 것은 여기서 보지 않는다
  const up = go(run, 18, ['U']);
  assert.ok(Math.abs(run.y - JUMP_H) < 0.01, `y=${run.y}`);
  assert.deepEqual(moves(up), [{ type: 'jump' }]);
  const down = go(run, 18);
  assert.equal(run.y, 0);
  assert.deepEqual(moves(down), [{ type: 'land' }]);
});

test('떠 있는 동안에도 옆으로 간다', () => {
  const run = createRun(1);
  step(run, ['U']);
  go(run, 17, ['L']);
  assert.equal(run.lane, 1);
  assert.ok(run.y > 0);
});

test('이동 중에 위로 밀면 이동이 끝난 뒤 뛴다', () => {
  const run = createRun(1);
  step(run, ['R']);
  step(run, ['U']);
  go(run, 14);
  assert.equal(run.air, 0);
  const ev = go(run, 2);
  assert.ok(ev.some(e => e.type === 'jump'));
});

test('같은 틱의 입력은 첫 것만 먹는다', () => {
  const run = createRun(1);
  step(run, ['L', 'R']);
  go(run, 30);
  assert.equal(run.lane, 1);
});

test('끝난 판은 더 나아가지 않는다', () => {
  const run = createRun(1);
  go(run, 10);
  run.alive = false;
  const before = JSON.stringify(run);
  assert.deepEqual(step(run, ['R']), []);
  assert.equal(JSON.stringify(run), before);
});

test('같은 씨앗과 같은 입력이면 결과가 같다', () => {
  const play = () => { const r = createRun(42); go(r, 5, ['R']); go(r, 30, ['U']); go(r, 200, ['L']); return JSON.stringify(r); };
  assert.equal(play(), play());
});
