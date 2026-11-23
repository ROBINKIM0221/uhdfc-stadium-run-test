import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../js/sim/run.js';
import { tierAt } from '../js/sim/track.js';
import { lanesOf } from '../js/sim/patterns.js';
import { speedAt, MOVE_TICKS, TICK } from '../js/sim/constants.js';
import { pilot } from './helpers/autopilot.js';

// 한 판을 자동 조종으로 달리며 만들어진 줄을 전부 모은다
function rowsOf(seed, until) {
  const run = createRun(seed), seen = new Map();
  pilot(run, until, r => { for (const row of r.track.rows) seen.set(row.d, row); });
  return { run, rows: [...seen.values()].sort((a, b) => a.d - b.d) };
}

test('거리에 따라 난이도 단계가 오른다', () => {
  assert.deepEqual([0, 49, 50, 159, 160, 379, 380, 5000].map(tierAt), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('보장 레인만 따라가면 끝나지 않는다 (씨앗 300개, 3,000m)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const run = createRun(seed);
    pilot(run, 3000);
    assert.equal(run.alive, true, `seed ${seed} 가 ${Math.round(run.dist)}m 에서 끝났다`);
  }
});

test('줄 사이에는 옆으로 갈 시간이 있다', () => {
  for (const seed of [3, 17, 99]) {
    const { rows } = rowsOf(seed, 3000);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i], shift = Math.abs(b.safe - a.safe);
      const sec = (b.d - a.d) / speedAt(b.d);
      assert.ok(shift <= 2, `shift ${shift}`);
      assert.ok(sec >= 0.45 + MOVE_TICKS * TICK * shift - 1e-9, `seed ${seed} ${a.d}→${b.d}: ${sec}초에 ${shift}칸`);
    }
  }
});

test('첫 줄은 30m 부터, 처음 50m 는 서 있는 수비수 하나씩', () => {
  const { rows } = rowsOf(5, 400);
  assert.ok(rows[0].d >= 30);
  const early = rows.filter(r => r.d < 50);
  assert.ok(early.length >= 2);
  for (const r of early) assert.deepEqual(r.kinds, ['stand']);
});

// 줄의 종류는 그 줄에 놓인 것으로 가린다: 오가는 수비수가 있으면 shift, 태클이 있으면 slide, 골키퍼가 있으면 keeper
test('600m 를 넘으면 오가는 수비수·태클·골키퍼가 줄의 3분의 2를 넘는다', () => {
  let hard = 0, all = 0;
  for (const seed of [2, 8, 31, 77]) for (const r of rowsOf(seed, 3000).rows) {
    if (r.d < 600) continue;
    all++;
    if (['shift', 'slide', 'keeper'].some(k => r.kinds.includes(k))) hard++;
  }
  assert.ok(hard / all > 2 / 3, `${hard}/${all}`);
});

test('뒤로 가면 한 줄에 오가는 수비수 둘, 태클 둘이 같이 나오기도 한다', () => {
  const run = createRun(8), most = { shift: 0, slide: 0 };
  pilot(run, 3000, r => {
    for (const row of r.track.rows) for (const kind of ['shift', 'slide']) {
      most[kind] = Math.max(most[kind], r.objs.filter(o => o.kind === kind && Math.abs(o.d - row.d) < 0.01).length);
    }
  });
  assert.ok(most.shift >= 2 && most.slide >= 2, JSON.stringify(most));
});

// 줄마다 보장 레인 말고 비어 있는 레인의 수. 오가는 범위와 골키퍼가 몸을 날려 덮는 자리도 막힌 것으로 센다
function openLanes(seed, far) {
  const run = createRun(seed), open = new Map();
  pilot(run, far, r => {
    for (const row of r.track.rows) {
      if (open.has(row.d)) continue;
      const used = lanesOf(r.objs.filter(o => Math.abs(o.d - row.d) < 0.01 && o.kind !== 'coin' && o.kind !== 'item'));
      open.set(row.d, [0, 1, 2, 3, 4].filter(l => l !== row.safe && !used.has(l)).length);
    }
  });
  return [...open].map(([d, n]) => ({ d, n }));
}

