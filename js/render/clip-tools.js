// 동작을 적는 도구. 기술은 발이 공에 닿아야 하므로 다리를 발이 갈 자리로 적고, 불러올 때 관절 각으로 풀어 굽는다.
import { smooth, mirror } from './anim.js';
import { TICK, MOVE_TICKS, LANE_W } from '../sim/constants.js';
// clips-run.js 와는 서로 불러온다. 양쪽 다 상대의 것을 함수 안에서만 쓰므로 어느 쪽이 먼저 불려도 된다
import { RUN } from './clips-run.js';

export const BALL_R = 0.12;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ── 발 자리로 다리 풀기 ──
// 자리는 발밑 가운데에서 잰 값이라 몸이 돌거나 기울어도 디딘 발은 그 자리에 남는다.
const THIGH = 0.35, HIP_X = 0.126, HIP_Y = 0.805;   // rig.js 의 몸 비율(키 1.75m): 허벅지 = 정강이, 골반 반폭, 선 골반 높이
const BOOT = { r: 0.068, drop: 0.037, toe: 0.16 };   // 신발 캡슐: 반지름, 발목에서 축까지 내려간 거리, 앞 끝까지
const KNEE = 0.7, KNEE_MAX = 0.9;                    // 발끝을 돌리면 무릎도 이 몫만큼, 이 각까지 따라 돈다

// 3×3 회전 행렬(행 차례)
const rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mul = (a, b) => a.map((_, i) => { const r = i - i % 3, c = i % 3; return a[r] * b[c] + a[r + 1] * b[c + 3] + a[r + 2] * b[c + 6]; });
const tr = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const rot = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
// 행렬을 관절이 쓰는 x → y → z 차례의 각으로
const euler = m => [Math.atan2(-m[5], m[8]), Math.asin(clamp(m[2], -1, 1)), Math.atan2(-m[1], m[0])];

// 발 자리 [x, y, z, 발끝 들기(+)·내리기(−), 발끝 왼쪽(+)·오른쪽(−) 돌리기] → [엉덩, 무릎, 발목]
// x·z 는 발목의 자리, y 는 신발 바닥의 가장 낮은 곳이 땅에서 뜬 높이. 닿지 않는 자리면 그쪽으로 다리를 편다
function solveLeg(side, root, hips, [x, y, z, pitch, turn]) {
  const body = mul(ry(root.yaw), rz(root.lean)), pelvis = [rx(hips[0]), ry(hips[1]), rz(hips[2])].reduce(mul, body);
  const boot = mul(ry(root.yaw + turn), rx(pitch));
  const ankleY = y + BOOT.r + BOOT.drop * Math.cos(pitch) + BOOT.toe * Math.max(0, -Math.sin(pitch));
  const hipsAt = rot(body, [root.x, HIP_Y + root.y, 0]), out = rot(pelvis, [side * HIP_X, 0, 0]);
  const d = rot(tr(pelvis), [x - hipsAt[0] - out[0], ankleY - hipsAt[1] - out[1], z - hipsAt[2] - out[2]]);
  const len = Math.hypot(...d), bend = 2 * Math.acos(clamp(len / (2 * THIGH), 0.3, 0.999));
  // 무릎은 골반 앞으로 굽되, 발끝이 골반과 다른 쪽을 보면 엉덩이를 틀어 그쪽으로 따라간다
  const twist = clamp(KNEE * (turn - hips[1]), -KNEE_MAX, KNEE_MAX);
  const hip = [rx(Math.atan2(-d[2], -d[1])), rz(Math.asin(clamp(d[0] / len, -1, 1))), ry(twist), rx(bend / 2)].reduce(mul);
  const shin = [pelvis, hip, rx(-bend)].reduce(mul);
  return [euler(hip), [-bend, 0, 0], euler(mul(tr(shin), boot))];
}

