// 막는 선수의 자세와 동작 자료. 꼴은 anim.js 머리말에 있다.
// 자리는 모두 선 자리의 발밑에서 잰다(m): 몸의 왼쪽이 -x, 앞(내 선수 쪽)이 -z.
// 한쪽만 만든 것은 모두 경기장의 오른쪽(+x)으로 가는 쪽이다. 이쪽을 보고 선 몸에게는 자기 왼쪽이고, 반대쪽은 mirror 로 얻는다.
import { TICK, KEEPER_TELL, KEEPER_FLY } from '../sim/constants.js';
import { smooth } from './anim.js';

// 몸 치수(m): rig.js 의 기본 비율에 키 1.75 를 곱한 값
const HIP_X = 0.126, HIP_Y = 0.805, THIGH = 0.35;     // 골반 반폭, 선 골반 높이, 허벅지(= 정강이)
const BOOT = { r: 0.068, drop: 0.037, toe: 0.16 };    // 신발: 반지름, 발목에서 축까지 내려간 거리, 축의 앞 끝까지

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const mixv = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
// 선수마다, 걸음마다 다른 값(0..1). 같은 수에는 늘 같은 값이 나온다
export const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
// 느리게 흔들리는 값(-1..1): 되풀이가 눈에 띄지 않게 박자가 다른 둘을 겹친다
const wob = (t, k) => 0.6 * Math.sin(t + k * 40) + 0.4 * Math.sin(t * 1.62 + k * 97);

// ── 회전 행렬 ──
// 3×3, 행 차례. 관절 몸마다 프레임마다 푸는 것이라 새로 만들지 않고 받은 자리(o)에 써 넣는다
const mat = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
// 관절이 도는 차례(x → y → z)로 곱한 회전
function xyz(o, x, y, z) {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  o[0] = c * e; o[1] = -c * f; o[2] = d;
  o[3] = a * f + b * e * d; o[4] = a * e - b * f * d; o[5] = -b * c;
  o[6] = b * f - a * e * d; o[7] = b * e + a * f * d; o[8] = a * c;
  return o;
}
function mul(o, a, b) {
  for (let r = 0; r < 9; r += 3) for (let c = 0; c < 3; c++) o[r + c] = a[r] * b[c] + a[r + 1] * b[c + 3] + a[r + 2] * b[c + 6];
  return o;
}
// a 를 뒤집어(전치) 곱한 것의 관절 각: a 에서 본 b 의 방향
const between = (a, b) => [
  Math.atan2(-(a[1] * b[2] + a[4] * b[5] + a[7] * b[8]), a[2] * b[2] + a[5] * b[5] + a[8] * b[8]),
  Math.asin(clamp(a[0] * b[2] + a[3] * b[5] + a[6] * b[8], -1, 1)),
  Math.atan2(-(a[0] * b[1] + a[3] * b[4] + a[6] * b[7]), a[0] * b[0] + a[3] * b[3] + a[6] * b[6]),
];
const IDENT = mat();

// ── 다리 풀기 ──
const T1 = mat(), T2 = mat(), T3 = mat(), HIP = mat(), SHIN = mat(), SOLE = mat();
// 발이 foot 에 오게 하는 [엉덩, 무릎, 발목] 각. s 는 왼쪽 -1, 오른쪽 +1, pelvis 는 골반의 방향, (cx, cy, cz) 는 골반 가운데.
// foot: [x, y, z, 발끝 들기(+)·내리기(-), 발끝 왼쪽(+)·오른쪽(-) 돌리기, 무릎 왼쪽(+)·오른쪽(-) 돌리기].
// x·z 는 발목의 자리, y 는 신발 바닥의 가장 낮은 곳이 땅에서 뜬 높이. 닿지 않는 자리면 그쪽으로 다리를 다 편다
function leg(s, pelvis, cx, cy, cz, foot) {
  const toe = foot[3] || 0, turn = foot[4] || 0;
  // 발끝을 내리면 앞꿈치가 땅에 남고 발목이 올라간다
  const ankle = foot[1] + BOOT.r + BOOT.drop * Math.cos(toe) + BOOT.toe * Math.max(0, -Math.sin(toe));
  const ax = foot[0] - cx - s * HIP_X * pelvis[0], ay = ankle - cy - s * HIP_X * pelvis[3], az = foot[2] - cz - s * HIP_X * pelvis[6];
  const dx = pelvis[0] * ax + pelvis[3] * ay + pelvis[6] * az, dy = pelvis[1] * ax + pelvis[4] * ay + pelvis[7] * az, dz = pelvis[2] * ax + pelvis[5] * ay + pelvis[8] * az;
  const far = Math.hypot(dx, dy, dz) || 1e-9, bend = 2 * Math.acos(clamp(far / (2 * THIGH), 0.3, 0.9995));
  // 엉덩 관절에서 발목을 겨눈 뒤, 그 축으로 무릎을 돌리고, 굽힘의 절반만큼 허벅지를 앞으로 든다
  mul(T3, xyz(T1, Math.atan2(-dz, -dy), 0, Math.asin(clamp(dx / far, -1, 1))), xyz(T2, 0, foot[5] || 0, 0));
  mul(HIP, T3, xyz(T1, bend / 2, 0, 0));
  mul(SHIN, mul(T3, pelvis, HIP), xyz(T1, -bend, 0, 0));
  // 신발은 몸이 어떻게 기울든 땅을 기준으로 놓인다
  const c = Math.cos(turn), d = Math.sin(turn), e = Math.cos(toe), f = Math.sin(toe);
  SOLE[0] = c; SOLE[1] = d * f; SOLE[2] = d * e; SOLE[3] = 0; SOLE[4] = e; SOLE[5] = -f; SOLE[6] = -d; SOLE[7] = c * f; SOLE[8] = c * e;
  return [between(IDENT, HIP), [-bend, 0, 0], between(SHIN, SOLE)];
}

const BODY = mat(), PELVIS = mat(), ZERO = [0, 0, 0];
// 두 발이 L, R 에 놓이는 자세. root 는 골반이 선 자리에서 벗어난 만큼, upper 는 윗몸 관절.
// 발 자리는 몸 밖에서 잰 것이라 몸을 돌리거나 기울여도 디딘 발은 그 자리에 남는다
export function stance(root, L, R, upper) {
  root = { yaw: 0, lean: 0, x: 0, y: 0, ...root };
  const hips = (upper && upper.hips) || ZERO, h = HIP_Y + root.y;
  xyz(BODY, 0, root.yaw, root.lean);
  mul(PELVIS, BODY, xyz(T1, hips[0], hips[1], hips[2]));
  const cx = BODY[0] * root.x + BODY[1] * h, cy = BODY[3] * root.x + BODY[4] * h, cz = BODY[6] * root.x + BODY[7] * h;
  const [hpL, knL, anL] = leg(-1, PELVIS, cx, cy, cz, L), [hpR, knR, anR] = leg(1, PELVIS, cx, cy, cz, R);
  return { root, hips: [0, 0, 0], ...upper, hpL, knL, anL, hpR, knR, anR };
}

