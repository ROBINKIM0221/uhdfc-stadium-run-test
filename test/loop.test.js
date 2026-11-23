import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSteps, MAX_STEPS } from '../js/loop.js';
import { TICK } from '../js/sim/constants.js';

test('clampSteps: 한 프레임은 한 틱, 길게 끊겨도 다섯 틱까지', () => {
  assert.equal(clampSteps(0.016), 1);
  assert.equal(clampSteps(0.5), 5);
  assert.equal(clampSteps(0), 0);
  assert.equal(MAX_STEPS, 5);
});

test('clampSteps: 음수나 숫자가 아닌 값은 0', () => {
  assert.equal(clampSteps(-1), 0);
  assert.equal(clampSteps(NaN), 0);
});

test('clampSteps: 쌓인 시간에서 틱을 덜어 내면 화면 주사율과 상관없이 초당 60틱이 된다', () => {
  for (const hz of [30, 60, 90, 144]) {
    let acc = 0, ticks = 0;
    for (let f = 0; f < hz * 10; f++) {
      acc += 1 / hz;
      const n = clampSteps(acc);
      acc -= n * TICK; ticks += n;
      assert.ok(Math.abs(acc) <= TICK / 2 + 1e-9, `${hz}Hz 에서 남은 시간이 반 틱을 넘는다`);
    }
    assert.ok(Math.abs(ticks - 600) <= 1, `${hz}Hz: ${ticks}`);
  }
});