// 자세의 두 다리(왼쪽, 오른쪽): 발목의 자리와 신발의 방향
function legs(pose) {
  const root = { yaw: 0, lean: 0, x: 0, y: 0, ...pose.root }, turn = v => (v ? [rx(v[0]), ry(v[1]), rz(v[2])].reduce(mul) : rx(0));
  const body = mul(ry(root.yaw), rz(root.lean)), pelvis = mul(body, turn(pose.hips)), base = rot(body, [root.x, HIP_Y + root.y, 0]);
  return [[-1, 'L'], [1, 'R']].map(([s, side]) => {
    const thigh = mul(pelvis, turn(pose['hp' + side])), shin = mul(thigh, turn(pose['kn' + side])), foot = mul(shin, turn(pose['an' + side]));
    const hip = rot(pelvis, [s * HIP_X, 0, 0]), knee = rot(thigh, [0, -THIGH, 0]), down = rot(shin, [0, -THIGH, 0]);
    return { ankle: base.map((v, i) => v + hip[i] + knee[i] + down[i]), foot };
  });
}

// 자세를 넣었을 때 신발의 가장 낮은 곳이 땅에서 뜬 높이(m). 음수면 그만큼 잔디 밑으로 내려간 것이다
export function lowest(pose) {
  let low = Infinity;
  for (const { ankle, foot } of legs(pose)) for (const z of [-BOOT.toe, 0.004]) low = Math.min(low, ankle[1] + rot(foot, [0, -BOOT.drop, z])[1] - BOOT.r);
  return low;
}

// 발이 잔디 밑으로 내려간 자세는 그만큼 골반을 올려 발바닥이 땅에 닿게 한다. 두 자세를 관절 각으로 섞는 동안 생기는 꺼짐을 막는다
export function settle(pose) {
  const low = lowest(pose), root = pose.root || {};
  // 골반의 높이는 몸이 기운 축을 따라 재므로, 기운 만큼 더 올려야 땅에서 그 높이가 된다
  return low < 0 ? { ...pose, root: { ...root, y: (root.y || 0) - low / Math.cos(root.lean || 0) } } : pose;
}

// 자세의 두 발을 발 자리로 되돌린다. 달리기 자세를 동작의 키로 쓸 때 쓴다
function feet(pose) {
  return legs(pose).map(({ ankle, foot }) => {
    const f = rot(foot, [0, 0, -1]), pitch = Math.asin(clamp(f[1], -1, 1));
    const sole = ankle[1] - BOOT.r - BOOT.drop * Math.cos(pitch) - BOOT.toe * Math.max(0, -Math.sin(pitch));
    return [ankle[0], sole, ankle[2], pitch, Math.atan2(-f[0], -f[2]) - pose.root.yaw];
  });
}

// ── 규칙과 달리기에 맞추는 값 ──
// 옆 레인으로 가기 시작하고 sec 초 뒤에 규칙이 몸을 옆으로 옮겨 놓은 거리(m)
export const gone = sec => LANE_W * smooth(sec / (MOVE_TICKS * TICK));
export const DRIFT = 2.6;   // 달리는 몸에서 본 땅은 이 빠르기(m/s)로 뒤로 흐른다. 디딘 발은 땅과 같이 밀린다
// 동작의 끝은 달리기 자세로 적는다. hero.js 는 오른쪽으로 간 동작이 끝나는 순간의 걸음을 LAND 에 맞춰 두고, 걸음은 초속 17m 쯤일 때 초당 STRIDE 만큼 나아간다
const LAND = 1.5 * Math.PI, STRIDE = Math.PI * 2 * (1.214 + 0.0536 * 17), PACE = 0.4;
// 길이 dur 인 동작이 t 초에 넘겨줄 달리기 자세. far 면 공을 모는 발이 가는 쪽의 반대편(왼발)인 달리기다
export function runOut(dur, t, far = false) {
  const phase = LAND - STRIDE * (dur - t);
  return far ? mirror(RUN(phase - Math.PI, PACE)) : RUN(phase, PACE);
}
const STEP = 1 / 120;       // 굽는 간격(초). 빨리 도는 몸에서도 키 사이에 디딘 발이 흔들리지 않을 만큼 촘촘하다

