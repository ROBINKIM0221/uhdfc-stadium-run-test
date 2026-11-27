// 규칙에 쓰는 숫자. 여기를 바꾸면 같은 입력의 결과가 달라지므로 RULES_VERSION 을 올린다.
export const RULES_VERSION = 10;
export const TICK = 1 / 60;

export const LANES = 5;
export const LANE_W = 1.5;
export const laneX = lane => (lane - 2) * LANE_W;

export const MOVE_TICKS = 17;   // 옆 레인까지 0.28초. 어떤 기술이 나와도 같다
export const JUMP_TICKS = 36;   // 0.6초
export const JUMP_H = 1.15;

export const SPEED0 = 13.3;
export const SPEED_MAX = 28.6;
export const SPEED_K = 700;     // 이 거리(m)쯤에서 오름폭의 63%에 닿는다. 500m 에서 초속 21.1m, 1000m 에서 24.9m
export const speedAt = dist => SPEED0 + (SPEED_MAX - SPEED0) * (1 - Math.exp(-dist / SPEED_K));

export const HIT_DX = 0.33;     // 몸 상자 반폭의 합. 보이는 몸의 60%
export const HIT_DZ = 0.6;
export const LOW_CLEAR = 0.45;  // 이보다 높이 떠 있으면 낮은 것을 넘는다

export const RUSH_TRIGGER = 25; // 이 거리 안에 들면 달려든다
export const RUSH_SPEED = 4;
export const KEEPER_TELL = 18;  // 날기 전에 몸을 기울여 알리는 틱
export const KEEPER_FLY = 33;   // 날아가는 틱

export const BEAT_DIST = 2.5;   // 이 거리 안에서 피하기 시작해 지나치면 제친 것

export const BOOST_TICKS = 240; // 아이템 4초
export const BOOST_MULT = 1.6;
export const BOOST_REACH = 45;  // 차 낸 공이 쓰러뜨리는 거리
export const BALL_SPEED = 70;      // 아이템으로 가장 빨라진 선수(초속 46m)보다 넉넉히 빨라야 공이 앞서 나간다
export const GRACE_TICKS = 60;  // 아이템이 끝난 뒤 이만큼은 앞을 비운다

export const COIN_DX = 0.6;
export const COIN_DZ = 0.7;
export const COIN_DY = 0.8;
export const BODY_MID = 0.6;    // 코인과 높이를 견줄 때 쓰는 몸 가운데 높이
export const COIN_H = 0.6;      // 땅 위 코인의 높이

export const AHEAD = 90;        // 이만큼 앞까지 길을 만들어 둔다
export const BEHIND = 8;        // 이만큼 지나치면 지운다
