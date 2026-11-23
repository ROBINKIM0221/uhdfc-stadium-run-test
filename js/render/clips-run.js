// 달리며 공을 모는 자세. 다리는 관절 각이 아니라 발이 지나는 길로 적고 그 자리에 닿는 각을 푼다:
// 디딘 발은 땅에 붙어 뒤로 밀리고, 뗀 발은 뒤꿈치를 차올렸다가 무릎을 앞세워 넘어온다.
// 길이는 m, 각도는 라디안, 키 1.75m 기준. 앞이 -z, 오른쪽이 +x.
import { BALL_R, clamp } from './clip-tools.js';
import { smooth } from './anim.js';

const TAU = Math.PI * 2;
const THIGH = 0.35, SHIN = 0.35, HIP_X = 0.126, STAND = 0.7;   // rig.js 의 몸 비율: 허벅지, 정강이, 골반 반폭, 선 자세의 골반 관절에서 발목까지
const STRIKE = Math.PI / 2 + 0.35;   // 왼발이 땅에 닿는 phase. 그 직전(π/2)에 왼 허벅지가 가장 앞에 와 있다
const DUTY = 0.4;                    // 한 바퀴 가운데 발이 땅에 붙어 있는 몫
const TOUCH = 0.72;                  // 오른발이 넘어오는 길의 이만큼에서 공을 민다
const TOE = 0.2;                     // 발목에서 공에 닿는 발끝까지
const HOME = 0.2, OUT = 0.14;        // 공을 미는 오른발이 딛는 옆 자리와, 넘어오며 공 쪽으로 더 벌리는 폭
const FOLD = 0.31;                   // 골반 관절과 발목이 이보다 가까워지지 않는다. 무릎이 130도 넘게 접히지 않는다
const lerp = (a, b, t) => a + (b - a) * t;
// 발끝을 toe 만큼 내렸을 때(음수) 발끝이 땅에 닿아 있으려면 발목이 올라가야 하는 높이. 신발의 치수는 clip-tools.js 의 BOOT 와 같다
const tiptoe = toe => (toe < 0 ? 0.037 * (Math.cos(toe) - 1) - 0.16 * Math.sin(toe) : 0);

// 발목이 골반 관절에서 (x, y, z) 만큼 떨어진 자리에 오게 하는 엉덩이 각 [x, 0, z] 와 무릎 각. 무릎은 앞으로 굽는다
export function reach(x, y, z) {
  const far = Math.hypot(x, y, z), d = clamp(far, FOLD, THIGH + SHIN - 0.004);
  const knee = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1)) - Math.PI;
  const open = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));   // 허벅지가 골반과 발목을 잇는 선보다 앞으로 벌어진 각
  return [[Math.atan2(-z, -y) + open, 0, Math.asin(clamp(x / far, -1, 1))], knee];
}

// 발목이 지나는 길. u: 디딘 순간부터 센 한 바퀴(0..1), k: 빠르기(0..1), out: 넘어오는 동안 바깥으로 벌리는 폭.
// 공을 미는 발(out > 0)은 넘어오는 길의 뒤쪽을 땅에 낮게 붙여 발끝이 공 한가운데에 닿는다.
// 돌려주는 것: [땅에서 잰 옆 자리, 땅에서 뜬 높이, 골반보다 뒤로 간 거리, 발끝을 든 각]
function path(u, k, home, out) {
  const front = 0.24 + 0.03 * k, back = 0.33 + 0.03 * k;
  if (u < DUTY) {
    // 디딘 발: 땅에 붙어 뒤로 밀리다가 끝에서 뒤꿈치가 들린다
    const a = u / DUTY, off = smooth((a - 0.65) / 0.35), toe = lerp(0.12 * (1 - smooth(a / 0.15)), -0.75, off);
    return [home, tiptoe(toe), lerp(-front, back, a), toe];
  }
  // 뗀 발: 뒤꿈치를 차올린 뒤 낮게 앞으로 뻗었다가 살짝 당기며 내려선다
  const v = (u - DUTY) / (1 - DUTY);
  const high = (0.34 + 0.16 * k) * Math.sin(Math.PI * Math.min(1, v / (out ? TOUCH + 0.02 : 1)) ** 0.8) ** 1.1 * (1 - 0.45 * v);
  const z = lerp(back, -front - 0.06, smooth(v ** 0.9)) + 0.06 * smooth((v - 0.85) / 0.15);
  const toe = v < 0.2 ? lerp(-0.75, -1.05, smooth(v / 0.2)) : lerp(-1.05, 0.12, smooth((v - 0.2) / 0.5));
  return [home + out * Math.sin(Math.PI * smooth(v)), tiptoe(toe) + high, z, toe];
}

