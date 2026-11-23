// 울산 HD FC 유니폼. 필드 5벌과 골키퍼 4벌. 몸에는 상의·줄·등번호·하의·양말·축구화 색만 쓴다.
// tone 은 계열(dark 진한 색 / light 밝은 색)이다. 막는 쪽은 내 계열이 아닌 쪽을 입어 한눈에 구분된다.
export const KITS = [
  { id: 'home',   name: '홈',     tone: 'dark',  jersey: '#004098', trim: '#FFC72C', number: '#FFFFFF', shorts: '#002B6B', sock: '#004098', boot: '#F6F6F1' },
  { id: 'away',   name: '어웨이', tone: 'light', jersey: '#FFFFFF', trim: '#8CCBF2', number: '#004098', shorts: '#D7E1F2', sock: '#FFFFFF', boot: '#002B6B' },
  { id: 'third',  name: '서드',   tone: 'dark',  jersey: '#16213A', trim: '#CDB57C', number: '#CDB57C', shorts: '#16213A', sock: '#16213A', boot: '#CDB57C' },
  { id: 'fourth', name: '포스',   tone: 'light', jersey: '#CFD4DC', trim: '#15234A', number: '#15234A', shorts: '#15234A', sock: '#CFD4DC', boot: '#15234A' },
  { id: 'retro',  name: '레트로', tone: 'dark',  jersey: '#2B2A8A', stripe: '#0B1D63', trim: '#B9D4E8', number: '#FFFFFF', shorts: '#0B1D63', sock: '#0B1D63', boot: '#F6F6F1' },
];
export const GK_KITS = [
  { id: 'gk26h', name: '26 홈',   gk: true, jersey: '#D7297F', trim: '#C9DD35', number: '#FFFFFF', shorts: '#B21C66', sock: '#D7297F', boot: '#1A1A1A' },
  { id: 'gk26a', name: '26 원정', gk: true, jersey: '#C8DD35', trim: '#E8368F', number: '#D7297F', shorts: '#AFC42A', sock: '#C8DD35', boot: '#1A1A1A' },
  { id: 'gk25h', name: '25 홈',   gk: true, jersey: '#F2B13D', trim: '#7B1E2B', number: '#7B1E2B', shorts: '#E9A530', sock: '#F2B13D', boot: '#1A1A1A' },
  { id: 'gk25a', name: '25 원정', gk: true, jersey: '#7A1230', trim: '#F2C230', number: '#F2C230', shorts: '#7A1230', sock: '#7A1230', boot: '#1A1A1A' },
];
const ALL = [...KITS, ...GK_KITS];

export const START_KITS = ['home', 'gk26h'];
export const kitById = id => ALL.find(k => k.id === id);

const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

// 막는 쪽 차림. worn 은 내가 지금 입은 유니폼의 id.
// 내가 필드 유니폼이면 필드는 다른 계열, 내가 골키퍼 유니폼이면 필드는 홈. 골키퍼는 내 것과 다른 것
export function opponentKits(worn, rnd) {
  const mine = kitById(worn);
  return {
    field: mine.gk ? KITS[0] : pick(KITS.filter(k => k.tone !== mine.tone), rnd),
    gk: pick(GK_KITS.filter(k => k !== mine), rnd),
  };
}
