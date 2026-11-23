import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step } from '../js/sim/run.js';
import { makeStand, makeCoin, makeItem } from '../js/sim/objects.js';
import { BOOST_TICKS, BOOST_MULT, speedAt } from '../js/sim/constants.js';
import { pilot } from './helpers/autopilot.js';

function runWith(...objs) {
  const run = createRun(1);
  run.track = null;
  run.objs.push(...objs);
  return run;
}
const rel = (run, o) => o.d - run.dist;
function play(run, until, plan = () => []) {
  const all = [];
  while (run.alive && run.dist < until) all.push(...step(run, plan(run)));
  return all;
}
const count = (ev, type) => ev.filter(e => e.type === type).length;

test('코인 줄을 지나가면 그만큼 줍는다', () => {
  const run = runWith(...[20, 21.5, 23, 24.5, 26].map((d, i) => makeCoin(i + 1, d, 2, 0.6)));
  const ev = play(run, 30);
  assert.equal(run.coins, 5);
  assert.equal(count(ev, 'coin'), 5);
  assert.equal(run.objs.length, 0);
});

test('다른 레인의 코인은 줍지 않는다', () => {
  const run = runWith(makeCoin(1, 20, 3, 0.6));
  play(run, 30);
  assert.equal(run.coins, 0);
});

test('높이 뜬 코인은 뛰어야 줍는다', () => {
  const low = runWith(makeCoin(1, 30, 2, 1.6));
  play(low, 40);
  assert.equal(low.coins, 0);
  const coin = makeCoin(1, 30, 2, 1.6), high = runWith(coin);
  let sent = false;
  play(high, 40, r => (!sent && rel(r, coin) < 2.8 ? (sent = true, ['U']) : []));
  assert.equal(high.coins, 1);
});

test('아이템을 먹으면 4초 동안 빨라지고 막는 선수를 쓰러뜨린다', () => {
  // 2번은 차 낸 공에, 3·4번은 빨라진 선수에게 닿아 쓰러진다. 4초 동안 60m 쯤 간다
  const run = runWith(makeItem(1, 10, 2), makeStand(2, 40, 2), makeStand(3, 60, 2), makeStand(4, 65, 2));
  let boosted = null;
  const ev = [];
  while (run.alive && run.dist < 100) {
    ev.push(...step(run));
    if (run.boost === BOOST_TICKS - 1) boosted = run.speed / speedAt(run.dist);
  }
  assert.equal(run.alive, true);
  assert.equal(count(ev, 'item'), 1);
  assert.ok(Math.abs(boosted - BOOST_MULT) < 0.01, `x${boosted}`);
  assert.deepEqual(ev.filter(e => e.type === 'knock').map(e => e.id).sort(), [2, 3, 4]);
});

test('먹는 순간 앞의 선수는 공이 닿는 차례대로 쓰러진다', () => {
  const run = runWith(makeItem(1, 10, 2), makeStand(2, 30, 0), makeStand(3, 45, 4));
  const at = {};
  while (run.dist < 30) for (const e of step(run)) if (e.type === 'knock') at[e.id] = run.tick;
  assert.ok(at[2] < at[3], JSON.stringify(at));
  assert.ok(run.objs.every(o => o.down));
});

test('아이템이 끝난 뒤 1초 동안은 앞이 비어 있다', () => {
  const stands = [];
  for (let d = 20, id = 2; d < 600; d += 3) stands.push(makeStand(id++, d, 2));
  const run = runWith(makeItem(1, 10, 2), ...stands);
  let endTick = null;
  while (run.alive && run.dist < 600) {
    for (const e of step(run)) if (e.type === 'boostEnd') endTick = run.tick;
    if (endTick !== null && run.tick === endTick + 60) assert.equal(run.alive, true, '끝난 지 1초 안에 부딪혔다');
  }
  assert.notEqual(endTick, null);
  assert.equal(run.alive, false);
  assert.ok(run.tick > endTick + 60 && run.tick < endTick + 200, `${run.tick - endTick}틱 뒤에 끝났다`);
});

