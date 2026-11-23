// 화면 효과: 발밑 둥근 그림자, 입자(반짝임·먼지·충격), 아이템 동안의 공 꼬리와 속도선, 제쳤을 때 가장자리 번쩍임.
// 입자와 꼬리, 속도선은 모두 네모 조각이고 한 그물에 모아 한 번에 그린다.
import * as THREE from './three.js';
import { BODY_MID, BOOST_TICKS } from '../sim/constants.js';

const MAX_BLOBS = 64;
const PARTS = 96;                  // 한꺼번에 살아 있을 수 있는 입자
const TRAIL = 4, STREAKS = 14;     // 공 꼬리와 속도선에 쓰는 조각
const QUADS = PARTS * 2 + TRAIL + STREAKS;   // 별 모양 입자는 조각 둘을 쓴다
const TRAIL_LEN = 7;               // 꼬리가 가장 길 때(m)
const FLASH = 0.5;                 // 번쩍임이 사라지는 시간(초)
const THIN = 0.2;                  // 별의 팔 굵기(길이에 대한 비율)
const GAMMA = 2.2;

const rgb = hex => new THREE.Color(hex).toArray();
const GOLD = rgb('#FFC72C'), PALE = rgb('#FFF6D8');
// 입자 종류. life: 수명(초), size: 처음·끝 반지름(m), alpha: 불투명도(0 이면 빛처럼 더해 그린다.
// 밝은 잔디 위에서 금색이 바래지 않게 금빛 입자는 덮어 그린다), speed: 퍼지는 빠르기, flat: 위아래로 퍼지는 비율,
// up: 위로 뜨는 빠르기, grav: 중력, star: 십자로 반짝이는 모양
const KINDS = {
  spark: { life: 0.45, size: [0.2, 0.06], color: GOLD, alpha: 0.9, speed: 1.2, flat: 1, up: 2.8, grav: -4, star: true },
  burst: { life: 0.55, size: [0.42, 0.14], color: GOLD, alpha: 0.9, speed: 5, flat: 1, up: 1.5, grav: -6, star: true },
  pop:   { life: 0.18, size: [0.3, 1.3], color: rgb('#B89A50'), alpha: 0, speed: 0, flat: 0, up: 0, grav: 0 },
  puff:  { life: 0.4, size: [0.2, 0.6], color: rgb('#F4F4EC'), alpha: 0.5, speed: 2.2, flat: 0.7, up: 0.6, grav: 0 },
  dust:  { life: 0.35, size: [0.12, 0.4], color: rgb('#E4E8D0'), alpha: 0.45, speed: 1.8, flat: 0.1, up: 0.3, grav: 0 },
};

