// 한 줄에 무엇을 어떻게 세울지 정하는 무늬 조각.
// c = { d, safe, prev, tier, rnd(), id() }. safe 는 이 줄에서 반드시 비워 두는 레인, prev 는 앞줄의 보장 레인.
import { LANES } from './constants.js';
import { makeStand, makeShift, makeRush, makeSlide, makeKeeper } from './objects.js';

// safe 를 뺀 레인을 섞어서 준다. 앞줄에서 서 있던 레인(prev)을 맨 앞에 둬서 피해야 하는 줄이 되게 한다
function others(c) {
  const lanes = [];
  for (let l = 0; l < LANES; l++) if (l !== c.safe && l !== c.prev) lanes.push(l);
  for (let i = lanes.length - 1; i > 0; i--) { const k = Math.floor(c.rnd() * (i + 1)); [lanes[i], lanes[k]] = [lanes[k], lanes[i]]; }
  if (c.prev !== c.safe) lanes.unshift(c.prev);
  return lanes;
}

export const PATTERNS = {
  one: c => [makeStand(c.id(), c.d, others(c)[0])],

  row: c => {
    const n = 2 + (c.rnd() < 0.4 ? 1 : 0) + (c.tier >= 3 && c.rnd() < 0.35 ? 1 : 0);
    return others(c).slice(0, n).map(l => makeStand(c.id(), c.d, l));
  },

  // 보장 레인을 넘지 않는 쪽에서 두세 레인을 오간다. 뒤로 갈수록 반대쪽에서도 한 명이 더 오간다
  shift: c => {
    const sides = [[0, c.safe - 1], [c.safe + 1, LANES - 1]].filter(([a, b]) => b - a >= 1);
    const mover = ([lo, hi]) => {
      const span = hi - lo >= 2 && c.rnd() < 0.3 ? 2 : 1;
      const a = lo + Math.floor(c.rnd() * (hi - lo - span + 1));
      const period = Math.round((96 + Math.floor(c.rnd() * 49)) * (c.tier >= 3 ? 0.85 : 1));   // 뒤로 가면 더 빨리 오간다
      return makeShift(c.id(), c.d, a, a + span, period, Math.floor(c.rnd() * period));
    };
    const first = Math.floor(c.rnd() * sides.length), out = [mover(sides[first])];
    if (sides.length > 1 && c.tier >= 2 && c.rnd() < (c.tier >= 3 ? 0.6 : 0.35)) out.push(mover(sides[1 - first]));
    if (c.prev !== c.safe && out.every(o => c.prev < o.a || c.prev > o.b)) out.push(makeStand(c.id(), c.d, c.prev));
    return out;
  },

  // 뒤로 갈수록 남은 레인에 태클이 하나 더 들어온다
  slide: c => {
    const free = others(c), lane = free[0];
    const next = [lane + 1, lane - 1].find(l => l >= 0 && l < LANES && l !== c.safe);
    const wide = next !== undefined && c.rnd() < 0.45;
    const out = [makeSlide(c.id(), c.d, wide ? Math.min(lane, next) : lane, wide ? 2 : 1)];
    const rest = free.filter(l => l !== lane && !(wide && l === next));
    if (rest.length && c.tier >= 2 && c.rnd() < (c.tier >= 3 ? 0.55 : 0.3)) out.push(makeSlide(c.id(), c.d, rest.shift(), 1));
    if (rest.length && c.rnd() < 0.5) out.push(makeStand(c.id(), c.d, rest[0]));
    return out;
  },

  // 뒤로 가면 둘이 같이 달려들기도 한다
  rush: c => {
    const free = others(c), out = [makeRush(c.id(), c.d, free[0])];
    if (free.length > 1 && c.tier >= 2 && c.rnd() < 0.5) out.push(makeRush(c.id(), c.d, free[1]));
    else if (free.length > 1 && c.rnd() < 0.4) out.push(makeStand(c.id(), c.d, free[1]));
    return out;
  },

  // 눕는 두 레인에 보장 레인이 들지 않는 자리와 방향 가운데 하나
  keeper: c => {
    const picks = [];
    for (let k = 0; k < LANES; k++) for (const s of [-1, 1]) {
      const far = k + 2 * s;
      if (far < 0 || far >= LANES || c.safe === k + s || c.safe === far) continue;
      picks.push([k, s]);
    }
    const [k, s] = picks[Math.floor(c.rnd() * picks.length)], out = [makeKeeper(c.id(), c.d, k, s)];
    // 뒤로 가면 골키퍼가 덮지 않는 레인에 수비수가 같이 선다
    const open = [];
    for (let l = 0; l < LANES; l++) if (l !== c.safe && (l - k) * s < 0) open.push(l);
    if (open.length && c.tier >= 3 && c.rnd() < 0.5) out.push(makeStand(c.id(), c.d, open[Math.floor(c.rnd() * open.length)]));
    return out;
  },
};

