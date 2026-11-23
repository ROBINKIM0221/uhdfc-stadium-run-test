// 기기에 남기는 것: 코인, 최고 기록, 가진 선수와 유니폼, 고른 것, 소리.
// 저장이 막힌 브라우저에서도 게임은 돌아가야 하므로 읽기·쓰기 실패는 조용히 넘긴다.
import { PLAYERS, START_PLAYER } from '../data/players.js';
import { kitById, START_KITS } from '../data/kits.js';

const KEY = 'uhd-dribble-run';

const fresh = () => ({
  v: 1, coins: 0, best: 0,
  players: [START_PLAYER], kits: [...START_KITS],
  player: START_PLAYER, kit: START_KITS[0], gkKit: START_KITS[1],
  sound: true, seen: { hint: false },
});

const count = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

// 읽어 온 값을 믿지 않고 하나씩 확인한다. 명단에서 빠진 선수나 모르는 유니폼은 버린다
function clean(raw) {
  const s = fresh();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
  s.coins = count(raw.coins);
  s.best = count(raw.best);
  const list = v => (Array.isArray(v) ? v : []);
  for (const no of list(raw.players)) if (PLAYERS.some(p => p.no === no) && !s.players.includes(no)) s.players.push(no);
  for (const id of list(raw.kits)) if (typeof id === 'string' && kitById(id) && !s.kits.includes(id)) s.kits.push(id);
  if (s.players.includes(raw.player)) s.player = raw.player;
  const owned = (id, gk) => s.kits.includes(id) && !!kitById(id).gk === gk;
  if (owned(raw.kit, false)) s.kit = raw.kit;
  if (owned(raw.gkKit, true)) s.gkKit = raw.gkKit;
  if (typeof raw.sound === 'boolean') s.sound = raw.sound;
  if (raw.seen && typeof raw.seen.hint === 'boolean') s.seen.hint = raw.seen.hint;
  return s;
}

// storage: localStorage 처럼 getItem·setItem 이 있는 것. 못 쓰면 null
export function createStore(storage) {
  let state = fresh();
  try { state = clean(JSON.parse(storage.getItem(KEY))); } catch { /* 없거나 막혔거나 깨졌으면 새로 시작 */ }
  const save = () => { try { storage.setItem(KEY, JSON.stringify(state)); } catch { /* 이번 방문 동안만 남는다 */ } };
  return {
    state, save,
    // 한 판이 끝났을 때. 최고 기록을 넘었는지 돌려준다
    addRun({ dist, coins }) {
      const m = Math.floor(dist), best = m > state.best;
      state.coins += coins;
      if (best) state.best = m;
      save();
      return { best };
    },
  };
}