// 동작을 시작할 때의 몸: 달리기의 가운데쯤 되는 자세. 첫 키에 안 적은 값은 여기서 출발한다
const REST = {
  yaw: [0], lean: [0], x: [0], y: [-0.07], hips: [0.05, 0, 0], spine: [-0.25, 0, 0], head: [0.13, 0, 0],
  shL: [0.1, -0.25, -0.2], shR: [0.1, 0.25, 0.2], elL: [1.4, 0, 0], elR: [1.4, 0, 0],
  L: [-0.1, 0, 0, 0, 0], R: [0.16, 0, 0, 0, 0], ball: [0.43, BALL_R, -0.75],
};
const ROOT = ['yaw', 'lean', 'x', 'y'], JOINT = ['hips', 'spine', 'head', 'shL', 'elL', 'shR', 'elR'];
const EASE = { lin: u => u, in: u => u * u, out: u => u * (2 - u) };

// 키들을 부드럽게 잇는 곡선의 키마다의 기울기. 값이 꺾이는 키와 양 끝에서는 0 이라 키 사이에서 값이 넘치지 않는다
const slopes = keys => keys.map((k, i) => k.v.map((v, c) => {
  if (i === 0 || i === keys.length - 1) return 0;
  const p = keys[i - 1], n = keys[i + 1], h0 = k.t - p.t, h1 = n.t - k.t, d0 = (v - p.v[c]) / h0, d1 = (n.v[c] - v) / h1;
  return d0 * d1 <= 0 ? 0 : 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
}));

// 한 값의 키 줄. at(t) 는 그 시각의 값, span(t) 는 그 시각이 든 구간 [앞 키, 뒤 키, 구간 안의 자리 0..1]
function track(keys) {
  const m = slopes(keys);
  const span = t => { let i = 1; while (i < keys.length - 1 && t > keys[i].t) i++; return [keys[i - 1], keys[i], clamp((t - keys[i - 1].t) / (keys[i].t - keys[i - 1].t), 0, 1), i]; };
  const at = t => {
    const [a, b, k, i] = span(t), h = b.t - a.t, k2 = k * k, k3 = k2 * k;
    if (b.ease) return a.v.map((v, c) => v + (b.v[c] - v) * EASE[b.ease](k));
    return a.v.map((v, c) => (2 * k3 - 3 * k2 + 1) * v + (k3 - 2 * k2 + k) * h * m[i - 1][c] + (3 * k2 - 2 * k3) * b.v[c] + (k3 - k2) * h * m[i][c]);
  };
  return { at, span };
}

