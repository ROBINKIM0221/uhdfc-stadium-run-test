import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, replay } from '../js/sim/run.js';
import { mulberry32 } from '../js/sim/rng.js';
import { pilot } from './helpers/autopilot.js';

test('씨앗과 입력 기록으로 같은 판이 다시 나온다', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const run = createRun(seed);
    pilot(run, 1200);
    const again = replay(seed, run.log, run.tick);
    assert.deepEqual(again, { dist: run.dist, coins: run.coins, tick: run.tick, alive: true }, `seed ${seed}`);
    assert.ok(run.log.length > 10);
  }
});

test('끝난 판도 같은 자리에서 끝난다', () => {
  const run = createRun(9);
  while (run.alive) step(run);
  assert.deepEqual(replay(9, run.log), { dist: run.dist, coins: run.coins, tick: run.tick, alive: false });
});

test('아무 입력이나 넣어도 예외 없이 끝까지 돈다', () => {
  const r = mulberry32(5), log = [];
  for (let t = 0; t < 3000; t += 1 + Math.floor(r() * 20)) log.push([t, 'LRU'[Math.floor(r() * 3)]]);
  const out = replay(123, log, 3000);
  assert.ok(out.tick <= 3000 && out.dist > 0);
});

test('입력 기록에는 틱과 명령이 차례로 쌓인다', () => {
  const run = createRun(1);
  step(run); step(run, ['R']); step(run); step(run, ['U', 'L']);
  assert.deepEqual(run.log, [[1, 'R'], [3, 'U']]);
});
