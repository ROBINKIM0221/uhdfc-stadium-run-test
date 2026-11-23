import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/ui/store.js';

// localStorage 흉내
function memory(initial) {
  const m = new Map(initial ? [[initial[0], initial[1]]] : []);
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), dump: () => [...m.entries()] };
}
const FRESH = { v: 1, coins: 0, best: 0, players: [10], kits: ['home', 'gk26h'], player: 10, kit: 'home', gkKit: 'gk26h', sound: true, seen: { hint: false } };

test('저장소가 없어도 기본값으로 돈다', () => {
  const store = createStore(null);
  assert.deepEqual(store.state, FRESH);
  store.save();
  assert.deepEqual(store.addRun({ dist: 12.9, coins: 3 }), { best: true });
});

test('저장소가 예외를 던져도 기본값으로 돈다', () => {
  const broken = { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } };
  const store = createStore(broken);
  assert.deepEqual(store.state, FRESH);
  assert.doesNotThrow(() => store.save());
});

test('깨진 값이 들어 있으면 기본값으로 돌아간다', () => {
  for (const raw of ['{not json', '"글자"', 'null', '[1,2]']) {
    const mem = memory();
    mem.setItem('uhd-dribble-run', raw);
    assert.deepEqual(createStore(mem).state, FRESH, raw);
  }
});

test('저장한 것을 다시 읽으면 같다', () => {
  const mem = memory(), a = createStore(mem);
  a.state.coins = 250; a.state.players.push(21, 99); a.state.kits.push('away'); a.state.player = 99; a.state.kit = 'away'; a.state.sound = false; a.state.seen.hint = true;
  a.save();
  assert.deepEqual(createStore(mem).state, a.state);
});

test('명단에 없는 번호와 모르는 유니폼은 버린다', () => {
  const mem = memory();
  mem.setItem('uhd-dribble-run', JSON.stringify({ v: 1, coins: 40, best: 300, players: [10, 7, 21, 'x'], kits: ['home', 'gk26h', 'gold'], player: 7, kit: 'gold', gkKit: 'nope' }));
  const s = createStore(mem).state;
  assert.deepEqual(s.players, [10, 21]);
  assert.deepEqual(s.kits, ['home', 'gk26h']);
  assert.equal(s.player, 10);
  assert.equal(s.kit, 'home');
  assert.equal(s.gkKit, 'gk26h');
  assert.equal(s.coins, 40);
  assert.equal(s.best, 300);
});

test('갖지 않은 선수와 유니폼은 고를 수 없고, 처음 것은 늘 갖고 있다', () => {
  const mem = memory();
  mem.setItem('uhd-dribble-run', JSON.stringify({ players: [21], kits: ['away'], player: 99, kit: 'third', gkKit: 'gk25a' }));
  const s = createStore(mem).state;
  assert.deepEqual(s.players, [10, 21]);
  assert.deepEqual(s.kits, ['home', 'gk26h', 'away']);
  assert.equal(s.player, 10);
  assert.equal(s.kit, 'home');
  assert.equal(s.gkKit, 'gk26h');
});

test('이상한 숫자는 0 으로 본다', () => {
  const mem = memory();
  mem.setItem('uhd-dribble-run', JSON.stringify({ coins: -5, best: 'far' }));
  const s = createStore(mem).state;
  assert.equal(s.coins, 0);
  assert.equal(s.best, 0);
});

test('판이 끝나면 코인을 더하고 최고 기록일 때만 알린다', () => {
  const mem = memory(), store = createStore(mem);
  assert.deepEqual(store.addRun({ dist: 320.7, coins: 12 }), { best: true });
  assert.deepEqual(store.addRun({ dist: 150.2, coins: 5 }), { best: false });
  assert.deepEqual(store.addRun({ dist: 320.9, coins: 0 }), { best: false });
  assert.equal(store.state.coins, 17);
  assert.equal(store.state.best, 320);
  assert.equal(createStore(mem).state.coins, 17);
});