test('코앞에서 피하면 제친 것으로 친다', () => {
  const o = makeStand(1, 30, 2), run = runWith(o);
  let sent = false;
  const ev = play(run, 40, r => (!sent && rel(r, o) < 2 ? (sent = true, ['R']) : []));
  assert.equal(run.alive, true);
  assert.equal(run.beats, 1);
  assert.deepEqual(ev.filter(e => e.type === 'beat'), [{ type: 'beat', id: 1 }]);
});

test('멀리서 피하면 제친 것이 아니다', () => {
  const o = makeStand(1, 30, 2), run = runWith(o);
  let sent = false;
  play(run, 40, r => (!sent && rel(r, o) < 10 ? (sent = true, ['R']) : []));
  assert.equal(run.beats, 0);
});

// 한 판의 코인을 모두 모은다: 길을 따라가며 본 코인마다 { d, lane, h }
const coinsOf = (seed, far) => {
  const run = createRun(seed), seen = new Map();
  pilot(run, far, r => { for (const o of r.objs) if (o.kind === 'coin' && o.d < far) seen.set(o.id, o); });
  return { run, coins: [...seen.values()] };
};

test('길에 코인이 1,000m 에 250~400개쯤 놓인다', () => {
  let total = 0;
  for (let seed = 1; seed <= 20; seed++) total += coinsOf(seed, 1000).coins.length;
  assert.ok(total / 20 >= 250 && total / 20 <= 400, `평균 ${total / 20}개`);
});

test('코인은 모두 땅 위 높이에 놓인다: 태클 위로 호를 그리지 않는다', () => {
  for (const seed of [3, 8, 21]) for (const c of coinsOf(seed, 2000).coins) assert.equal(c.h, 0.6, `seed ${seed} d=${c.d}`);
});

test('코인은 막는 줄의 바로 앞에서 그친다: 줄을 뚫고 이어져 뚫린 레인을 알려 주지 않는다', () => {
  for (const seed of [3, 8, 21]) {
    const run = createRun(seed), rows = new Map(), coins = new Map();
    pilot(run, 2000, r => {
      for (const row of r.track.rows) rows.set(row.d, row);
      for (const o of r.objs) if (o.kind === 'coin') coins.set(o.id, o);
    });
    for (const c of coins.values()) for (const d of rows.keys()) assert.ok(Math.abs(c.d - d) >= 1.19, `seed ${seed}: 코인 ${c.d.toFixed(1)}m 가 줄 ${d.toFixed(1)}m 에 붙어 있다`);
  }
});

test('달리는 내내 코인이 이어진다: 코인 없이 달리는 구간이 2.5초를 넘지 않는다', () => {
  for (const seed of [3, 8, 21, 40]) {
    const ds = coinsOf(seed, 1500).coins.map(c => c.d).sort((a, b) => a - b);
    for (let i = 1; i < ds.length; i++) {
      const sec = (ds[i] - ds[i - 1]) / speedAt(ds[i]);
      assert.ok(sec <= 2.5, `seed ${seed}: ${ds[i - 1].toFixed(0)}m 뒤 ${sec.toFixed(1)}초 동안 코인이 없다`);
    }
  }
});

test('아이템은 300~400m 에 하나씩 나온다', () => {
  const run = createRun(4), at = new Map();
  pilot(run, 3000, r => { for (const o of r.objs) if (o.kind === 'item') at.set(o.id, o.d); });
  const ds = [...at.values()].sort((a, b) => a - b);
  assert.ok(ds.length >= 6, `${ds.length}개`);
  for (let i = 1; i < ds.length; i++) assert.ok(ds[i] - ds[i - 1] >= 300 && ds[i] - ds[i - 1] <= 440, `${ds[i - 1]} → ${ds[i]}`);
});
