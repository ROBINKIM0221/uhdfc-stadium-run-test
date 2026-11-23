// 보장 레인만 따라가는 자동 조종. 지금 지나는 줄을 다 지난 뒤 다음 줄의 보장 레인으로 한 칸씩 간다.
import { step } from '../../js/sim/run.js';
import { HIT_DZ } from '../../js/sim/constants.js';

export function pilotCmds(run) {
  const row = run.track.rows.find(r => r.d > run.dist - HIT_DZ - 0.1);
  if (!row || run.move || run.lane === row.safe) return [];
  return [run.lane < row.safe ? 'R' : 'L'];
}

// until(m) 까지 달리거나 끝날 때까지. 이벤트를 모아 돌려준다
export function pilot(run, until, onTick) {
  const all = [];
  while (run.alive && run.dist < until) {
    const ev = step(run, pilotCmds(run));
    all.push(...ev);
    if (onTick) onTick(run, ev);
  }
  return all;
}
