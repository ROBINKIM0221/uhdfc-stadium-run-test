import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, pickSkill } from '../js/data/skills.js';

test('기술은 14개다', () => {
  assert.equal(SKILLS.length, 14);
  assert.equal(new Set(SKILLS.map(s => s.id)).size, 14);
});

test('같은 판의 같은 차례에는 같은 기술이 나온다', () => {
  assert.equal(pickSkill(7, 3, null), pickSkill(7, 3, null));
  const picks = new Set();
  for (let i = 0; i < 40; i++) picks.add(pickSkill(7, i, null));
  assert.ok(picks.size > 5);
});

test('바로 앞에 나온 기술은 다시 나오지 않는다', () => {
  for (let i = 0; i < 3000; i++) assert.notEqual(pickSkill(11, i, 'stepOver'), 'stepOver');
});

test('누구로 달려도 14가지 기술이 모두 같은 몫으로 나온다', () => {
  const N = 28000, c = {};
  let last = null;
  for (let i = 0; i < N; i++) { last = pickSkill(5, i, last); c[last] = (c[last] || 0) + 1; }
  for (const s of SKILLS) assert.ok(Math.abs(c[s.id] / N - 1 / 14) < 0.008, `${s.id}: ${(c[s.id] / N).toFixed(3)}`);
});
