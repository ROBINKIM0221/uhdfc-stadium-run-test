// 고정 틱 루프의 셈. 화면을 모르는 순수 함수라 node 에서 검사한다.
import { TICK } from './sim/constants.js';

export const MAX_STEPS = 5;

// 쌓인 시간(초)으로 이번 프레임에 돌릴 틱 수. 가장 가까운 틱 수로 맞춰서 60Hz 화면의 프레임 시간이
// 조금 흔들려도 프레임마다 정확히 한 틱이 돈다. 탭이 가려졌다 돌아온 긴 공백은 MAX_STEPS 에서 자른다
export function clampSteps(elapsedSec) {
  const n = Math.round(elapsedSec / TICK);
  return n > 0 ? Math.min(MAX_STEPS, n) : 0;
}
