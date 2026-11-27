// 울산 HD FC 유니폼. 필드 5벌과 골키퍼 4벌. 2026 홈·어웨이·서드·포스는 구단이 공개한 사진의 디자인을 따른다.
// 사람 모델에는 바탕 위에 옆판(panel)·어깨 세 줄(shoulder)·옷깃(collar)·소매 끝(cuff)·무늬(pattern)·
// 가슴 스폰서 글씨(sponsor, badge 면 위에 큰 HD)·한 가지 색 엠블럼(crest, 없으면 스폰서 색)·목에서 겨드랑이로 가는 선(piping)을 그린다. 골키퍼 유니폼은 긴소매다.
// 등 마킹: 등번호 안의 무늬(mark: 서드는 물결 wave, 포스는 공업 도시 industry, 나머지는 호랑이 무늬), 위쪽 ULSAN 패치(patch), 아래 스폰서(back, 'HD' 면 로고).
// tone 은 계열(dark 진한 색 / light 밝은 색)이다. 막는 쪽은 내 계열이 아닌 쪽을 입어 한눈에 구분된다.
export const KITS = [
  { id: 'home',   name: '홈',     tone: 'dark',  jersey: '#004098', trim: '#FFC72C', number: '#FFD21F', shorts: '#002B6B', sock: '#004098', boot: '#F6F6F1',
    shoulder: '#FFD21F', collar: '#FFD21F', cuff: '#004098', pattern: 'deboss', sponsor: 'HD현대일렉트릭', sponsorColor: '#FFD21F', shortTrim: '#FFD21F', sockBand: '#FFD21F', back: 'HD', piping: '#FFD21F' },
  { id: 'away',   name: '어웨이', tone: 'light', jersey: '#FFFFFF', trim: '#8CCBF2', number: '#004098', shorts: '#D7E1F2', sock: '#FFFFFF', boot: '#002B6B',
    panel: '#9CD2F4', shoulder: '#15234A', collar: '#15234A', cuff: '#9CD2F4', sponsor: 'HD현대일렉트릭', sponsorColor: '#15234A', shortTrim: '#15234A', sockBand: '#9CD2F4', back: 'HD' },
  { id: 'third',  name: '서드',   tone: 'dark',  jersey: '#16213A', trim: '#CDB57C', number: '#CDB57C', shorts: '#16213A', sock: '#16213A', boot: '#CDB57C',
    shoulder: '#CDB57C', collar: '#CDB57C', cuff: '#CDB57C', pattern: 'wave', sponsor: 'HD건설기계', badge: true, sponsorColor: '#CDB57C', mark: 'wave', patch: true, back: 'HD현대일렉트릭' },
  { id: 'fourth', name: '포스',   tone: 'light', jersey: '#CFD4DC', trim: '#15234A', number: '#15234A', shorts: '#15234A', sock: '#CFD4DC', boot: '#15234A',
    panel: '#15234A', shoulder: '#15234A', collar: '#15234A', cuff: '#15234A', sponsor: 'HD현대중공업', badge: true, sponsorColor: '#15234A', mark: 'industry', patch: true, back: 'HD현대일렉트릭' },
  { id: 'retro',  name: '레트로', tone: 'dark',  jersey: '#2B2A8A', stripe: '#0B1D63', trim: '#B9D4E8', number: '#FFFFFF', shorts: '#0B1D63', sock: '#0B1D63', boot: '#F6F6F1',
    shoulder: '#2B2A8A', collar: '#B9D4E8', cuff: '#B9D4E8' },
];
export const GK_KITS = [
  { id: 'gk26h', name: '26 홈',   gk: true, jersey: '#D7297F', trim: '#C9DD35', number: '#FFFFFF', shorts: '#B21C66', sock: '#D7297F', boot: '#1A1A1A', sponsor: 'HD현대일렉트릭', back: 'HD' },
  { id: 'gk26a', name: '26 원정', gk: true, jersey: '#C8DD35', trim: '#E8368F', number: '#D7297F', shorts: '#AFC42A', sock: '#C8DD35', boot: '#1A1A1A', sponsor: 'HD현대일렉트릭', back: 'HD' },
  { id: 'gk25h', name: '25 홈',   gk: true, jersey: '#F2B13D', trim: '#7B1E2B', number: '#7B1E2B', shorts: '#E9A530', sock: '#F2B13D', boot: '#1A1A1A', sponsor: 'HD현대일렉트릭', back: 'HD' },
  { id: 'gk25a', name: '25 원정', gk: true, jersey: '#7A1230', trim: '#F2C230', number: '#F2C230', shorts: '#7A1230', sock: '#7A1230', boot: '#1A1A1A', sponsor: 'HD현대일렉트릭', back: 'HD' },
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