// ── 서서 하는 몸놀림 ──
// 뻗은 관절(어깨, 엉덩)의 각: 앞으로 a 만큼 들고 옆으로 c 만큼(몸의 왼쪽이 -) 벌린 뒤, 뼈의 축으로 b 만큼 튼다
const limb = (a, c, b = 0) => between(IDENT, mul(T3, xyz(T1, a, 0, c), xyz(T2, 0, b, 0)));
// 어깨 각. a 앞으로 들기, b 팔뚝을 밖으로 틀기, c 옆으로 벌리기. s 는 왼팔 -1, 오른팔 1
const arm = (s, a, b, c) => limb(a, s * c, -s * b);
const el = v => [v, 0, 0];

// 선 자세 하나: 골반 높이(y), 두 발, 윗몸. 굽는 동작의 첫 자세와 먼 선수의 굳힌 몸도 여기서 나온다
const upper = ({ hips, spine, head, shL, elL, shR, elR }) => ({ hips, spine, head, shL, elL, shR, elR });
const still = S => stance({ y: S.y }, S.L, S.R, upper(S));

// 수비 자세의 바탕 값: 무릎을 굽혀 엉덩이를 뒤로 빼고 윗몸을 숙인 채, 앞꿈치로 서서 팔을 낮게 벌린다
const G = { y: -0.105, w: 0.33, z: -0.12, toe: -0.14, hips: [-0.12, 0, 0], spine: [-0.3, 0, 0], head: [0.32, 0, 0], sh: [0.2, 0.6, 0.42], el: 1 };
const GUARD = { y: G.y, L: [-G.w, 0, G.z, G.toe, 0.2, 0.1], R: [G.w, 0, G.z, G.toe, -0.2, -0.1], hips: G.hips, spine: G.spine, head: G.head,
  shL: arm(-1, ...G.sh), elL: el(G.el), shR: arm(1, ...G.sh), elR: el(G.el) };
export const GUARD0 = still(GUARD);

// 제자리에서 가끔 발을 고쳐 딛는다: period 초에 한 번, 조금 들었다가 살짝 옆에 다시 놓는다.
// RE 에 옮긴 만큼(-0.5..0.5)과 든 정도(0..1)를 적는다
const RE = { x: 0, z: 0, up: 0 };
function restep(t, period, seed) {
  const q = t / period + seed, n = Math.floor(q), w = (q - n) / 0.13, e = smooth(w);
  RE.x = lerp(hash(n - 1 + seed * 7) - 0.5, hash(n + seed * 7) - 0.5, e);
  RE.z = lerp(hash(n + 4 + seed * 13) - 0.5, hash(n + 5 + seed * 13) - 0.5, e);
  RE.up = w < 1 ? Math.sin(Math.PI * w) : 0;
}

const REACH = [0.4, 0.3, 0.7, 0.3], BALANCE = [-0.6, 0.2, 1.2, 0.7];   // 다리를 뻗을 때 그쪽 팔과 반대쪽 팔: [a, b, c, 팔꿈치]
// 수비 자세. t 시계(초), id 선수마다 다른 수(박자와 서는 버릇이 달라진다), aim 내 선수가 있는 쪽 각(몸의 왼쪽이 +),
// near 내 선수가 다가온 정도(0..1), poke 그쪽으로 다리를 뻗은 정도(0..1), reach 뻗는 거리(m)
export function JOCKEY(t, id = 0, aim = 0, near = 0, poke = 0, reach = 0) {
  const k = hash(id), g = hash(id + 0.5) < 0.5 ? -1 : 1, ph = k * 40;   // g: 어느 발을 앞에 두고 비껴 서는지
  const bob = Math.sin(t * 11 + ph), sway = wob(t * 1.3, k), breath = Math.sin(t * 2.2 + ph);
  const turn = clamp(aim, -1.9, 1.9), s = aim < 0 ? 1 : -1;             // s: 다리를 뻗는 쪽
  // 뻗기는 두 박자다: 버티는 발을 몸 밑으로 당겨 딛고(hop), 다른 발을 찔러 넣는다(stab)
  const far = reach / 0.95, hop = far * smooth(poke / 0.45), stab = smooth((poke - 0.25) / 0.75);
  const w = G.w + 0.06 * (k - 0.5) + 0.05 * near, toe = G.toe - 0.06 * (1 + bob), step = 1.7 + 0.7 * k;
  const L = [-w, 0, G.z - 0.09 * g, toe, 0.2 - 0.15 * g, 0.1], R = [w, 0, G.z + 0.09 * g, toe, -0.2 - 0.15 * g, -0.1];
  restep(t, step, k); L[0] += 0.1 * RE.x; L[1] = 0.05 * RE.up; L[2] += 0.08 * RE.z;
  restep(t, step, k + 0.5); R[0] += 0.1 * RE.x; R[1] = 0.05 * RE.up; R[2] += 0.08 * RE.z;
  const to = s < 0 ? L : R, on = s < 0 ? R : L;
  on[0] = lerp(on[0], -s * 0.04, hop); on[1] += 0.05 * Math.sin(Math.PI * hop); on[2] = lerp(on[2], 0, hop);
  to[0] = lerp(to[0], s * reach, stab); to[1] += 0.03 * stab + 0.07 * Math.sin(Math.PI * stab); to[2] = lerp(to[2], -0.3, stab);
  to[3] = lerp(to[3], 0.35, stab); to[4] = lerp(to[4], -s * 0.6, stab);
  // 앞에 둔 쪽 팔은 조금 더 앞에, 뒤쪽 팔은 더 벌려 든다
  const hand = q => {
    const e = -q * g, T = q === s ? REACH : BALANCE;
    return [arm(q, lerp(G.sh[0] + 0.12 * e, T[0], stab), lerp(G.sh[1], T[1], stab), lerp(G.sh[2] - 0.08 * e + 0.2 * near + 0.04 * breath, T[2], stab)),
      el(lerp(G.el - 0.15 * e - 0.2 * near, T[3], stab))];
  };
  const [shL, elL] = hand(-1), [shR, elR] = hand(1);
  // 몸은 골반에서 돌린다: 제자리에서 돌아서, 옆으로 옮긴 골반이 앞뒤로 밀리지 않는다
  return stance({ x: 0.05 * sway - 0.06 * clamp(turn, -1, 1) + s * 0.3 * hop, y: G.y + 0.016 * bob - 0.05 * near - 0.2 * far * stab, lean: -s * 0.1 * stab }, L, R, {
    hips: [G.hips[0] - 0.04 * near, -0.26 * g + 0.25 * turn, 0], spine: [G.spine[0] - 0.08 * near + 0.02 * breath, 0.1 * g + 0.4 * turn, -s * 0.12 * stab],
    head: [G.head[0] + 0.05 * near, 0.3 * turn, 0], shL, elL, shR, elR,
  });
}