// 줄에 놓인 것들이 막는 레인. 오가는 범위와 골키퍼가 몸을 날려 덮는 자리까지 센다
export function lanesOf(made) {
  const used = new Set();
  for (const o of made) {
    if (o.kind === 'shift') for (let l = o.a; l <= o.b; l++) used.add(l);
    else if (o.kind === 'slide') for (let i = 0; i < o.width; i++) used.add(o.lane + i);
    else if (o.kind === 'keeper') for (let i = 0; i <= 2; i++) used.add(o.lane + i * o.side);
    else used.add(o.lane);
  }
  return used;
}

// 단계별로 줄에 남겨 두는 빈 레인의 수(보장 레인 말고)와 그 수가 나오는 정도, 그리고 채우는 선수가 태클일 확률
const LEAVE = [[[3, 1]], [[2, 2], [1, 3]], [[1, 5], [0, 4], [2, 1]], [[0, 7], [1, 3]]];
const FILL_SLIDE = [0, 0.3, 0.4, 0.45];
const FILL_RUSH = [0, 0.1, 0.18, 0.2];   // 채우는 선수가 달려드는 수비수일 확률. 앞줄의 보장 레인에서 이 줄의 보장 레인으로 가는 길 밖에서만 달려든다

// 무늬가 놓고 남은 빈 레인을 더 막는다. 보장 레인은 늘 비워 두고, 뒤로 갈수록 그 밖의 빈 레인이 적게 남는다.
// 나란히 빈 두 레인에는 가끔 그 사이를 오가는 수비수를 세운다
export function crowd(c, made) {
  const used = lanesOf(made), open = [];
  for (let l = 0; l < LANES; l++) if (l !== c.safe && !used.has(l)) open.push(l);
  for (let i = open.length - 1; i > 0; i--) { const k = Math.floor(c.rnd() * (i + 1)); [open[i], open[k]] = [open[k], open[i]]; }
  const odds = LEAVE[c.tier];
  let x = c.rnd() * odds.reduce((sum, [, w]) => sum + w, 0), keep = odds[0][0];
  for (const [n, w] of odds) { x -= w; if (x < 0) { keep = n; break; } }
  const lo = Math.min(c.prev, c.safe), hi = Math.max(c.prev, c.safe);
  while (open.length > keep) {
    const lane = open.pop(), next = open.findIndex(l => Math.abs(l - lane) === 1);
    if ((lane < lo || lane > hi) && c.rnd() < FILL_RUSH[c.tier]) { made.push(makeRush(c.id(), c.d, lane)); continue; }
    if (c.tier >= 2 && next >= 0 && open.length > keep && c.rnd() < 0.3) {
      const other = open.splice(next, 1)[0], period = 96 + Math.floor(c.rnd() * 49);
      made.push(makeShift(c.id(), c.d, Math.min(lane, other), Math.max(lane, other), period, Math.floor(c.rnd() * period)));
    } else made.push(c.rnd() < FILL_SLIDE[c.tier] ? makeSlide(c.id(), c.d, lane, 1) : makeStand(c.id(), c.d, lane));
  }
  return made;
}

// 난이도 단계별로 무늬가 나오는 정도. 뒤로 갈수록 오가는 수비수·태클·달려드는 수비수·골키퍼가 줄의 대부분을 차지한다
export const WEIGHTS = [
  { one: 1 },
  { one: 1.5, row: 2, shift: 3, slide: 2.5, rush: 0.5, keeper: 1 },
  { one: 0.5, row: 2, shift: 4, slide: 4, rush: 1.5, keeper: 2.5 },
  { row: 2, shift: 4.5, slide: 4.5, rush: 2, keeper: 3.5 },
];