// 키들(marks)을 동작으로 굽는다. 키: { t 초, ease?, 값들 }. 값: root 의 yaw·lean·x·y, 관절 각, 두 발 L·R, ball, carry, lob.
//   값마다 적힌 키끼리만 이어지므로, 한 키에 안 적은 값은 앞뒤 키 사이를 그대로 흘러간다. ease 가 없으면 부드러운 곡선, 공은 곧은 길이다.
//   L·R: 발 자리, 또는 stay() 로 땅에 디딘 채 두기, 또는 공에 대는 자리를 내는 함수(sole, edge, toe 들).
//   ball: 발이 건드릴 때만 키를 둔다. 그 사이는 잔디 위를 곧게 구른다(옆 이동 중에도 운동장에서 곧다). carry 면 발에 실려 몸을 따라가고, lob 은 그만큼 솟는 포물선이다.
// lane: 옆 레인으로 가는 동작이면 1. exit: 이 시각(초)부터는 달리기 자세다(공도 달리기의 공으로 간다). out: 그 달리기 자세를 주는 함수.
// drift: 디딘 발이 뒤로 밀리는 빠르기
export function bake(dur, marks, { lane = 0, exit = null, out = t => runOut(dur, t), drift = DRIFT } = {}) {
  const keys = Object.fromEntries(Object.keys(REST).map(c => [c, []]));
  const put = (c, t, v, more) => keys[c].push({ t, v, ...more });
  // 시각은 백만분의 일 초로 다듬는다: 셈에서 생긴 끝자리 차이로 같은 시각이 둘로 갈리지 않는다
  marks = marks.map(m => ({ ...m, t: Math.round(m.t * 1e6) / 1e6 })).sort((a, b) => a.t - b.t);
  for (const m of marks) {
    const more = { ease: m.ease };
    for (const c of ROOT) if (m.root && c in m.root) put(c, m.t, [m.root[c]], more);
    for (const c of JOINT) if (m[c]) put(c, m.t, m[c], more);
    for (const c of ['L', 'R']) if (m[c]) put(c, m.t, Array.isArray(m[c]) ? Array.from({ length: 5 }, (_, i) => m[c][i] || 0) : m[c], more);
    if (m.ball) put('ball', m.t, [m.ball.x, m.ball.y, m.ball.z], { ...more, carry: m.carry, lob: m.lob });
  }
  const times = new Set(marks.map(m => m.t));
  for (let i = 0; i < dur / STEP; i++) times.add(Math.round(i * STEP * 1e6) / 1e6);
  times.add(dur);
  for (const c in keys) if (!keys[c].length || keys[c][0].t > 0) keys[c].unshift({ t: 0, v: REST[c] });
  const flying = marks.some(m => m.ball && m.t >= exit);   // 달리기로 넘어간 뒤에도 공 키가 있으면 공은 끝까지 그 키를 따른다
  if (exit !== null) for (const t of [...times].filter(t => t >= exit).sort((a, b) => a - b)) {
    const p = out(t), [L, R] = feet(p), more = { ease: t > exit ? 'lin' : undefined };
    for (const c of ROOT) put(c, t, [p.root[c]], more);
    for (const c of JOINT) put(c, t, p[c], more);
    put('L', t, L, more); put('R', t, R, more);
    if (!flying) put('ball', t, [p.ball.x, p.ball.y, p.ball.z], { ...more, carry: true });
  }
  for (const c in keys) if (keys[c].length < 2) keys[c].push({ ...keys[c][0], t: dur });   // 키가 하나뿐인 값은 끝까지 그대로다

  const side = t => lane * gone(t), yaw = track(keys.yaw), ball = track(keys.ball);
  // 구르는 공은 운동장에서 곧게 간다: 옆으로 옮겨지는 몸에서 잰 자리로 바꿔 적는다
  const ballAt = t => {
    const [a, b, k] = ball.span(t);
    if (b.carry) return ball.at(t);
    const e = (EASE[b.ease] || EASE.lin)(k), x0 = a.v[0] + side(a.t), x1 = b.v[0] + side(b.t);
    return [x0 + (x1 - x0) * e - side(t), a.v[1] + (b.v[1] - a.v[1]) * e + 4 * (b.lob || 0) * k * (1 - k), a.v[2] + (b.v[2] - a.v[2]) * e];
  };
  const touch = (on, t) => { const [x, y, z] = ballAt(t); return on({ x, y, z }, yaw.at(t)[0]); };
  // 디딘 발은 운동장에 붙어 있다: 몸이 옆으로 가고 앞으로 달린 만큼 몸에서 본 자리가 밀리고, 몸이 돌아도 발끝은 spin 몫만큼만 따라 돈다
  const planted = (from, t, spin) => [from.v[0] + side(from.t) - side(t), 0, from.v[2] + drift * (t - from.t), 0, from.v[4] + (1 - spin) * (yaw.at(from.t)[0] - yaw.at(t)[0])];
  const foot = c => {
    keys[c].forEach((k, i) => {
      if (typeof k.v === 'function') { k.on = k.v; k.v = touch(k.on, k.t); }
      else if (!Array.isArray(k.v)) { const p = planted(keys[c][i - 1], k.t, k.v.spin); k.pin = k.v; k.v = [p[0], 0, p[2], k.pin.pitch, p[4]]; }
    });
    const tr = track(keys[c]);
    return t => {
      const [a, b, k] = tr.span(t), v = tr.at(t);
      if (b.pin) { const p = planted(a, t, b.pin.spin); return [p[0], v[1], p[2], v[3], p[4]]; }
      if (a.on && b.on) { const p = touch(a.on, t), n = touch(b.on, t); return p.map((x, i) => x + (n[i] - x) * k); }
      return v;
    };
  };
  const L = foot('L'), R = foot('R'), rest = Object.fromEntries([...ROOT, ...JOINT].map(c => [c, track(keys[c])]));

  return { dur, keys: [...times].sort((a, b) => a - b).map(t => {
    const [x, y, z] = ballAt(t), p = { t: t / dur, ease: 'lin', ball: { x, y, z } };
    for (const c of JOINT) p[c] = rest[c].at(t);
    // 키의 x·y 는 골반이 선 자리에서 벗어난 거리다. 몸은 발밑을 축으로 기울므로, 기울어도 골반이 그 자리에 오게 되돌려 적는다
    const lean = rest.lean.at(t)[0], c = Math.cos(lean), s = Math.sin(lean), px = rest.x.at(t)[0], py = HIP_Y + rest.y.at(t)[0];
    p.root = { yaw: rest.yaw.at(t)[0], lean, x: px * c + py * s, y: py * c - px * s - HIP_Y };
    [p.hpL, p.knL, p.anL] = solveLeg(-1, p.root, p.hips, L(t));
    [p.hpR, p.knR, p.anR] = solveLeg(1, p.root, p.hips, R(t));
    return p;
  }) };
}

