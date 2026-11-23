import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, rand, hash2 } from '../js/sim/rng.js';

test('같은 씨앗이면 같은 수열', () => {
  const a = mulberry32(7), b = mulberry32(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('0 이상 1 미만이고 고르게 퍼진다', () => {
  const r = mulberry32(123);
  let sum = 0;
  for (let i = 0; i < 20000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); sum += v; }
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.01);
});

test('상태를 들고 다니는 난수는 mulberry32 와 같은 값을 낸다', () => {
  const st = { s: 99 }, r = mulberry32(99);
  for (let i = 0; i < 5; i++) assert.equal(rand(st), r());
});

test('hash2 는 인자에 따라 달라지는 부호 없는 정수다', () => {
  const h = hash2(1, 2);
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xFFFFFFFF);
  assert.notEqual(h, hash2(2, 1));
  assert.equal(h, hash2(1, 2));
});
