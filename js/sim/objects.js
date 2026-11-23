// 길 위에 놓이는 것들: 막는 선수 다섯 가지. 틱마다 움직이고, 몸 상자로 부딪힘을 따진다.
import { TICK, LANE_W, laneX, HIT_DX, RUSH_TRIGGER, RUSH_SPEED, KEEPER_TELL, KEEPER_FLY } from './constants.js';

const smooth = u => u * u * (3 - 2 * u);

export const makeStand = (id, d, lane) => ({ id, kind: 'stand', d, lane, x: laneX(lane), down: false });
// laneX(a) 와 laneX(b) 사이를 period 틱에 한 번 왕복한다
export const makeShift = (id, d, a, b, period, phase = 0) => ({ id, kind: 'shift', d, a, b, period, phase, x: laneX(a), down: false });
export const makeRush = (id, d, lane) => ({ id, kind: 'rush', d, lane, x: laneX(lane), running: false, down: false });
// 낮게 누운 태클. lane 부터 width 레인을 덮는다
export const makeSlide = (id, d, lane, width = 1) => ({ id, kind: 'slide', d, lane, width, x: laneX(lane) + (width - 1) * LANE_W / 2, down: false });
// lane 에 서 있다가 side 쪽 두 레인으로 몸을 날린다
export const makeKeeper = (id, d, lane, side) => ({ id, kind: 'keeper', d, lane, side, x: laneX(lane), state: 'stand', t: 0, down: false });

// h 는 코인 가운데의 높이
export const makeCoin = (id, d, lane, h) => ({ id, kind: 'coin', d, lane, x: laneX(lane), h });
export const makeItem = (id, d, lane) => ({ id, kind: 'item', d, lane, x: laneX(lane) });
export const isPickup = o => o.kind === 'coin' || o.kind === 'item';

export function tickObject(o, run) {
  const rel = o.d - run.dist;
  if (o.kind === 'shift') {
    const u = ((run.tick + o.phase) % o.period) / o.period;
    o.x = laneX(o.a) + (laneX(o.b) - laneX(o.a)) * smooth(u < 0.5 ? u * 2 : 2 - u * 2);
  } else if (o.kind === 'rush') {
    if (!o.down && rel <= RUSH_TRIGGER && rel > 0) { o.running = true; o.d -= RUSH_SPEED * TICK; }
  } else if (o.kind === 'keeper') {
    if (o.state === 'stand') { if (rel <= Math.max(16, run.speed * 1.8)) { o.state = 'tell'; o.t = 0; } }
    else if (o.state === 'tell') { if (++o.t >= KEEPER_TELL) { o.state = 'fly'; o.t = 0; } }
    else if (o.state === 'fly') {
      o.t++;
      o.x = laneX(o.lane) + 1.5 * o.side * LANE_W * smooth(o.t / KEEPER_FLY);
      if (o.t >= KEEPER_FLY) o.state = 'down';
    }
  }
}

// 몸 상자. x 는 가운데, halfW 는 선수 가운데와 이만큼 안에 들면 닿는 거리. 닿지 않는 상태면 null
export function boxOf(o) {
  if (o.down) return null;
  if (o.kind === 'slide') return { x: o.x, halfW: (o.width - 1) * LANE_W / 2 + HIT_DX, low: true };
  if (o.kind === 'keeper') {
    if (o.state === 'fly') return null;
    if (o.state === 'down') return { x: o.x, halfW: LANE_W / 2 + HIT_DX, low: true };
  }
  return { x: o.x, halfW: HIT_DX, low: false };
}