function texture(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
  stops.forEach(([at, css]) => gr.addColorStop(at, css));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function create(ctx) {
  const { scene, camera } = ctx;
  const blobs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: texture(64, [[0, 'rgba(0,0,0,0.5)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }),
    MAX_BLOBS);
  blobs.frustumCulled = false; blobs.count = 0;
  scene.add(blobs);

  // 다른 조각이 프레임마다 그림자 자리를 알려 온다: 땅 위 (x, z) 에 반지름 r
  const m = new THREE.Matrix4();
  ctx.blob = (x, z, r) => {
    if (!blobs.visible || blobs.count >= MAX_BLOBS) return;
    blobs.setMatrixAt(blobs.count++, m.makeScale(r, 1, r).setPosition(x, 0, z));
  };

  // 조각 그물. 색에 불투명도를 미리 곱해 넣고 (1, 1 - 불투명도) 로 섞어서, 더해 그리는 빛과 덮어 그리는 먼지를 한 재질로 그린다.
  // 섞기는 화면에 쓰는 값(sRGB)으로 일어나므로, 색 쪽 무늬는 sRGB 로 읽히게 해서 번짐이 불투명도와 같은 비율로 옅어지게 한다
  const pos = new Float32Array(QUADS * 12), col = new Float32Array(QUADS * 16), uv = new Float32Array(QUADS * 8), index = [];
  for (let i = 0; i < QUADS; i++) {
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), colAttr = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr); geo.setAttribute('color', colAttr); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  const dot = texture(64, [[0, '#fff'], [0.25, '#bbb'], [0.6, '#333'], [1, '#000']]), dotColor = dot.clone();
  dotColor.colorSpace = THREE.SRGBColorSpace; dotColor.needsUpdate = true;
  const quads = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: dotColor, alphaMap: dot, vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  quads.frustumCulled = false; quads.renderOrder = 5; quads.visible = false;
  scene.add(quads);

  // 조각 하나: 가운데 (x, y, z) 에서 반쪽 벡터 a 와 b 로 편 네모. gain 은 밝기(0..1), alpha 는 뒤를 가리는 정도
  let n = 0;
  function quad(x, y, z, ax, ay, az, bx, by, bz, c, gain, alpha) {
    let o = n * 12;
    pos[o++] = x - ax - bx; pos[o++] = y - ay - by; pos[o++] = z - az - bz;
    pos[o++] = x + ax - bx; pos[o++] = y + ay - by; pos[o++] = z + az - bz;
    pos[o++] = x + ax + bx; pos[o++] = y + ay + by; pos[o++] = z + az + bz;
    pos[o++] = x - ax + bx; pos[o++] = y - ay + by; pos[o++] = z - az + bz;
    o = n++ * 16;
    const k = Math.pow(gain, GAMMA);
    for (let i = 0; i < 4; i++) { col[o++] = c[0] * k; col[o++] = c[1] * k; col[o++] = c[2] * k; col[o++] = alpha; }
  }
  // 카메라를 마주 보는 조각. w, h 는 가로·세로 반지름
  function sprite(x, y, z, w, h, c, gain, alpha) {
    const e = camera.matrixWorld.elements;
    quad(x, y, z, e[0] * w, e[1] * w, e[2] * w, e[4] * h, e[5] * h, e[6] * h, c, gain, alpha);
  }
  // 앞뒤(z)로 길게 누운 띠. 폭은 카메라 쪽으로 세운다
  function streak(x, y, z, len, width, c, gain, alpha) {
    const cx = camera.position.x - x, cy = camera.position.y - y, k = width / (Math.hypot(cx, cy) || 1);
    quad(x, y, z, -cy * k, cx * k, 0, 0, 0, len / 2, c, gain, alpha);
  }

  // 입자는 태어난 때와 처음 빠르기만 적어 두고, 그릴 때 시각에서 자리를 셈한다
  const parts = Array.from({ length: PARTS }, () => ({ kind: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, t0: 0, d0: 0, scroll: false }));
  let next = 0, seed = 1;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  // scroll: 땅과 함께 뒤로 흘러가는지. 아니면 선수 곁에 머문다
  function emit(kind, count, x, y, z, run, scroll) {
    for (let i = 0; i < count; i++) {
      const p = parts[next], a = rnd() * Math.PI * 2, v = kind.speed * (0.5 + 0.5 * rnd());
      next = (next + 1) % PARTS;
      // 처음 크기만큼 벌려 놓아 한 점에 겹쳐 뭉치지 않게 한다
      p.kind = kind; p.x = x + Math.cos(a) * kind.size[0]; p.y = y + Math.sin(a) * kind.size[0] * kind.flat; p.z = z;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v * kind.flat + kind.up;
      p.t0 = ctx.now; p.d0 = run.dist; p.scroll = scroll;
    }
  }

  // 속도선마다 정해 둔 자리(선수 옆·위)와 엇박
  const lines = Array.from({ length: STREAKS }, (_, i) => ({ x: (i % 2 ? 1 : -1) * (0.6 + 1.9 * rnd()), y: 0.2 + 2 * rnd(), rate: 1.7 + 0.9 * rnd(), phase: rnd() }));

  // 화면 가장자리 번쩍임: 화면을 덮는 네모 한 장을 화면 좌표에 바로 그린다
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { k: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 p; void main() { p = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform float k; varying vec2 p; void main() { vec2 d = p * p; float e = 1.0 - (1.0 - d.x * d.x * d.x) * (1.0 - d.y * d.y * d.y * d.y); gl_FragColor = vec4(1.0, 0.78, 0.17, e * k); }',
  }));
  flash.frustumCulled = false; flash.renderOrder = 10; flash.visible = false;
  scene.add(flash);
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let beatAt = -1e9;

  return {
    reset() {
      for (const p of parts) p.kind = null;
      next = 0; seed = 1; beatAt = -1e9;
    },

    // 다른 조각보다 먼저 불려서 지난 프레임의 그림자를 비운다
    update(run, alpha) {
      blobs.visible = ctx.quality === 'low';
      blobs.count = 0;
      blobs.instanceMatrix.needsUpdate = true;

      const t = ctx.now, dist = run.pdist + (run.dist - run.pdist) * alpha;
      n = 0;
      for (const p of parts) {
        const k = p.kind;
        if (!k) continue;
        const age = t - p.t0, u = age / k.life;
        if (u < 0 || u >= 1) { if (u >= 1) p.kind = null; continue; }
        const s = k.size[0] + (k.size[1] - k.size[0]) * u, f = 1 - u * u, gain = f * (k.alpha || 1), a = f * k.alpha;
        const x = p.x + p.vx * age, y = Math.max(0.03, p.y + p.vy * age + 0.5 * k.grav * age * age), z = p.z + (p.scroll ? dist - p.d0 : 0);
        if (k.star) { sprite(x, y, z, s, s * THIN, k.color, gain, a); sprite(x, y, z, s * THIN, s, k.color, gain, a); }
        else sprite(x, y, z, s, s, k.color, gain, a);
      }

      // 아이템 동안: 처음과 끝에서 서서히 켜지고 꺼진다
      const boost = Math.min(1, (BOOST_TICKS - run.boost) / 12, run.boost / 20);
      if (run.boost > 0 && boost > 0) {
        const x = run.px + (run.x - run.px) * alpha;
        for (const l of lines) {
          const u = (t * l.rate + l.phase) % 1;
          streak(x + l.x, l.y, -10 + 14 * u, 3.2, 0.045, PALE, boost * Math.sin(Math.PI * u), 0);
        }
        // 차 낸 공 뒤로 끌리는 꼬리: 길이가 다른 띠를 겹쳐 공 쪽이 가장 밝다. 공이 발밑에 있으면 길이가 0 이다.
        // 공의 자리는 지난 프레임 것이다(공을 움직이는 조각이 이 조각 뒤에 돈다)
        const ball = ctx.ball;
        if (ball && ball.visible) {
          const b = ball.position, len = Math.min(TRAIL_LEN, -b.z - 1);
          for (let i = 1; len > 0 && i <= TRAIL; i++) streak(b.x, b.y, b.z + len / i * 0.35, len / i, 0.14, GOLD, boost * 0.8, boost * 0.8);
        }
      }

      quads.visible = n > 0;
      if (n) { geo.setDrawRange(0, n * 6); posAttr.needsUpdate = colAttr.needsUpdate = true; }

      const k = 1 - (t - beatAt) / FLASH;
      flash.visible = k > 0 && k <= 1;
      flash.material.uniforms.k.value = 0.85 * k * k;
    },

    onEvent(ev, run) {
      const x = run.x, y = run.y + BODY_MID;
      if (ev.type === 'coin') emit(KINDS.spark, 3, x, y + 0.2, -0.25, run, false);
      else if (ev.type === 'item') { emit(KINDS.burst, 20, x, y + 0.2, -0.3, run, false); emit(KINDS.pop, 1, x, y + 0.2, -0.3, run, false); }
      else if (ev.type === 'land') emit(KINDS.dust, 5, x, 0.1, 0.1, run, true);
      else if (ev.type === 'knock') {
        for (const o of run.objs) if (o.id === ev.id) emit(KINDS.puff, 5, o.x, 0.9, run.dist - o.d, run, true);
      } else if (ev.type === 'beat' && !calm.matches) beatAt = ctx.now;   // 움직임 줄이기에서는 번쩍이지 않는다
    },
  };
}
