// 자세와 동작 자료를 다루는 순수 함수. three 를 모르고, 관절의 rotation·position 숫자만 읽고 쓴다.
//
// 자세(pose): { 관절이름: [x, y, z] 회전(라디안), root: { yaw, y, x, lean }, ball: { x, y, z } }
//   root.y·x 는 골반이 선 자세에서 벗어난 높이·옆 거리(m), yaw·lean 은 몸 전체를 발밑 축으로 돌린 y·z 회전.
//   ball 은 발밑 가운데에서 잰 공의 자리(m). 앞이 -z, 오른쪽이 +x.
//   없는 관절이나 값은 "건드리지 않는다"는 뜻이다.
// 동작(clip): { dur 초, keys: [{ t 0..1, ease?, ...자세 }], hold?, loop? }
//   ease 는 그 키에 도착하는 구간의 빠르기: 'lin' | 'in' | 'out', 없으면 부드럽게.

export const JOINTS = ['hips', 'spine', 'head', 'shL', 'elL', 'shR', 'elR', 'hpL', 'knL', 'anL', 'hpR', 'knR', 'anR'];

export const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const EASE = { lin: u => u, in: u => u * u, out: u => u * (2 - u) };

// 양 끝(t = 0, 1)에서 a, b 가 오차 없이 그대로 나오는 꼴
const mix = (a, b, t) => a * (1 - t) + b * t;

function mixFields(a, b, t) {
  const out = { ...a };
  for (const k in b) out[k] = k in a ? mix(a[k], b[k], t) : b[k];
  return out;
}

// 두 자세를 섞는다. 한쪽에만 있는 관절과 값은 그대로 남는다
export function blend(a, b, t) {
  const out = {};
  for (const k of JOINTS) {
    const va = a[k], vb = b[k];
    if (va && vb) out[k] = [mix(va[0], vb[0], t), mix(va[1], vb[1], t), mix(va[2], vb[2], t)];
    else if (va || vb) out[k] = [...(va || vb)];
  }
  for (const k of ['root', 'ball']) {
    if (a[k] && b[k]) out[k] = mixFields(a[k], b[k], t);
    else if (a[k] || b[k]) out[k] = { ...(a[k] || b[k]) };
  }
  return out;
}

// 동작의 u(0..1) 시점 자세
export function sample(clip, u) {
  const ks = clip.keys;
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1], b = ks[i];
    if (u < b.t) return blend(a, b, u <= a.t ? 0 : (EASE[b.ease] || smooth)((u - a.t) / (b.t - a.t)));
  }
  const last = ks[ks.length - 1];
  return blend(last, last, 0);
}

const other = k => (k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k);

// 좌우를 뒤집은 자세. 오른쪽으로 가는 동작만 만들어 두고 왼쪽은 이것으로 얻는다
export function mirror(pose) {
  const out = {};
  for (const k in pose) {
    const v = pose[k];
    if (k === 'root') { out.root = { ...v }; for (const f of ['yaw', 'x', 'lean']) if (f in v) out.root[f] = -v[f]; }
    else if (k === 'ball') out.ball = { ...v, x: -v.x };
    else out[other(k)] = [v[0], -v[1], -v[2]];
  }
  return out;
}

// 바탕 자세 위에 동작을 얹는다. 동작의 뒤쪽 30% 는 바탕에 섞여 들고, hold 동작은 끝 자세에 머문다
export function layer(base, clip, u, flip = false) {
  const p = sample(clip, u);
  return blend(base, flip ? mirror(p) : p, clip.hold ? 1 : smooth((1 - u) / 0.3));
}

// 자세를 캐릭터에 넣는다. weight 가 1 보다 작으면 지금 자세에서 그만큼만 다가간다
export function apply(rig, pose, weight = 1) {
  for (const k of JOINTS) {
    const v = pose[k];
    if (!v) continue;
    const r = rig.j[k].rotation;
    r.x += (v[0] - r.x) * weight; r.y += (v[1] - r.y) * weight; r.z += (v[2] - r.z) * weight;
  }
  const root = pose.root;
  if (!root) return;
  const p = rig.j.hips.position, b = rig.body.rotation;
  if ('y' in root) p.y += (rig.legLen + root.y - p.y) * weight;
  if ('x' in root) p.x += (root.x - p.x) * weight;
  if ('yaw' in root) b.y += (root.yaw - b.y) * weight;
  if ('lean' in root) b.z += (root.lean - b.z) * weight;
}
