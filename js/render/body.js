// 몸의 그물. 팔다리를 내리고 선 자세에서 고리를 세로로 쌓아 몸통과 팔다리를 만들고, 정점마다 따라갈 뼈와 그 몫을 적는다.
// 관절 언저리의 고리는 두 뼈에 몫을 나눠 갖는다: 팔꿈치와 무릎이 꺾여도 끊기지 않고, 바지는 골반과 허벅지 사이에서 늘어난다.
// 앞은 -Z, 왼쪽(L)은 -X, 발밑 가운데가 원점이다.
import * as THREE from './three.js';

export const BONES = ['hips', 'spine', 'shL', 'elL', 'shR', 'elR', 'hpL', 'knL', 'anL', 'hpR', 'knR', 'anR'];
const BONE = Object.fromEntries(BONES.map((n, i) => [n, i]));

// 비율(키에 대한 비)을 길이(m)로 바꾼 치수와, 선 자세에서 관절이 부모 관절로부터 떨어진 거리
export function measure(P) {
  const H = P.H, T = P.torso * H, Lt = P.thigh * H, Ls = P.shin * H, fH = P.footH * H;
  const rTop = P.shoulderW * H / 2, headR = P.head * H / 2;
  return {
    H, T, Lt, Ls, fH, legLen: Lt + Ls + fH, rTop, rBot: P.waistW * H / 2, legR: P.legR * H, armR: P.armR * H, headR,
    uA: P.upArm * H, fA: P.foreArm * H, hand: P.hand * H, fl: P.footL * H, fw: P.footW * H, gap: P.legGap * H,
    spineY: 0.02 * H, shX: rTop * 0.97, shY: T * 0.8, neckR: headR * 0.42, neckH: P.neck * H + headR * 0.5,
    headY: T * 0.9 + rTop * 0.28 + P.neck * H + headR * 0.9,
  };
}

// 그물 하나를 모으는 그릇. uv 를 싣는 그물은 그림의 이음매에서 정점을 겹쳐 둔다
function gather(withUv) {
  const pos = [], nor = [], idx = [], si = [], sw = [], uv = [], spans = [];
  // w: 뼈 이름 하나, 또는 [뼈, 몫, 나머지를 갖는 뼈]
  const vertex = (x, y, z, w) => {
    pos.push(x, y, z); nor.push(0, 0, 0);
    if (typeof w === 'string') { si.push(BONE[w], 0, 0, 0); sw.push(1, 0, 0, 0); }
    else { si.push(BONE[w[0]], BONE[w[2]], 0, 0); sw.push(w[1], 1 - w[1], 0, 0); }
    return pos.length / 3 - 1;
  };
  const span = (key, start, count) => {
    const last = spans[spans.length - 1];
    if (last && last[0] === key && last[1] + last[2] === start) last[2] += count; else spans.push([key, start, count]);
  };
  // 세모들의 면 방향을 꼭짓점에 모아 부드러운 겉면을 만든다. from 부터의 정점과 at 부터의 세모만 본다
  const smoothFrom = (from, at) => {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = at; i < idx.length; i += 3) {
      a.fromArray(pos, idx[i] * 3); b.fromArray(pos, idx[i + 1] * 3).sub(a); c.fromArray(pos, idx[i + 2] * 3).sub(a);
      b.cross(c);
      for (let k = 0; k < 3; k++) { const v = idx[i + k] * 3; nor[v] += b.x; nor[v + 1] += b.y; nor[v + 2] += b.z; }
    }
    for (let v = from * 3; v < nor.length; v += 3) {
      const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]) || 1;
      nor[v] /= l; nor[v + 1] /= l; nor[v + 2] /= l;
    }
  };

  return {
    // 고리를 차례로 이은 통. 고리: { y, r, key, w, z? }. x 는 통의 가운데, depth 는 앞뒤 반지름의 비, cap 은 끝을 막을 고리('last').
    // 같은 높이에 색만 다른 고리를 겹쳐 두면 색의 경계가 번지지 않는다
    loft(rings, seg, { x = 0, depth = 1, cap = '', vOf = null } = {}) {
      const from = pos.length / 3, at = idx.length, n = withUv ? seg + 1 : seg, up = rings[1].y > rings[0].y;
      for (const ring of rings) {
        const start = pos.length / 3;
        for (let i = 0; i < n; i++) {
          const a = Math.PI * 2 * i / seg;
          vertex(x - ring.r * Math.sin(a), ring.y, (ring.z || 0) - ring.r * depth * Math.cos(a), ring.w);
          if (withUv) uv.push(i / seg, vOf(ring.y));
        }
        span(ring.key, start, n);
      }
      for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) {
        const a = from + k * n + i, b = from + k * n + (withUv ? i + 1 : (i + 1) % seg), c = a + n, d = b + n;
        if (up) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
      if (cap === 'last') {
        const ring = rings[rings.length - 1], base = from + (rings.length - 1) * n, mid = vertex(x, ring.y, ring.z || 0, ring.w);
        if (withUv) uv.push(0.5, vOf(ring.y));
        span(ring.key, mid, 1);
        for (let i = 0; i < seg; i++) { const a = base + i, b = base + (withUv ? i + 1 : (i + 1) % seg); if (up) idx.push(mid, a, b); else idx.push(mid, b, a); }
      }
      smoothFrom(from, at);
      // 이음매에 겹친 두 정점은 같은 방향을 봐야 금이 가 보이지 않는다
      if (withUv) for (let k = 0; k < rings.length; k++) {
        const a = (from + k * n) * 3, b = (from + k * n + seg) * 3;
        for (let c = 0; c < 3; c++) nor[a + c] = nor[b + c] = (nor[a + c] + nor[b + c]) / 2;
      }
    },

    // 한 뼈에 굳게 붙는 도형. 제자리에 옮겨 놓은 것을 받는다
    solid(geo, key, bone) {
      const from = pos.length / 3, p = geo.attributes.position, q = geo.attributes.normal;
      for (let i = 0; i < p.count; i++) { vertex(p.getX(i), p.getY(i), p.getZ(i), bone); nor.splice((from + i) * 3, 3, q.getX(i), q.getY(i), q.getZ(i)); }
      span(key, from, p.count);
      for (const k of geo.index.array) idx.push(from + k);
    },

    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      else g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
      g.setIndex(idx);
      g.userData.spans = spans;
      return g;
    },
  };
}

