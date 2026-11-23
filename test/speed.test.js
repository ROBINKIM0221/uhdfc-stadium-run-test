import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEED0, SPEED_MAX, BOOST_MULT, BALL_SPEED, speedAt } from '../js/sim/constants.js';

test('달릴수록 빨라진다: 500m 에서 처음의 1.6배, 1000m 에서 1.9배를 넘는다', () => {
  assert.equal(speedAt(0), SPEED0);
  assert.ok(speedAt(500) >= SPEED0 * 1.6, `500m ${speedAt(500)}`);
  assert.ok(speedAt(1000) >= SPEED0 * 1.9, `1000m ${speedAt(1000)}`);
  for (let d = 0; d < 5000; d += 50) assert.ok(speedAt(d + 50) > speedAt(d), `${d}m 에서 멈췄다`);
  assert.ok(speedAt(1e6) <= SPEED_MAX);
});

test('차 낸 공은 아이템으로 빨라진 선수보다 넉넉히 빠르다', () => {
  assert.ok(BALL_SPEED >= SPEED_MAX * BOOST_MULT * 1.5, `공 ${BALL_SPEED}, 선수 ${SPEED_MAX * BOOST_MULT}`);
});
