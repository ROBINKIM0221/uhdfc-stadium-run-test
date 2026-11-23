import test from 'node:test';
import assert from 'node:assert/strict';
import { timeAt, mixTime, TIMES } from '../js/render/daynight.js';

test('timeAt: 500m 까지 낮, 1,200m 에 노을, 1,900m 부터 밤', () => {
  assert.equal(timeAt(0), 0);
  assert.equal(timeAt(500), 0);
  assert.equal(timeAt(850), 0.5);
  assert.equal(timeAt(1200), 1);
  assert.equal(timeAt(1550), 1.5);
  assert.equal(timeAt(1900), 2);
  assert.equal(timeAt(3000), 2);
});

test('timeAt: 거리가 늘면 줄어들지 않는다', () => {
  for (let d = 0, prev = 0; d <= 2500; d += 7) {
    const k = timeAt(d);
    assert.ok(k >= prev && k <= 2, `${d}m: ${k}`);
    prev = k;
  }
});

test('mixTime: 낮과 노을 사이는 두 값의 사이', () => {
  const m = mixTime(0.5);
  assert.ok(m.fog[0] < TIMES.day.fog[0] && m.fog[0] > TIMES.dusk.fog[0], `fog ${m.fog}`);
  assert.equal(m.fog[1], 205);
  assert.ok(m.lamps > 0 && m.lamps < TIMES.dusk.lamps);
  assert.ok(m.sun.power > TIMES.day.lights[0][1] && m.sun.power < TIMES.dusk.lights[0][1]);
  assert.ok(m.hemi[2] > TIMES.day.hemi[2] && m.hemi[2] < TIMES.dusk.hemi[2]);
});

test('mixTime: 0·1·2 에서는 낮·노을·밤 값 그대로', () => {
  for (const [k, name] of [[0, 'day'], [1, 'dusk'], [2, 'night']]) {
    const m = mixTime(k), tm = TIMES[name];
    assert.deepEqual(m.fog, tm.fog);
    assert.equal(m.lamps, tm.lamps);
    assert.equal(m.exposure, tm.exposure);
    assert.deepEqual(m.sun.pos, tm.lights[0][2]);
    assert.equal(m.sky.length, 3);
    assert.equal('#' + m.sky[2].getHexString(), tm.sky[2]);
    assert.equal('#' + m.roof.getHexString(), tm.roof);
  }
});

test('mixTime: 범위를 벗어난 값은 낮이나 밤으로 붙는다', () => {
  assert.deepEqual(mixTime(-1).fog, TIMES.day.fog);
  assert.deepEqual(mixTime(5).fog, TIMES.night.fog);
});
