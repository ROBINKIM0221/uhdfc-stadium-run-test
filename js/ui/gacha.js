// 뽑기. 코인을 내고 아직 없는 선수나 유니폼 가운데 하나를 같은 확률로 얻는다. 같은 것이 다시 나오지 않는다.
import { PLAYERS, byNo } from '../data/players.js';
import { KITS, GK_KITS } from '../data/kits.js';

export const DRAW_COST = 300;

// 지금 뽑힐 수 있는 것. 골키퍼 유니폼은 입을 골키퍼가 생긴 뒤부터 들어간다
export function poolOf(state) {
  const pool = PLAYERS.filter(p => !state.players.includes(p.no)).map(p => ({ type: 'player', id: p.no }));
  const hasKeeper = state.players.some(no => byNo(no).pos === 'GK');
  for (const k of hasKeeper ? [...KITS, ...GK_KITS] : KITS) if (!state.kits.includes(k.id)) pool.push({ type: 'kit', id: k.id });
  return pool;
}

// 뽑은 것을 돌려준다. 코인이 모자라거나 다 모았으면 null
export function draw(state, rnd) {
  const pool = poolOf(state);
  if (state.coins < DRAW_COST || !pool.length) return null;
  const got = pool[Math.floor(rnd() * pool.length)];
  state.coins -= DRAW_COST;
  (got.type === 'player' ? state.players : state.kits).push(got.id);
  return got;
}