// 옆걸음: 경기장 오른쪽(몸의 왼쪽)으로 가는 쪽. c 는 떠난 끝에서부터 센 걸음 바퀴(한 바퀴에 뒷발, 앞발이 차례로 한 번씩 옮겨 딛는다),
// S 는 한 바퀴에 가는 거리(m), acc 는 가는 쪽으로 빨라지는 정도(-1..1, 멈춰 설 때 -).
// 디딘 발은 몸이 간 만큼만 뒤로 밀리므로 땅에서 미끄러지지 않고, 두 발은 엇갈리지 않는다
export function SHUFFLE(c, S, t = 0, id = 0, aim = 0, acc = 0) {
  const ph = c - Math.floor(c), a = ph * 2 * Math.PI, r = S / 2 + 0.11;   // r: 가장 벌렸을 때 골반에서 발까지. 모았을 때도 두 발 사이가 0.22m 남는다
  // 앞 절반은 뒷발이, 뒤 절반은 앞발이 옮겨 딛는다. 옮기는 발은 그 절반의 처음과 끝 10% 동안 땅에 있다
  const back = ph < 0.5, w = clamp(((back ? ph : ph - 0.5) * 2 - 0.1) / 0.8, 0, 1), up = 0.07 * Math.sin(Math.PI * w);
  const lead = back ? r - ph * S : r + S * (smooth(w) - ph), trail = back ? S * (smooth(w) - ph) - r : (1 - ph) * S - r;
  const turn = clamp(aim, -1.6, 1.6), bob = Math.sin(t * 11 + id), open = Math.cos(a), swing = Math.sin(a), bend = el(0.9 - 0.1 * open);
  const tilt = 0.14 * acc + 0.04 * open;   // 빨라지는 쪽으로 윗몸이 넘어간다: 끝에서는 돌아갈 쪽으로 미리 기운다
  // 골반은 디딘 발로 밀 때 앞서 나가고 멈춰 설 때 뒤에 남는다. 걸음이 클수록 다리가 닿도록 더 낮추고, 두 발이 모일 때 조금 솟는다
  return stance({ x: -0.04 * acc - 0.04 * swing, y: -0.15 - 1.05 * Math.max(0, r - 0.48) - 0.03 * acc * acc + 0.035 * Math.sin(ph * Math.PI) ** 2 + 0.008 * bob },
    [-lead, back ? 0 : up, -0.1, -0.12, 0.2, 0.1], [-trail, back ? up : 0, -0.1, -0.12, -0.2, -0.1], {
      hips: [G.hips[0], 0.2 * turn, 0.5 * tilt], spine: [G.spine[0] - 0.04, 0.4 * turn, 0.7 * tilt], head: [G.head[0], 0.3 * turn, 0],
      shL: arm(-1, 0.25, 0.55, 0.58 + 0.12 * open + 0.1 * swing), elL: bend, shR: arm(1, 0.25, 0.55, 0.58 + 0.12 * open - 0.1 * swing), elR: bend,
    });
}

const STANCE = 0.33;   // 달릴 때 한 발이 땅을 딛고 있는 동안(걸음 바퀴에서 차지하는 몫)
// 달리는 발 하나의 자리. 디딘 동안은 몸 밑을 곧게 뒤로 지나가고, 뗀 뒤에는 뒤꿈치를 차올렸다가 무릎을 앞세워 돌아온다
function stride(c, s, drive) {
  const p = c - Math.floor(c), front = -0.26 + 0.12 * drive, rear = 0.4 + 0.08 * drive;
  if (p < STANCE) { const w = p / STANCE; return [s * 0.085, 0, lerp(front, rear, w), 0.12 - 0.62 * w * w]; }
  const w = (p - STANCE) / (1 - STANCE);
  return [s * 0.085, 0.2 * Math.sin(Math.PI * w) + 0.1 * Math.sin(Math.PI * Math.min(1, w * 2.4)), lerp(rear, front, smooth(w)), 0.12 * w - 0.5 * (1 - w) ** 2];
}
// 달려드는 걸음. c 는 걸음 바퀴(한 바퀴에 두 걸음), drive 는 막 뛰쳐나가는 정도(0..1): 몸을 더 숙이고 발을 몸 뒤쪽에서 민다
export function SPRINT(c, drive = 0) {
  const a = c * 2 * Math.PI, cs = Math.cos(a);
  // 골반은 발을 디딘 한가운데에서 가장 낮다
  return stance({ x: 0.02 * Math.sin(a), y: -0.055 - 0.03 * drive - 0.028 * Math.cos(2 * a - STANCE * 2 * Math.PI) }, stride(c, -1, drive), stride(c + 0.5, 1, drive), {
    hips: [-0.1 - 0.14 * drive, -0.12 * cs, 0.04 * cs], spine: [-0.24 - 0.22 * drive, 0.3 * cs, 0], head: [0.3 + 0.3 * drive, -0.12 * cs, 0],
    shL: arm(-1, -0.95 * cs, 0, 0.18), elL: el(1.45 - 0.25 * cs), shR: arm(1, 0.95 * cs, 0, 0.18), elR: el(1.45 + 0.25 * cs),
  });
}

// 태클을 벼르는 자세: 한 발을 뒤로 빼고 깊이 웅크려, 뛰쳐나갈 쪽으로 쏠려 있다
const COILED = { y: -0.17, L: [-0.2, 0, 0.3, -0.5, 0.1, 0], R: [0.2, 0, -0.2, -0.05, -0.1, 0], hips: [-0.3, 0, 0], spine: [-0.45, 0, 0], head: [0.6, 0, 0],
  shL: arm(-1, 0.7, 0, 0.25), elL: el(1.3), shR: arm(1, -0.5, 0, 0.3), elR: el(1.2) };