test('뒤로 갈수록 줄이 촘촘히 막힌다: 380m 뒤에는 보장 레인 말고 빈 레인이 줄마다 평균 0.6개를 넘지 않는다', () => {
  for (const seed of [2, 8, 31]) {
    const rows = openLanes(seed, 3000), late = rows.filter(r => r.d >= 380), early = rows.filter(r => r.d < 50);
    const mean = list => list.reduce((s, r) => s + r.n, 0) / list.length;
    assert.ok(mean(late) <= 0.6, `seed ${seed}: 뒤쪽 평균 ${mean(late).toFixed(2)}개`);
    assert.ok(late.every(r => r.n <= 1), `seed ${seed}: 빈 레인이 둘 넘게 남은 줄이 있다`);
    assert.ok(mean(early) >= 3, `seed ${seed}: 처음 50m 는 한 명씩만 선다`);
  }
});

// 1,000m 를 달리는 동안 나온 막는 선수를 종류별로 세고, 걸린 시간으로 나눈다. 빨라져도 달라지지 않는 것은 초당 수다
function perSecond(kinds) {
  let n = 0, sec = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const run = createRun(seed), seen = new Set();
    pilot(run, 1000, r => { for (const o of r.objs) if (o.d < 1000 && kinds(o.kind)) seen.add(o.id); });
    n += seen.size; sec += run.tick * TICK;
  }
  return n / sec;
}

test('1,000m 를 달리는 동안 막는 선수가 1초에 2.5명 넘게 지나간다', () => {
  const rate = perSecond(k => k !== 'coin' && k !== 'item');
  assert.ok(rate >= 2.5, `1초에 ${rate.toFixed(2)}명`);
});

test('달려드는 수비수가 1초에 0.26명 넘게 나온다', () => {
  const rate = perSecond(k => k === 'rush');
  assert.ok(rate >= 0.26, `1초에 ${rate.toFixed(3)}명`);
});

test('줄 사이에 선 수비수는 앞줄의 보장 레인에서 다음 줄의 보장 레인으로 가는 길을 막지 않는다', () => {
  let between = 0;
  for (const seed of [2, 8, 31]) {
    const run = createRun(seed), rows = new Map(), objs = new Map();
    pilot(run, 2500, r => {
      for (const row of r.track.rows) rows.set(row.d, row);
      for (const o of r.objs) if (o.kind !== 'coin' && o.kind !== 'item' && o.kind !== 'rush') objs.set(o.id, { d: o.d, lanes: [...lanesOf([o])] });
    });
    const list = [...rows.values()].sort((a, b) => a.d - b.d);
    for (const o of objs.values()) {
      if (list.some(r => Math.abs(r.d - o.d) < 0.01)) continue;
      const i = list.findIndex(r => r.d > o.d);
      if (i < 1) continue;
      between++;
      const lo = Math.min(list[i - 1].safe, list[i].safe), hi = Math.max(list[i - 1].safe, list[i].safe);
      for (const l of o.lanes) assert.ok(l < lo || l > hi, `seed ${seed}: ${o.d.toFixed(1)}m 의 수비수가 ${lo}~${hi} 레인을 막는다`);
    }
  }
  assert.ok(between >= 30, `줄 사이에 선 수비수가 ${between}명뿐이다`);
});

test('뒤로 가면 보장 레인이 거의 줄마다 옆으로 옮겨 간다', () => {
  let moved = 0, all = 0;
  for (const seed of [2, 8, 31, 40, 77]) {
    const rows = rowsOf(seed, 3000).rows.filter(r => r.d >= 380);
    for (let i = 1; i < rows.length; i++) { all++; if (rows[i].safe !== rows[i - 1].safe) moved++; }
  }
  assert.ok(moved / all >= 0.85, `${(moved / all).toFixed(2)}`);
});

test('3,000m 안에 다섯 종류가 모두 나온다', () => {
  const kinds = new Set(rowsOf(8, 3000).rows.flatMap(r => r.kinds));
  assert.deepEqual([...kinds].sort(), ['keeper', 'rush', 'shift', 'slide', 'stand']);
});

test('막는 것은 보장 레인에 놓이지 않는다', () => {
  const run = createRun(21);
  pilot(run, 2000, r => {
    for (const row of r.track.rows) for (const o of r.objs) {
      if (Math.abs(o.d - row.d) > 0.01 || !['stand', 'slide'].includes(o.kind)) continue;
      const lanes = o.kind === 'slide' ? Array.from({ length: o.width }, (_, i) => o.lane + i) : [o.lane];
      assert.ok(!lanes.includes(row.safe), `${o.kind} 가 보장 레인 ${row.safe} 를 막는다 (d=${row.d})`);
    }
  });
});

test('같은 씨앗이면 같은 길이 나온다', () => {
  const a = rowsOf(77, 1500).rows, b = rowsOf(77, 1500).rows;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, rowsOf(78, 1500).rows);
});