// 달리기와 드리블. phase 한 바퀴(2π)가 두 걸음이고, 그 사이 오른발이 공을 한 번 민다. sin(phase) > 0 이면 왼다리가 앞에 있다.
// k: 빠르기(0 느림 .. 1 가장 빠름). 빠를수록 걸음이 길어지고 뒤꿈치가 높이 올라오며 몸이 더 숙여진다
export function RUN(phase, k = 0.35) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const uL = (((phase - STRIKE) / TAU) % 1 + 1) % 1, uR = (uL + 0.5) % 1;
  // 골반: 디딜 때 낮고 떠 있을 때 높다. 디딘 발 쪽으로 조금 실린다
  const root = { yaw: 0, lean: 0, x: 0.02 * c, y: -0.068 - (0.02 + 0.008 * k) * Math.cos(2 * phase + 0.2) };
  const leg = (side, u, home, out) => {
    const [fx, fy, fz, toe] = path(u, k, home, out);
    const [hip, knee] = reach(fx - side * HIP_X - root.x, fy - STAND - root.y, fz);
    // 발목: 정강이가 기운 만큼 되돌려 발끝이 정한 각을 향하게 하고, 옆으로 기운 다리에서도 발바닥이 땅과 나란하게 한다
    return [hip, [knee, 0, 0], [toe - hip[0] - knee, 0, -hip[2]]];
  };
  const [hpL, knL, anL] = leg(-1, uL, -0.05, 0), [hpR, knR, anR] = leg(1, uR, HOME, OUT);

  // 공: 오른발 끝이 닿은 자리에서 앞으로 굴러 나갔다가, 달려오는 몸에 따라잡혀 한 바퀴 뒤 같은 발에 다시 닿는다.
  // 굴러가는 공은 고르게 느려지므로 몸에서 본 거리는 포물선을 그린다. 뒤에서 보는 카메라에 다리에 가리지 않게 발 바깥쪽 앞에 둔다
  const [tx, , tz] = path(DUTY + TOUCH * (1 - DUTY), k, HOME, OUT);
  const since = ((uR - DUTY - TOUCH * (1 - DUTY)) % 1 + 1) % 1;
  const ball = { x: tx + 0.15 + 0.03 * Math.sin(TAU * since), y: BALL_R, z: tz - TOE - BALL_R + 0.02 - (0.45 + 0.3 * k) * 4 * since * (1 - since) };

  const swing = 0.7 + 0.25 * k;   // 팔을 앞뒤로 젓는 폭. 팔은 반대쪽 다리와 같이 나가고, 앞으로 나온 손은 몸 가운데 쪽으로 온다
  return {
    root,
    hips: [0.05, -0.12 * s, 0.05 * c],
    spine: [-0.2 - 0.1 * k, (0.24 + 0.08 * k) * s, -0.07 * c],
    head: [0.12 + 0.05 * k, -(0.12 + 0.08 * k) * s, 0.02 * c],
    shL: [0.1 - swing * s, -0.25 + 0.2 * s, -0.18 - 0.1 * Math.max(0, s)], elL: [1.45 - 0.3 * s, 0, 0],
    shR: [0.1 + swing * s, 0.25 + 0.2 * s, 0.18 + 0.1 * Math.max(0, -s)], elR: [1.45 + 0.3 * s, 0, 0],
    hpL, knL, anL, hpR, knR, anR, ball,
  };
}