export function COIL(t, id = 0) {
  const k = hash(id), rock = wob(t * 2.4, k), bob = Math.sin(t * 10 + k * 40);
  return stance({ x: 0.02 * wob(t * 1.1, k + 0.3), y: COILED.y + 0.012 * bob }, COILED.L, COILED.R, {
    ...upper(COILED), spine: [COILED.spine[0] + 0.03 * rock, 0, 0], elL: el(1.3 + 0.08 * rock), elR: el(1.2 - 0.08 * rock) });
}

// 골키퍼의 준비 자세: 발을 어깨보다 넓게 딛고 앞꿈치로 서서, 장갑을 몸 앞 허리 높이에 든다
const KEEPER = { y: -0.14, L: [-0.3, 0, -0.08, -0.2, 0.25, 0.15], R: [0.3, 0, -0.08, -0.2, -0.25, -0.15], hips: [-0.15, 0, 0], spine: [-0.3, 0, 0], head: [0.36, 0, 0],
  shL: arm(-1, 0.5, 0.35, 0.42), elL: el(1.15), shR: arm(1, 0.5, 0.35, 0.42), elR: el(1.15) };
export const KEEPER0 = still(KEEPER);
// 발끝으로 잘게 뛰며 내 선수 쪽으로 몸을 둔다
export function KEEPER_READY(t, id = 0, aim = 0) {
  const k = hash(id), ph = k * 40, turn = clamp(aim, -1, 1), hopL = Math.max(0, Math.sin(t * 12.5 + ph)), hopR = Math.max(0, -Math.sin(t * 12.5 + ph));
  const sway = wob(t * 1.5, k), L = [...KEEPER.L], R = [...KEEPER.R], lift = 0.5 + 0.06 * Math.sin(t * 3.1 + ph);
  L[0] += 0.03 * sway; L[1] = 0.025 * hopL * hopL; R[0] += 0.03 * sway; R[1] = 0.025 * hopR * hopR;
  return stance({ x: 0.04 * sway - 0.05 * turn, y: KEEPER.y + 0.014 * Math.cos(t * 25 + 2 * ph) }, L, R, {
    ...upper(KEEPER), hips: [KEEPER.hips[0], 0.3 * turn, 0], spine: [KEEPER.spine[0], 0.35 * turn, 0], shL: arm(-1, lift, 0.35, 0.42), shR: arm(1, lift, 0.35, 0.42) });
}

// ── 누운 몸 ──
// 등을 대고 누운 몸의 관절: 한 팔은 머리 옆으로 올라가고 한 무릎은 세워진 채 밖으로 넘어가 있다.
// 눕히는 것은 놓는 쪽이 하고, 그때 골반이 땅에서 뜨는 높이(LIE_Y)가 같이 간다
const FLAT = { hips: [0, 0, 0], spine: [-0.1, 0.1, 0.06], head: [-0.15, 0.5, 0],
  shL: [0.15, 0, -1.95], elL: el(1), shR: [0.1, 0, 0.8], elR: el(0.3),
  hpL: limb(0.7, -0.45), knL: el(-1.3), anL: el(-0.3), hpR: limb(0.08, 0.2), knR: el(-0.2), anR: [-0.5, 0, 0.3] };
// 다르게 뻗은 몸: 한 팔은 옆으로, 한 팔은 머리 위로 던져지고 반대쪽 무릎이 세워져 있다
const SPRAWL = { hips: [0, 0, 0], spine: [-0.06, -0.12, -0.05], head: [-0.1, -0.4, 0],
  shL: [0.12, 0, -0.95], elL: el(0.45), shR: [0.18, 0, 2.3], elR: el(0.7),
  hpL: limb(0.06, -0.3), knL: el(-0.15), anL: [-0.5, 0, -0.3], hpR: limb(0.55, 0.4), knR: el(-1), anR: el(-0.3) };
export const LIE_Y = 0.17;
export const LIE_BACK = { root: { yaw: 0, lean: 0, x: 0, y: LIE_Y - HIP_Y }, ...FLAT };

// ── 동작 굽기 ──
const SPINE_Y = 0.035, SH_X = 0.25, SH_Y = 0.434, UPARM = 0.289, FORE = 0.3;   // 골반에서 허리 관절, 허리에서 어깨(옆·위), 위팔, 팔꿈치에서 손 가운데까지
// 손이 hand 에 오게 하는 [어깨, 팔꿈치] 각. chest 는 가슴의 방향, (sx, sy, sz) 는 어깨의 자리.
// hand: [x, y, z, 팔꿈치를 팔의 축으로 돌리기]. 돌리지 않은 팔꿈치는 뒤·바깥·아래를 향한다. 닿지 않는 자리면 그쪽으로 팔을 편다
function reach(s, chest, sx, sy, sz, hand) {
  const ax = hand[0] - sx, ay = hand[1] - sy, az = hand[2] - sz;
  let dx = chest[0] * ax + chest[3] * ay + chest[6] * az, dy = chest[1] * ax + chest[4] * ay + chest[7] * az, dz = chest[2] * ax + chest[5] * ay + chest[8] * az;
  const far = Math.hypot(dx, dy, dz) || 1e-9, len = clamp(far, 0.08, UPARM + FORE - 1e-3);
  dx /= far; dy /= far; dz /= far;
  // 팔꿈치가 나갈 쪽에서 팔의 축과 나란한 몫을 뺀다
  const along = s * 0.5 * dx - 0.5 * dy + dz;
  let qx = s * 0.5 - along * dx, qy = -0.5 - along * dy, qz = 1 - along * dz;
  const q = Math.hypot(qx, qy, qz) || 1e-9;
  qx /= q; qy /= q; qz /= q;
  T2[0] = dz * qy - dy * qz; T2[1] = -dx; T2[2] = qx; T2[3] = dx * qz - dz * qx; T2[4] = -dy; T2[5] = qy; T2[6] = dy * qx - dx * qy; T2[7] = -dz; T2[8] = qz;
  // 손을 겨눈 뒤, 그 축으로 팔꿈치를 돌리고, 위팔을 팔꿈치 쪽으로 젖힌다
  const tilt = Math.acos(clamp((UPARM * UPARM + len * len - FORE * FORE) / (2 * UPARM * len), -1, 1));
  mul(HIP, mul(T3, T2, xyz(T1, 0, hand[3] || 0, 0)), xyz(T1, -tilt, 0, 0));
  return [between(IDENT, HIP), [Math.PI - Math.acos(clamp((UPARM * UPARM + FORE * FORE - len * len) / (2 * UPARM * FORE), -1, 1)), 0, 0]];
}

