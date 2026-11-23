// 옆 레인으로 갈 때 나오는 드리블 기술 14가지. 겉모습일 뿐이고 규칙에는 영향이 없다.
import { mulberry32, hash2 } from '../sim/rng.js';

export const SKILLS = [
  { id: 'bodyFeint', name: '바디 페인팅' },
  { id: 'stepOver', name: '스텝오버' },
  { id: 'ballRoll', name: '볼롤' },
  { id: 'soleDrag', name: '발바닥 드리블' },
  { id: 'phantom', name: '팬텀 드리블' },
  { id: 'vCut', name: 'V자 드리블' },
  { id: 'flipFlap', name: '플립플랩' },
  { id: 'marseille', name: '마르세유 턴' },
  { id: 'shotFeint', name: '슛 페인팅' },
  { id: 'cruyff', name: '크루이프 턴' },
  { id: 'doubleStepOver', name: '더블 스텝오버' },
  { id: 'chop', name: '호날두 찹' },
  { id: 'mcgeady', name: '맥기디 스핀' },
  { id: 'hocusPocus', name: '호커스 포커스' },
];

// 판의 씨앗과 몇 번째 이동인지로 정해지므로, 판을 다시 돌려도 같은 기술이 나온다. 어느 선수든 열네 가지가 같은 몫으로 나오고,
// 바로 앞의 기술만 빼고 고른다
export function pickSkill(seed, index, lastId = null) {
  const pool = SKILLS.filter(s => s.id !== lastId);
  return pool[Math.floor(mulberry32(hash2(seed, index))() * pool.length)].id;
}
