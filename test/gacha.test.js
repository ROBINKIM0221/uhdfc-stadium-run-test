import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/ui/store.js';
import { DRAW_COST, poolOf, draw } from '../js/ui/gacha.js';
import { mulberry32 } from '../js/sim/rng.js';

const fresh = coins => { const s = createStore(null).state; s.coins = coins; return s; };

test('뽑기 한 번은 코인 300개', () => assert.equal(DRAW_COST, 300));

test('처음에는 선수 32명과 필드 유니폼 4벌이 풀에 있다', () => {
  const pool = poolOf(fresh(0));
  assert.equal(pool.filter(x => x.type === 'player').length, 32);
  assert.deepEqual(pool.filter(x => x.type === 'kit').map(x => x.id).sort(), ['away', 'fourth', 'retro', 'third']);
  assert.ok(!pool.some(x => x.type === 'player' && x.id === 10));
});

test('코인이 모자라면 뽑히지 않는다', () => {
  const s = fresh(99);
  assert.equal(draw(s, mulberry32(1)), null);
  assert.equal(s.coins, 99);
  assert.deepEqual(s.players, [10]);
});

test('뽑으면 코인이 줄고 가진 것에 들어가며 풀에서 빠진다', () => {
  const s = fresh(DRAW_COST + 150), got = draw(s, mulberry32(2));
  assert.equal(s.coins, 150);
  assert.ok((got.type === 'player' ? s.players : s.kits).includes(got.id));
  assert.ok(!poolOf(s).some(x => x.type === got.type && x.id === got.id));
});

test('골키퍼 유니폼은 골키퍼를 가진 뒤부터 나온다', () => {
  const s = fresh(0);
  assert.ok(!poolOf(s).some(x => String(x.id).startsWith('gk')));
  s.players.push(21);
  assert.deepEqual(poolOf(s).filter(x => x.type === 'kit' && String(x.id).startsWith('gk')).map(x => x.id).sort(), ['gk25a', 'gk25h', 'gk26a']);
});

test('39번 뽑으면 다 모으고, 같은 것이 두 번 나오지 않는다', () => {
  const s = fresh(DRAW_COST * 50), rnd = mulberry32(7), seen = new Set();
  for (let i = 0; i < 39; i++) {
    const got = draw(s, rnd);
    assert.notEqual(got, null, `${i + 1}번째`);
    const key = got.type + ':' + got.id;
    assert.ok(!seen.has(key), key);
    seen.add(key);
  }
  assert.equal(s.players.length, 33);
  assert.equal(s.kits.length, 9);
  assert.equal(poolOf(s).length, 0);
  assert.equal(draw(s, rnd), null);
  assert.equal(s.coins, DRAW_COST * 11);
});