const EASE = { lin: u => u, in: u => u * u, out: u => u * (2 - u) };
// 풀어서 얻는 팔다리: [발·손 자리의 이름, 좌우, 풀어 얻는 관절들]
const LIMBS = [['L', -1, ['hpL', 'knL', 'anL']], ['R', 1, ['hpR', 'knR', 'anR']], ['HL', -1, ['shL', 'elL']], ['HR', 1, ['shR', 'elR']]];
const TRUNK = ['hips', 'spine', 'head'];
const six = f => Array.from({ length: 6 }, (_, i) => f[i] || 0);
const FRAME = mat(), CHEST = mat();
// 골반과 가슴의 방향을 잡는다. 몸 전체를 돌리고(yaw) 뒤로(pitch)·옆으로(roll) 눕힌 다음, 몸의 축으로 틀고(twist) 골반과 허리 관절을 돌린다
function frames(rot, twist, hips, spine) {
  mul(T3, xyz(T1, 0, rot[1], 0), xyz(T2, rot[0], 0, rot[2]));
  mul(BODY, T3, xyz(T1, 0, twist, 0));
  mul(FRAME, BODY, xyz(T1, hips[0], hips[1], hips[2]));
  mul(CHEST, FRAME, xyz(T1, spine[0], spine[1], spine[2]));
}
// frames 로 잡아 둔 몸에서 팔다리 하나를 푼다. P 는 골반의 자리
function solve(name, s, P, to) {
  if (name.length < 2) return leg(s, FRAME, P[0], P[1], P[2], to);
  const x = s * SH_X, y = SPINE_Y;
  return reach(s, CHEST, P[0] + FRAME[1] * y + CHEST[0] * x + CHEST[1] * SH_Y, P[1] + FRAME[4] * y + CHEST[3] * x + CHEST[4] * SH_Y, P[2] + FRAME[7] * y + CHEST[6] * x + CHEST[7] * SH_Y, to);
}

// 표식으로 적은 동작을 촘촘한 키로 굽는다.
// 표식: { t(초), ease?, P: 골반의 자리, rot: [뒤로 눕기, 돌아서기, 옆으로 눕기], twist: 몸의 축으로 틀기, arc: 이 표식으로 오는 동안 골반이 더 뜨는 높이,
//   몸통 관절(hips, spine, head), 팔다리마다 발·손의 자리(L·R: leg 의 foot, HL·HR: reach 의 hand) 또는 관절 각 }.
// 안 적은 값은 앞 표식에서 물려받는다. ride 를 켠 표식에 적은 자리는 골반 밑에서 잰 것이고, 다시 적을 때까지 골반을 따라다닌다(미끄러지는 몸).
// 두 표식에 모두 자리가 있는 팔다리는 그 사이를 자리로 이어서 풀기 때문에, 골반이 움직여도 디딘 발과 짚은 손이 미끄러지지 않는다.
// 돌려주는 동작의 keys 는 골반에 매단 자세, path 는 그 골반이 가는 길이다
//   (x 경기장 오른쪽, y 땅에서 뜬 높이, z 내 선수 쪽, pitch·yaw·roll 은 rot 그대로)
export function bake(marks, step = 1 / 60) {
  let prev = { rel: {} };
  const full = marks.map(m => {
    const f = { ...prev, ...m, arc: m.arc || 0, ease: m.ease, rel: { ...prev.rel } };
    frames(f.rot, f.twist, f.hips, f.spine);
    for (const [name, s, joints] of LIMBS) {
      if (m[joints[0]]) { f[name] = null; delete f.rel[name]; }   // 관절 각으로 적은 팔다리는 풀지 않는다
      else if (m[name]) { f[name] = six(m[name]); if (m.ride) f.rel[name] = f[name]; else delete f.rel[name]; }
      if (f.rel[name]) f[name] = f.rel[name].map((v, i) => (i === 0 || i === 2 ? v + f.P[i] : v));
      if (f[name]) solve(name, s, f.P, f[name]).forEach((v, i) => { f[joints[i]] = v; });
    }
    return prev = f;
  });
  const dur = full.at(-1).t, n = Math.round(dur / step), keys = [], path = [];
  for (let j = 0, i = 1; j <= n; j++) {
    const t = dur * j / n;
    while (i < full.length - 1 && t > full[i].t) i++;
    const a = full[i - 1], b = full[i], k = (EASE[b.ease] || smooth)(clamp((t - a.t) / (b.t - a.t), 0, 1));
    const P = mixv(a.P, b.P, k), rot = mixv(a.rot, b.rot, k), twist = lerp(a.twist, b.twist, k), key = { t: j / n, ease: 'lin' };
    P[1] += b.arc * 4 * k * (1 - k);
    for (const u of TRUNK) key[u] = mixv(a[u], b[u], k);
    frames(rot, twist, key.hips, key.spine);
    for (const [name, s, joints] of LIMBS) {
      if (a[name] && b[name]) {
        const to = mixv(a[name], b[name], k);
        // 땅에서 땅으로 옮겨 딛는 발은 간 거리만큼 들었다 놓는다
        if (name.length < 2 && a[name][1] < 0.03 && b[name][1] < 0.03) to[1] += Math.min(0.14, 0.3 * Math.hypot(b[name][0] - a[name][0], b[name][2] - a[name][2])) * Math.sin(Math.PI * k);
        solve(name, s, P, to).forEach((v, q) => { key[joints[q]] = v; });
      } else for (const q of joints) key[q] = mixv(a[q], b[q], k);
    }
    key.root = { yaw: twist, lean: 0, x: 0, y: P[1] - HIP_Y };
    keys.push(key);
    path.push({ t: j / n, ease: 'lin', root: { x: -P[0], y: P[1], z: -P[2], pitch: rot[0], yaw: rot[1], roll: rot[2] } });
  }
  return { dur, hold: true, keys, path: { keys: path } };
}

// 선 자세를 동작의 첫 표식으로. z 는 선 자리에서 뒤로 물러난 거리
const mark = (S, z = 0) => ({ t: 0, P: [0, HIP_Y + S.y, z], rot: [0, 0, 0], twist: 0, ...upper(S),
  L: S.L.map((v, i) => (i === 2 ? v + z : v)), R: S.R.map((v, i) => (i === 2 ? v + z : v)) });