// 달리기의 걸음에서 거꾸로 센 시각들(동작이 끝나기 전, 초): 오른발이 딛는 때와 떼는 때, 왼발이 딛는 때, 달리기 자세로 넘어가는 때
const STEP_R = 0.39, LIFT_R = 0.27, STEP_L = 0.21, OUT = 0.16;
// 옆 레인으로 가는 기술은 공이 있는 쪽에 따라 두 벌을 만든다. 달리기의 공은 모는 발 앞(SIDE 만큼 옆)에 있으므로,
// 그 발이 가는 쪽이면 공이 가는 쪽에서 출발해 가는 쪽에 남고, 반대편(far)이면 먼 쪽에서 출발해 먼 쪽에 남는다. 앞의 것이 동작 자체이고 뒤의 것은 그 .far 다
export const both = make => Object.assign(make(false), { far: make(true) });
const SIDE = 0.43;
// 아직 건드리지 않은 공이 t 초에 있는 자리: 운동장의 제자리에 있으므로 옆으로 가는 몸에서는 그만큼 밀려 보인다
export const still = (far, t, z) => B((far ? -SIDE : SIDE) - gone(t), z);
// 몸이 건너온 뒤 공이 굴러가 있는 자리: 모는 발의 앞이다
export const ahead = far => B(far ? -0.42 : 0.5, -0.86);
// 옆 레인으로 가는 기술: 규칙이 몸을 옆으로 옮기는 데 맞춰 굽고, 끝은 달리기로 이어진다
export const move = (dur, marks, far) => bake(dur, marks, { lane: 1, exit: dur - OUT, out: t => runOut(dur, t, far) });
// 건너간 몸이 가는 쪽(오른쪽) 발로 내려서서 달리기로 이어지는 뒷부분. at 에 오른발이 몸보다 앞서 가서 딛고, 몸이 그 위로 건너온다.
// 달리기에서 공을 모는 발은 바깥으로 벌려 딛고 다른 발은 몸 밑에 딛는다
export function land(dur, far, at = dur - STEP_R) {
  return [
    // 뒤꿈치부터 닿는다
    { t: at, root: { y: -0.11, x: -0.06, lean: -0.06, yaw: -0.2 }, R: [(far ? 0.05 : 0.11) + LANE_W - gone(at), 0, -0.22, 0.25, -0.15] },
    // 무릎으로 깊이 받는다. 윗몸은 가던 힘을 버티느라 반대쪽으로 남고, 가는 쪽 팔이 바깥으로 뻗어 균형을 잡으며 반대 팔은 접힌다. 고개는 들어 앞을 본다
    { t: at + 0.05, root: { y: -0.19, x: -0.03, lean: 0.1, yaw: -0.08 }, hips: [0.1, 0.12, 0.04], spine: [-0.4, -0.2, -0.08], head: [0.28, 0.1, 0.05],
      shL: [-0.5, 0, -0.5], elL: [1.5, 0, 0], shR: [0.3, 0, 1.0], elR: [0.6, 0, 0], L: [-0.14, 0.26, 0.18, -0.9] },
    // 발끝으로 땅을 차고 일어서며 달려 나간다
    { t: dur - LIFT_R, root: { x: 0, y: -0.1, lean: 0.02 }, R: stay(-0.6) },
    { t: dur - STEP_L - 0.03, L: [far ? -0.22 : -0.08, 0.08, -0.22, 0.2] },
    { t: dur - STEP_L, root: { y: -0.08, yaw: 0, lean: 0 }, L: [far ? -0.2 : -0.06, 0, -0.26, 0.12] },
  ];
}