// 몸의 두 그물: flesh 는 정점에 색을 칠하는 팔다리·바지·목·손·축구화, shell 은 등번호 그림을 입는 상의 몸통.
// gk 면 긴소매에 큰 장갑을 낀다
export function buildBody(P, gk = false) {
  const m = measure(P), { H, T, Lt, Ls, fH, rTop, rBot, legR, armR, uA, fA, hand, fl, fw, neckR } = m;
  const flesh = gather(false), shell = gather(true);
  const hipsY = m.legLen, spineY = hipsY + m.spineY, topY = T * 0.98;

  // 상의: 밑단에서 가슴으로 넓어졌다가 어깨에서 목으로 모인다. 허리 아래 고리는 골반을 같이 따라가 몸을 틀 때 옷이 꼬이듯 이어진다.
  // 그림의 가운데(u = 0.5)가 등이고 이음매는 가슴 한가운데다
  const chest = (dy, r, hips) => ({ y: spineY + dy, r, key: 'jersey', w: hips ? ['hips', hips, 'spine'] : 'spine' });
  shell.loft([
    chest(-0.05, rBot * 1.12, 0.9), chest(0.03, rBot * 1.07, 0.6), chest(T * 0.2, rBot * 1.03, 0.3), chest(T * 0.36, rBot * 1.07, 0.1),
    chest(T * 0.52, rTop * 0.9), chest(T * 0.74, rTop), chest(T * 0.86, rTop * 0.9), chest(T * 0.94, rTop * 0.6), chest(topY, neckR * 1.25),
  ], 16, { depth: P.depth, vOf: y => Math.max(0, y - spineY) / topY });

  flesh.loft([
    { y: spineY + T * 0.92, r: neckR * 1.12, key: 'skin', w: 'spine' }, { y: spineY + topY + m.neckH, r: neckR, key: 'skin', w: 'spine' },
  ], 10);

  // 골반: 상의 밑단 속에서 시작해 가랑이에서 둥글게 닫힌다. 엉덩이 쪽이 조금 더 나온다
  const pelvis = (dy, r) => ({ y: hipsY + dy, r, key: 'shorts', w: 'hips', z: 0.012 });
  flesh.loft([pelvis(0.06 * H, rBot * 0.84), pelvis(0.02 * H, rBot * 0.92), pelvis(-0.035, rBot * 1.02), pelvis(-0.085, rBot * 0.98), pelvis(-0.12, rBot * 0.6)],
    14, { depth: P.depth * 1.04, cap: 'last' });

  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R', sh = 'sh' + side, el = 'el' + side, hp = 'hp' + side, kn = 'kn' + side, an = 'an' + side;

    // 팔: 둥근 어깨, 끝단을 두른 반소매, 손목으로 가늘어지는 팔, 납작한 손
    const X = s * m.shX, Y = spineY + m.shY, arm = gk ? 'jersey' : 'skin';
    const cuff = (dy, r, key) => ({ y: Y - uA * dy, r: armR * r, key, w: sh });
    flesh.solid(new THREE.SphereGeometry(armR * 1.5, 10, 8).translate(X, Y, 0), 'jersey', sh);
    // 끝단은 안으로 말려 들어가 팔과의 사이가 비어 보이지 않는다
    flesh.loft([cuff(0.02, 1.5, 'jersey'), cuff(0.3, 1.42, 'jersey'), cuff(0.5, 1.36, 'jersey'), cuff(0.5, 1.4, 'trim'), cuff(0.57, 1.4, 'trim'), cuff(0.56, 1.08, 'trim')], 10, { x: X });
    const E = Y - uA, limb = (y, r, w) => ({ y, r: armR * r, key: arm, w });
    flesh.loft([
      limb(Y - uA * 0.45, 1.08, sh), limb(Y - uA * 0.72, 1, sh), limb(E + uA * 0.12, 0.94, [sh, 0.85, el]), limb(E, 0.92, [sh, 0.5, el]),
      limb(E - fA * 0.12, 0.94, [sh, 0.15, el]), limb(E - fA * 0.32, 0.92, el), limb(E - fA * 0.7, 0.78, el), limb(E - fA, 0.66, el),
    ], 10, { x: X, cap: 'last' });
    const palm = gk ? [1, 1.8, 1.4] : [0.6, 1.35, 0.95];
    flesh.solid(new THREE.SphereGeometry(hand, 8, 6).scale(...palm).translate(X, E - fA - hand * (gk ? 1.1 : 0.8), 0), gk ? 'glove' : 'skin', el);

    // 바지통: 위는 골반에, 밑단은 허벅지에 붙어 다리를 들면 그 사이가 늘어난다. 밑단은 안으로 말려 허벅지에 닿는다
    const LX = s * m.gap, hem = (dy, r, w) => ({ y: hipsY + dy, r: legR * r, key: 'shorts', w });
    flesh.loft([
      hem(-0.025, 0.86, 'hips'), hem(-0.07, 1.3, ['hips', 0.6, hp]), hem(-0.12, 1.38, ['hips', 0.25, hp]), hem(-0.17, 1.44, hp),
      hem(-Lt * 0.6, 1.48, hp), hem(-Lt * 0.58, 1.14, hp),
    ], 10, { x: LX });

    // 다리: 허벅지에서 무릎, 줄을 두른 양말의 종아리, 발목. 종아리는 뒤로 조금 불룩하다
    const K = hipsY - Lt, A = K - Ls, part = (y, r, key, w, z = 0) => ({ y, r: legR * r, key, w, z });
    flesh.loft([
      part(hipsY - Lt * 0.4, 1.2, 'skin', hp), part(hipsY - Lt * 0.72, 1.06, 'skin', hp, -0.006), part(K + 0.045, 0.98, 'skin', [hp, 0.85, kn]),
      part(K, 0.96, 'skin', [hp, 0.5, kn]), part(K - 0.04, 0.94, 'skin', [hp, 0.15, kn]), part(K - 0.065, 0.95, 'skin', kn),
      part(K - 0.065, 1.01, 'trim', kn), part(K - 0.11, 1.04, 'trim', kn),
      part(K - 0.11, 1.03, 'sock', kn), part(K - 0.16, 1.07, 'sock', kn, 0.012), part(K - 0.25, 0.9, 'sock', kn, 0.006), part(A + 0.03, 0.72, 'sock', kn), part(A - 0.02, 0.7, 'sock', kn),
    ], 10, { x: LX });

    // 축구화: 밑창, 발등, 발목을 감싼 목
    const boot = k => new THREE.CapsuleGeometry(fw / 2, fl - fw, 3, 8).rotateX(Math.PI / 2).scale(...k);
    flesh.solid(boot([1.12, 0.28, 1.03]).translate(LX, fw * 0.14, -fl * 0.24), 'sole', an);
    flesh.solid(boot([1.06, 0.84, 1]).translate(LX, fw * 0.6, -fl * 0.24), 'boot', an);
    flesh.solid(new THREE.CylinderGeometry(legR * 0.76, legR * 0.84, fH * 0.9, 10).translate(LX, A - fH * 0.3, 0), 'boot', an);
  }
  return { flesh: flesh.geometry(), shell: shell.geometry() };
}