const TELL = KEEPER_TELL * TICK, FLY = KEEPER_FLY * TICK;

// 태클을 벼르던 자리에서 내달리는 첫걸음들. 팔을 엇갈려 흔든다
const DASH_L = { hips: [-0.25, -0.1, 0], spine: [-0.4, 0.25, 0], shL: arm(-1, -0.7, 0, 0.2), elL: el(1.4), shR: arm(1, 0.8, 0, 0.2), elR: el(1.4) };
const DASH_R = { hips: [-0.2, 0.1, 0], spine: [-0.3, -0.25, 0], shL: arm(-1, 0.8, 0, 0.2), shR: arm(1, -0.7, 0, 0.2) };

// 맞아서 쓰러지는 동작. far 는 날아가는 거리의 배율, spin 은 누웠을 때 몸이 돌아가 있는 각, end 는 누운 몸의 관절
const knock = (far, spin, end) => bake([
  mark(GUARD),
  // 맞는 순간: 배가 뒤로 밀리며 몸이 접히고, 팔과 머리는 제자리에 남아 앞으로 쏠린다
  { t: 0.07, ease: 'out', P: [-0.03, 0.74, 0.16], rot: [0.12, 0, 0], hips: [0.3, 0, 0], spine: [-0.8, 0, 0], head: [0.6, 0, 0],
    shL: arm(-1, 1, 0, 0.5), elL: el(0.4), shR: arm(1, 1.1, 0, 0.45), elR: el(0.5), L: [-0.3, 0, -0.1, -0.6, 0.2], R: [0.33, 0, -0.08, -0.6, -0.2] },
  // 발이 땅을 떠나 뒤로 날아간다. 다리가 딸려 올라오고 윗몸이 넘어간다
  { t: 0.24, ease: 'lin', arc: 0.03, P: [-0.18 * far, 0.62, 0.95 * far], rot: [0.75, 0.45 * spin, 0.05], hips: [0.1, 0, 0], spine: [-0.4, 0.1, 0], head: [0.5, 0, 0],
    shL: arm(-1, 1.3, 0, 0.9), elL: el(0.3), shR: arm(1, 1, 0, 1.1), elR: el(0.6),
    hpL: limb(1.15, -0.2), knL: el(-0.45), anL: el(-0.4), hpR: limb(0.85, 0.3), knR: el(-0.9), anR: el(-0.3) },
  // 등과 어깨로 떨어진다. 다리는 아직 떠 있고 팔이 양옆으로 내던져진다
  { t: 0.42, ease: 'lin', arc: 0.035, P: [-0.36 * far, 0.2, 1.78 * far], rot: [1.44, 0.8 * spin, 0.03], hips: [0.25, 0, 0], spine: [0.05, 0.1, 0], head: [0.1, 0.2, 0],
    shL: arm(-1, 0.5, 0, 1.9), elL: el(0.5), shR: arm(1, 0.4, 0, 1.5), elR: el(0.6),
    hpL: limb(1.45, -0.3), knL: el(-0.7), anL: el(-0.3), hpR: limb(1.2, 0.35), knR: el(-1.2), anR: el(-0.3) },
  // 한 번 튕기며 미끄러지고
  { t: 0.56, ease: 'out', arc: 0.04, P: [-0.46 * far, 0.19, 2.12 * far], rot: [1.5, 0.9 * spin, 0], hips: [0.1, 0, 0], spine: [-0.05, 0.1, 0.05],
    shL: arm(-1, 0.25, 0, 2), shR: arm(1, 0.2, 0, 1), hpL: limb(1, -0.4), knL: el(-1.3), hpR: limb(0.5, 0.3), knR: el(-0.6) },
  // 팔다리가 제풀에 떨어져 눕는다
  { t: 0.9, P: [-0.5 * far, LIE_Y, 2.25 * far], rot: [1.5, spin, 0], ...end },
]);

