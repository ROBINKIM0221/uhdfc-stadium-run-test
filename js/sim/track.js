// 길 만들기. 줄마다 보장 레인을 하나 정해 비워 두고, 앞줄의 보장 레인에서 거기까지 갈 시간이 있게 줄을 띄운다.
import { rand, hash2 } from './rng.js';
import { LANES, TICK, MOVE_TICKS, AHEAD, RUSH_TRIGGER, RUSH_SPEED, COIN_H, speedAt } from './constants.js';
import { PATTERNS, WEIGHTS, crowd } from './patterns.js';
import { makeCoin, makeItem, makeStand, makeSlide } from './objects.js';

const REACT = 0.45;        // 줄을 보고 움직이기 시작할 때까지 주는 시간(초)
const FIRST_ROW = 30;
const LOOK = 40;           // 줄 사이가 이보다 멀어지지 않는다. 그 안의 가장 빠른 빠르기로 시간을 잰다

const COIN_LEAD = 1.5;     // 줄을 지난 뒤 이만큼부터 코인을 놓는다(m)
const COIN_STOP = 1.2;     // 다음 줄 앞 이만큼에서 그친다(m)
const COIN_BEAT = 0.2;     // 코인 하나를 줍고 다음 코인까지 걸리는 시간(초). 빨라질수록 간격을 벌려 줍는 소리의 박자를 지킨다
const COIN_MIN = 1.6;      // 느릴 때에도 이보다 촘촘하게 놓지 않는다(m)
const COIN_SIDE = 0.2;     // 다른 레인에도 한 줄이 더 놓일 확률
const FIRST_ITEM = 260;
const BETWEEN = [0, 0, 0.3, 0.45];   // 단계별로 줄 사이에 수비수가 한 명 더 서 있을 확률
const BETWEEN_ROOM = 12;               // 줄 사이가 이보다 좁으면(m) 세우지 않는다

export const tierAt = d => (d < 50 ? 0 : d < 160 ? 1 : d < 380 ? 2 : 3);

export function createTrack(seed) {
  return { s: hash2(seed, 0x51ED), lastD: 0, safe: 2, nextId: 1, nextItemD: FIRST_ITEM, rows: [] };
}

function pickKind(tier, r) {
  const w = WEIGHTS[tier];
  let total = 0;
  for (const k in w) total += w[k];
  let x = r * total;
  for (const k in w) { x -= w[k]; if (x < 0) return k; }
  return 'one';
}

function addRow(t, objs) {
  const rnd = () => rand(t);
  const prev = t.safe, near = tierAt(t.lastD + 10);
  // 다음 보장 레인: 0~2칸 옆. 초반일수록 덜 움직이고, 뒤로 가면 거의 줄마다 옮겨 간다
  const r = rnd(), steps = near === 0 ? (r < 0.5 ? 0 : 1) : near === 1 ? (r < 0.25 ? 0 : r < 0.8 ? 1 : 2) : (r < 0.1 ? 0 : r < 0.6 ? 1 : 2);
  let safe = prev + (rnd() < 0.5 ? -steps : steps);
  if (safe < 0 || safe >= LANES) safe = prev - (safe - prev);
  const shift = Math.abs(safe - prev);

  const speed = speedAt(t.lastD + LOOK);
  const slack = 0.34 - 0.24 * Math.min(1, t.lastD / 600);   // 반응 시간 위에 얹어 주는 여유(초). 600m 에서 0.1초까지 준다
  let d = Math.max(FIRST_ROW, t.lastD + speed * (REACT + MOVE_TICKS * TICK * shift + slack));
  const tier = tierAt(d), kind = pickKind(tier, rnd());
  // 달려드는 수비수는 그만큼 일찍 닿고, 골키퍼는 몸을 날리는 것이 보여야 한다
  if (kind === 'rush') d += RUSH_TRIGGER * RUSH_SPEED / (speed + RUSH_SPEED);
  if (kind === 'keeper') d = Math.max(d, t.lastD + speed * 2);

  const id = () => t.nextId++;
  const c = { d, safe, prev, tier, rnd, id }, made = crowd(c, PATTERNS[kind](c));
  // 줄 사이의 수비수: 앞줄의 보장 레인에서 이 줄의 보장 레인으로 가는 길 밖에 선다. 그 길만 따라가면 닿지 않고, 다른 레인으로 다니면 피해야 한다.
  // 달려드는 수비수가 지나갈 레인에도 세우지 않는다
  const lo = Math.min(prev, safe), hi = Math.max(prev, safe), aside = [];
  for (let l = 0; l < LANES; l++) if ((l < lo || l > hi) && !made.some(o => o.kind === 'rush' && o.lane === l)) aside.push(l);
  let between = -1;
  if (aside.length && d - t.lastD >= BETWEEN_ROOM && rnd() < BETWEEN[tier]) {
    between = aside[Math.floor(rnd() * aside.length)];
    const z = t.lastD + (d - t.lastD) * (0.4 + 0.2 * rnd());
    objs.push(rnd() < 0.3 ? makeSlide(id(), z, between, 1) : makeStand(id(), z, between));
  }
  objs.push(...made);
  t.rows.push({ d, safe, kinds: [...new Set(made.map(o => o.kind))].sort() });

  // 줍는 것: 아이템은 앞줄과 이 줄 사이 보장 레인에 놓는다. 코인은 줄 사이마다 앞줄을 지나온 레인을 따라 다음 줄 바로 앞까지 놓는다.
  // 줄을 뚫고 이어지지 않고 높이도 같아서, 어느 레인이 뚫려 있는지와 누가 태클을 할지를 미리 알려 주지 않는다
  const gap = Math.max(COIN_MIN, speed * COIN_BEAT);
  const line = lane => { for (let z = t.lastD + COIN_LEAD; z <= d - COIN_STOP; z += gap) objs.push(makeCoin(id(), z, lane, COIN_H)); };
  if (d >= t.nextItemD) {
    objs.push(makeItem(id(), (t.lastD + d) / 2, safe));
    t.nextItemD = d + 300 + rnd() * 100;
  } else {
    line(prev);
    const side = (prev + 1 + Math.floor(rnd() * (LANES - 1))) % LANES;
    if (side !== between && rnd() < COIN_SIDE) line(side);
  }

  t.lastD = d;
  t.safe = safe;
}

// 선수 앞 AHEAD 까지 줄을 채우고, 한참 지난 줄의 기록은 버린다
export function extendTrack(run) {
  const t = run.track;
  while (t.lastD < run.dist + AHEAD) addRow(t, run.objs);
  while (t.rows.length && t.rows[0].d < run.dist - 20) t.rows.shift();
}