// ── 키에 적는 값들 ──
export const B = (x, z, y = BALL_R) => ({ x, y, z });
// 디딘 채 두기: 앞 키의 자리에 이 키까지 붙어 있다. pitch 는 이 키에서 발끝을 내린(−) 각(뒤꿈치 들기), spin 은 몸이 돌 때 발이 따라 도는 몫(축발)
export const stay = (pitch = 0, spin = 0) => ({ pitch, spin });
// 공에 발을 대는 자리들. 그 순간의 공과 몸이 향한 쪽을 받아 발 자리를 내므로, 공을 끄는 동안 발이 공을 따라간다. foot: 왼발 -1, 오른발 1.
// 신발 옆날을 공 옆에 댄다. face: 발 안쪽 1 · 바깥쪽 -1, a: 발끝이 향한 쪽(앞이 0, 왼쪽이 +). 공은 옆날이 본 쪽으로 밀린다
export const edge = (foot, face, a, y = 0.02) => (b, yaw) => {
  const k = -foot * face * (BALL_R + BOOT.r), s = Math.sin(a), c = Math.cos(a), mid = (BOOT.toe - 0.004) / 2;
  return [b.x - k * c + mid * s, y, b.z + k * s + mid * c, 0, a - yaw];
};
export const outside = (foot, a = foot * 0.5, y) => edge(foot, -1, a, y);
export const inside = (foot, a = -foot * 0.4, y) => edge(foot, 1, a, y);
// 발바닥으로 공 위를 누른다
export const sole = (pitch = -0.15) => (b, yaw) => [b.x + 0.08 * Math.sin(yaw), b.y + BALL_R - 0.02, b.z + 0.08 * Math.cos(yaw), pitch, 0];
// 발끝(발등)을 공 뒤에 댄다. a: 미는 쪽(앞이 0, 왼쪽이 +)
export const toe = (a = 0, y = 0.03, pitch = -0.25) => (b, yaw) => {
  const c = Math.cos(pitch), s = Math.sin(pitch), tip = BOOT.toe * c + BOOT.drop * s;   // 발목에서 신발 앞 끝의 가운데까지 앞으로 나간 거리
  const far = tip + Math.sqrt(Math.max(0, (BALL_R + BOOT.r) ** 2 - (y + BOOT.r - b.y) ** 2));
  return [b.x + far * Math.sin(a), y, b.z + far * Math.cos(a), pitch, a - yaw];
};