// 한 번 하고 끝 자세에 머무는 동작
export const CLIPS = {
  // 공을 뺏는다. 공은 막은 선수의 옆 0.55m, 내 선수 쪽 0.15m 에 멈춘다(hero.js)
  tackle: bake([
    { ...mark(GUARD), P: [0.02, 0.66, -0.02], spine: [-0.4, 0, 0] },
    // 버티는 다리에 몸을 싣고 낮추며, 다른 발을 발밑으로 들어온 공에 갖다 댄다
    { t: 0.14, ease: 'out', P: [0.1, 0.56, 0], L: [-0.18, 0.04, 0.05, 0.1, 0.5], R: [0.33, 0, 0.02, 0, -0.3], hips: [-0.2, 0.15, 0], spine: [-0.45, 0.2, 0.1], head: [0.4, 0.2, 0],
      shL: arm(-1, 0, 0.3, 0.95), elL: el(0.5), shR: arm(1, 0.5, 0.3, 0.85), elR: el(0.8) },
    // 그 발의 바깥날로 공을 옆으로 끌어낸다
    { t: 0.32, P: [-0.05, 0.6, -0.02], L: [-0.4, 0.02, -0.12, 0, 0.55], spine: [-0.4, 0.3, 0], shL: arm(-1, 0.1, 0.3, 0.8), shR: arm(1, 0.2, 0.3, 0.9) },
    // 공 쪽으로 돌아서며 내 선수와 공 사이에 몸을 넣는다
    { t: 0.62, P: [-0.26, 0.68, 0.02], rot: [0, 0.45, 0], L: [-0.42, 0, -0.1, 0, 0.65], R: [-0.06, 0, 0.14, -0.1, 0.3], hips: [-0.12, 0, 0], spine: [-0.3, -0.2, 0], head: [0.3, -0.3, 0],
      shL: arm(-1, 0.25, 0.4, 0.5), elL: el(0.7), shR: arm(1, -0.25, 0.2, 1), elR: el(0.35) },
    // 공에 발을 얹고, 한 팔로 내 선수를 막아 선다
    { t: 0.95, P: [-0.3, 0.74, 0.04], rot: [0, 0.65, 0], L: [-0.5, 0.24, -0.09, -0.2, 0.7], R: [-0.1, 0, 0.12, 0, 0.45], hips: [-0.06, 0, 0], spine: [-0.14, -0.3, 0.05], head: [0.1, -0.5, 0],
      shL: arm(-1, 0.15, 0.3, 0.4), elL: el(0.5), shR: arm(1, -0.2, 0.1, 0.95), elR: el(0.25) },
    { t: 1.2, P: [-0.3, 0.75, 0.04], spine: [-0.1, -0.3, 0.04] },
  ]),

  // 제쳐졌다: 엉뚱한 쪽으로 다리를 뻗었다가 휘청이며 돌아서서, 멀어지는 내 선수를 돌아본다
  beaten: bake([
    mark(GUARD),
    { t: 0.13, ease: 'out', P: [-0.3, 0.57, -0.1], rot: [0, 0.1, 0], L: [-0.88, 0.04, -0.3, 0.3, 0.5], R: [0.06, 0, 0.02, -0.3, -0.2], hips: [-0.15, 0, 0], spine: [-0.4, 0.25, -0.15], head: [0.35, 0.3, 0],
      shL: arm(-1, 0.15, 0.3, 1.05), elL: el(0.35), shR: arm(1, -0.5, 0.2, 1.25), elR: el(0.6) },
    // 발이 땅에 박히고 몸은 그쪽으로 더 쏠리는데, 어깨와 머리는 반대로 지나가는 내 선수를 따라 돌아간다
    { t: 0.3, P: [-0.5, 0.6, -0.06], rot: [0, -0.15, 0], L: [-0.9, 0, -0.28, 0, 0.5], R: [0, 0.07, 0.14, -0.5, -0.4], spine: [-0.3, -0.55, 0.12], head: [0.25, -0.6, 0],
      shL: arm(-1, 0.6, 0.2, 1.3), elL: el(0.5), shR: arm(1, -0.7, 0.2, 0.9), elR: el(0.4) },
    // 버티던 발을 뒤로 크게 내디뎌 몸을 받친다
    { t: 0.52, P: [-0.36, 0.64, 0.14], rot: [0, -0.75, 0], R: [0.15, 0, 0.5, 0, -1.1], spine: [-0.38, -0.45, 0], head: [0.3, -0.5, 0],
      shL: arm(-1, 0.9, 0.2, 0.9), elL: el(0.8), shR: arm(1, -0.3, 0.3, 0.7), elR: el(0.9) },
    // 앞에 남은 발을 끌어와 돌아선다
    { t: 0.85, P: [-0.05, 0.71, 0.3], rot: [0, -1.7, 0], L: [-0.05, 0, 0.16, 0, -1.4], spine: [-0.28, -0.3, 0], head: [0.25, -0.3, 0],
      shL: arm(-1, 0.3, 0.4, 0.5), elL: el(0.9), shR: arm(1, 0.1, 0.4, 0.5), elR: el(0.9) },
    { t: 1.25, P: [0.05, 0.76, 0.36], rot: [0, -2.2, 0], L: [-0.02, 0, 0.2, 0, -1.9], R: [0.15, 0, 0.5, 0, -1.9], spine: [-0.15, -0.2, 0], head: [0.15, -0.2, 0],
      shL: arm(-1, 0.1, 0.3, 0.3), elL: el(0.5), shR: arm(1, 0.5, 0.3, 0.4), elR: el(1.1) },
  ]),

  // 공이나 달려오는 선수에 맞았다. 한 줄에서 같이 쓰러져도 같은 모습이 되지 않게 몇 가지를 둔다
  knocked: knock(1, 0.22, FLAT), knockedB: knock(0.8, -0.35, SPRAWL), knockedC: knock(1.15, 0.5, SPRAWL), knockedD: knock(0.9, -0.1, FLAT),

  // 골키퍼가 몸을 날린다. 앞의 KEEPER_TELL 틱은 날 쪽을 알리는 몸짓, 뒤의 KEEPER_FLY 틱은 날아서 눕기까지다.
  // 끝에는 선 자리에서 옆으로 2.25m 인 곳(막는 두 레인의 가운데)을 몸 한가운데로 해서 옆으로 눕는다
  save: bake([
    mark(KEEPER),
    // 날 쪽 발을 떼며 몸을 낮춘다
    { t: TELL * 0.28, P: [0.03, 0.63, 0], L: [-0.32, 0.05, -0.1, -0.1, 0.3, 0.2], spine: [-0.36, 0, -0.04] },
    // 그 발을 옆으로 내디뎌 무릎을 굽히고, 두 손이 먼저 그쪽 아래로 간다
    { t: TELL * 0.61, P: [-0.12, 0.6, -0.02], rot: [0, 0, 0.1], L: [-0.42, 0, -0.12, 0, 0.6, 0.35], spine: [-0.34, 0.1, 0.1], head: [0.36, 0.2, 0],
      HL: [-0.6, 0.5, -0.38], HR: [-0.12, 0.56, -0.42] },
    // 그 다리에 몸을 다 싣는다
    { t: TELL, ease: 'in', P: [-0.4, 0.52, -0.04], rot: [0, 0, 0.38], R: [0.3, 0, -0.08, -0.5, -0.25, -0.15], hips: [-0.2, 0, 0], spine: [-0.3, 0.15, 0.2], head: [0.36, 0.3, 0],
      HL: [-1.0, 0.36, -0.3], HR: [-0.62, 0.46, -0.4] },
    // 박찬다: 디딘 다리를 다 펴고, 반대쪽 무릎을 끌어 올리며 두 손을 날 쪽으로 내뻗는다
    { t: TELL + FLY * 0.24, ease: 'lin', P: [-0.92, 0.72, -0.06], rot: [0, 0, 1.05], L: [-0.42, 0, -0.12, -0.9, 0.6, 0.35], hips: [0, 0, 0], spine: [-0.1, 0.1, 0.15], head: [0.2, 0.2, 0],
      HL: [-1.98, 0.78, -0.2], HR: [-1.78, 0.98, -0.25], hpR: limb(0.75, 0.15), knR: el(-1.3), anR: el(-0.3) },
    // 몸을 눕혀 날아가, 손과 옆구리부터 떨어진다
    { t: TELL + FLY * 0.76, ease: 'lin', arc: 0.1, P: [-2.02, 0.31, -0.06], rot: [0, 0, 1.42], spine: [0, 0, 0.05], head: [0.1, 0, 0],
      HL: [-3.14, 0.12, -0.16], HR: [-3.06, 0.32, -0.2],
      hpL: limb(0, 0.04), knL: el(-0.12), anL: el(-0.6), hpR: limb(0.4, 0.1), knR: el(-0.6), anR: el(-0.5) },
    // 조금 미끄러지며 멎는다. 밑의 다리는 펴고 위의 다리는 무릎을 앞으로 접어 땅에 댄다
    { t: TELL + FLY * 0.86, ease: 'out', P: [-2.08, 0.27, -0.05], ride: true,
      HL: [-1.1, 0.09, -0.12], HR: [-1.06, 0.26, -0.16], L: [0.72, 0.04, 0.03, 0, -1.57], R: [0.4, 0.04, -0.34, 0, -1.2, 0.9] },
    // 위의 손을 가슴 앞 땅에 짚는다
    { t: TELL + FLY, P: [-2.1, 0.27, -0.05], ride: true, HR: [-0.56, 0.07, -0.26] },
  ]),

  // 미끄러지는 태클(한 레인). 선 자리보다 뒤에서 벼르다가 내 선수 쪽으로 곧장 내달려 미끄러져 들어온다.
  // drop 부터는 몸이 땅으로 내려가는 중이다
  slide: Object.assign(bake([
    mark(COILED, 3),
    // 뒷발부터 두 걸음 내달린다
    { t: 0.09, P: [0, 0.69, 2.72], L: [-0.1, 0, 2.38, 0.1], ...DASH_L },
    { t: 0.18, P: [0, 0.7, 2.3], R: [0.1, 0, 1.85, 0.1], ...DASH_R },
    // 마지막 발을 멀리 앞에 박고 몸을 뒤로 젖힌다
    { t: 0.26, P: [0, 0.6, 1.9], rot: [0.22, 0.1, 0], L: [-0.08, 0, 1.38, 0.25, 0.5, 0.3], R: [0.1, 0, 1.85, -0.5], hips: [0, 0, 0], spine: [-0.2, 0.1, 0], head: [0.1, 0, 0],
      shL: arm(-1, -0.3, 0.2, 0.9), elL: el(0.5), shR: arm(1, 0.2, 0.2, 1.1), elR: el(0.6) },
    // 박은 다리가 접히며 주저앉고, 다른 다리는 앞으로 뻗어 나간다. 왼손이 뒤쪽 땅을 찾는다
    { t: 0.35, ease: 'lin', P: [0.02, 0.38, 1.55], rot: [0.8, 0.2, 0], twist: 0.25, R: [0.06, 0.28, 0.95, 0.7, 0.2], spine: [-0.35, 0.15, 0], head: [-0.15, 0, 0],
      HL: [-0.42, 0.32, 2.02], HR: [0.55, 0.85, 1.6] },
    // 엉덩이가 땅에 닿아 미끄러진다: 오른다리는 발바닥을 세워 앞으로 곧게, 왼다리는 접어 그 밑에 깔고, 왼손으로 뒤쪽 땅을 짚는다
    { t: 0.42, ease: 'lin', P: [0.04, 0.2, 1.2], rot: [1.28, 0.28, 0], twist: 0.35, ride: true, spine: [-0.05, 0.15, 0], head: [-0.4, 0, 0],
      L: [0.02, 0.04, -0.4, 0, -1.4, 1.27], R: [-0.22, 0.16, -0.8, 1.1, 0.3], HL: [-0.58, 0.07, 0.3], HR: [0.66, 0.55, 0.2] },
    // 느려지며 윗몸이 앞으로 쏠렸다가
    { t: 0.94, ease: 'out', P: [0.05, 0.19, 0.02], rot: [1.36, 0.3, 0], spine: [-0.22, 0.15, 0], head: [-0.3, 0, 0] },
    // 멎으며 제자리로 돌아온다
    { t: 1, P: [0.05, 0.19, 0], spine: [-0.12, 0.15, 0] },
  ], 1 / 100), { drop: 0.26 }),

  // 가로로 누워 두 레인을 막는 태클. 두 레인 사이의 줄 위에서 벼르다가 내달려, 몸을 옆으로 돌려 눕히며 미끄러져 들어온다
  slideWide: Object.assign(bake([
    mark(COILED, 3),
    { t: 0.11, P: [0, 0.69, 2.62], L: [-0.1, 0, 2.2, 0.1], ...DASH_L },
    // 다음 발을 가로로 박으며 몸을 옆으로 돌린다
    { t: 0.24, P: [0.06, 0.6, 1.95], rot: [0.1, 0.6, 0], R: [0.12, 0, 1.5, 0.2, 0.9], L: [-0.1, 0, 2.2, -0.5], hips: [0, 0, 0], spine: [-0.2, -0.2, 0], head: [0.1, -0.4, 0],
      shL: arm(-1, 0.2, 0.2, 1.1), elL: el(0.6), shR: arm(1, -0.3, 0.2, 0.9), elR: el(0.5) },
    // 뒤로 주저앉으며 두 다리를 옆으로 내뻗는다. 오른손이 머리 쪽 땅을 찾는다
    { t: 0.34, ease: 'lin', P: [0, 0.38, 1.55], rot: [0.75, 1.1, 0], twist: -0.3, L: [-0.55, 0.3, 1.3, 0.3, 1.2], spine: [-0.25, 0, 0], head: [-0.1, -0.2, 0],
      HL: [-0.2, 0.75, 1.1], HR: [0.6, 0.3, 1.75] },
    // 옆구리가 땅에 닿아 미끄러진다: 밑의 다리와 머리 위로 뻗은 팔이 땅에 닿아, 발끝에서 손끝까지 길게 편다
    { t: 0.42, ease: 'lin', P: [-0.1, 0.21, 1.2], rot: [1.3, 1.4, 0], twist: -0.5, ride: true, spine: [-0.1, 0, 0], head: [-0.3, 0, 0],
      L: [-0.85, 0.25, -0.3, 0.3, 1.2], R: [-0.8, 0.04, -0.1, 0, 1.5], HL: [0.35, 0.07, -0.22], HR: [1.15, 0.08, 0.1] },
    { t: 0.94, ease: 'out', P: [-0.13, 0.2, 0.05], rot: [1.4, 1.4, 0], twist: -0.6 },
    { t: 1, P: [-0.13, 0.2, 0.05] },
  ], 1 / 100), { drop: 0.24 }),
};

// 맞아서 쓰러지는 동작들. 선수마다 하나를 고른다
export const KNOCKS = [CLIPS.knocked, CLIPS.knockedB, CLIPS.knockedC, CLIPS.knockedD];
// 옆으로 누워 두 팔을 머리 위로 뻗은 몸(몸을 날린 골키퍼의 끝 자세)
export const LIE_SIDE = (({ t, ease, ...pose }) => pose)(CLIPS.save.keys.at(-1));
