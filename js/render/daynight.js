// 시간대별 하늘·안개·빛. 달린 거리에 따라 낮에서 노을, 밤으로 서서히 섞는다.
import * as THREE from './three.js';

// sky: 위·중간·지평선 색, cloud: 구름의 볕 든 쪽·그늘 쪽 색과 짙기, glow: 해 쪽 하늘에 더해지는 빛,
// fog: 안개 시작·끝(m), hemi: 하늘빛·땅빛·세기, lights: [색, 세기, 자리], roof: 지붕 뼈대에 곱하는 색, lamps: 조명 밝기, exposure: 노출
export const TIMES = {
  day:   { sky: ['#1f6fd6', '#5fa8ee', '#a9cbee'], cloud: ['#ffffff', '#9fb2cc', 0.95], glow: '#5c5848', fog: [40, 205], hemi: ['#e2f1ff', '#4f8a45', 1.7], lights: [['#fff2d8', 3.1, [-25.6, 48, -33.6]]], roof: '#e8edf4', lamps: 0, exposure: 1.0 },
  dusk:  { sky: ['#27357a', '#d8718c', '#ffc890'], cloud: ['#ffb07a', '#5d4a7c', 1], glow: '#e8863a', fog: [38, 205], hemi: ['#e4d6ea', '#4f8a45', 1.75], lights: [['#ffc083', 4.6, [-42, 28, -40]]], roof: '#f0cdb8', lamps: 0.55, exposure: 1.0 },
  night: { sky: ['#030712', '#081233', '#16285c'], cloud: ['#1c2a58', '#070c20', 0.7], glow: '#000000', fog: [44, 220], hemi: ['#8fa8ff', '#2e6a3a', 0.85], lights: [['#f2f6ff', 2.3, [-28, 34, -40]], ['#f2f6ff', 1.9, [30, 34, 18]]], roof: '#93a3cc', lamps: 1, exposure: 1.05 },
};
const ORDER = [TIMES.day, TIMES.dusk, TIMES.night];
const FILL = TIMES.night.lights[1];   // 밤에만 켜지는 둘째 빛. 뒤쪽에서 비춰 등 쪽이 어둡게 묻히지 않는다

const DUSK_FROM = 500, DUSK_AT = 1200, NIGHT_AT = 1900;   // 달린 거리(m)
const STEPS = 200;                                        // 한 시간대를 넘어가는 동안 값을 다시 섞는 횟수
const SHADOW_SIZE = { mid: 1024, high: 2048 };            // 여기 없는 품질 단계는 그림자 지도를 쓰지 않는다
const GLOW_AT = new THREE.Vector3(-0.2, 0.2, -0.96).normalize();   // 빛이 번지는 쪽: 앞에서 조금 왼쪽, 골대 뒤 지붕 바로 위

// 0 낮, 1 노을, 2 밤
export const timeAt = dist => (dist <= DUSK_FROM ? 0
  : dist <= DUSK_AT ? (dist - DUSK_FROM) / (DUSK_AT - DUSK_FROM)
  : dist <= NIGHT_AT ? 1 + (dist - DUSK_AT) / (NIGHT_AT - DUSK_AT) : 2);

const num = (a, b, t) => a + (b - a) * t;
const color = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

// k 자리의 값: 이웃한 두 시간대를 섞는다. 색은 THREE.Color, sun 은 그림자를 드리우는 첫째 빛
export function mixTime(k) {
  k = Math.min(2, Math.max(0, k));
  const i = k < 1 ? 0 : 1, t = k - i, a = ORDER[i], b = ORDER[i + 1];
  const [ca, pa, xa] = a.lights[0], [cb, pb, xb] = b.lights[0];
  return {
    sky: a.sky.map((c, n) => color(c, b.sky[n], t)),
    cloud: [color(a.cloud[0], b.cloud[0], t), color(a.cloud[1], b.cloud[1], t), num(a.cloud[2], b.cloud[2], t)],
    glow: color(a.glow, b.glow, t),
    fog: a.fog.map((v, n) => num(v, b.fog[n], t)),
    hemi: [color(a.hemi[0], b.hemi[0], t), color(a.hemi[1], b.hemi[1], t), num(a.hemi[2], b.hemi[2], t)],
    sun: { color: color(ca, cb, t), power: num(pa, pb, t), pos: xa.map((v, n) => num(v, xb[n], t)) },
    roof: color(a.roof, b.roof, t), lamps: num(a.lamps, b.lamps, t), exposure: num(a.exposure, b.exposure, t),
  };
}

// 그림자 지도를 달리는 길(가로 12m, 앞 62m)에 딱 맞춘다
const inv = new THREE.Matrix4(), v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function fitShadow(light) {
  inv.lookAt(light.position, light.target.position, UP).invert();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const x of [-6, 6]) for (const y of [0, 2.3]) for (const z of [-62, 7]) {
    v.set(x, y, z).sub(light.position).applyMatrix4(inv);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, -v.z); z1 = Math.max(z1, -v.z);
  }
  Object.assign(light.shadow.camera, { left: x0 - 1, right: x1 + 1, bottom: y0 - 1, top: y1 + 1, near: Math.max(0.5, z0 - 3), far: z1 + 3 });
  light.shadow.camera.updateProjectionMatrix();
}

// 구름 그림: 빨강에 짙기, 초록에 볕 든 정도. 가로로 이어 붙여도 이음매가 없다
function cloudTexture() {
  const W = 512, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  // 씨앗이 정해진 격자 난수를 부드럽게 잇는다. 가로 nx 칸마다 되풀이된다
  const hash = (i, j, s) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 2246822519) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const smooth = t => t * t * (3 - 2 * t);
  const lattice = (x, y, nx, s) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = smooth(x - x0), ty = smooth(y - y0), at = (i, j) => hash(((i % nx) + nx) % nx, j, s);
    const a = at(x0, y0), b = at(x0 + 1, y0), e = at(x0, y0 + 1), f = at(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (e - a) * ty + (a - b - e + f) * tx * ty;
  };
  // 지평선 쪽일수록 납작하게 눌린 덩어리
  const puff = (x, y) => {
    let v = 0, w = 0.5;
    for (let o = 0, n = 8; o < 5; o++, n *= 2, w /= 2) v += w * lattice(x / W * n, y / H * n * 0.5, n, o);
    return v;
  };
  const dens = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const up = 1 - y / H, band = Math.min(1, up / 0.12) * Math.min(1, (1 - up) / 0.3);   // 지평선과 그림 위 끝에서는 사라진다
    dens[y * W + x] = puff(x, y) * band;
  }
  const at = (x, y) => dens[Math.max(0, Math.min(H - 1, y)) * W + ((x % W) + W) % W];
  for (let y = 0, o = 0; y < H; y++) for (let x = 0; x < W; x++, o += 4) {
    const v = at(x, y), k = Math.min(1, Math.max(0, (v - 0.46) / 0.16));
    d[o] = 255 * smooth(k);
    d[o + 1] = 255 * Math.min(1, Math.max(0, 0.62 + (v - at(x - 5, y - 4)) * 7));   // 해 쪽(왼쪽 위)이 더 옅으면 볕을 받는다
    d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// 하늘은 카메라를 감싼 공에 그린다: 색 띠와 구름, 빛 번짐이 보는 방향에 붙어 있어 시야각이나 화면 비율이 바뀌어도 어긋나지 않는다.
// 다른 재질과 같은 톤 보정을 거쳐야 지평선 색이 안개 색과 같아진다
function skyDome() {
  const uniforms = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() }, lit: { value: new THREE.Color() }, shade: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, glowAt: { value: GLOW_AT }, cloudy: { value: 0 }, clouds: { value: cloudTexture() } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(250, 32, 16), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false, dithering: true,
    vertexShader: 'varying vec3 dir; varying float turn; void main() { dir = position; turn = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, low, lit, shade, glow, glowAt; uniform float cloudy; uniform sampler2D clouds;
      varying vec3 dir; varying float turn;
      #include <common>
      #include <dithering_pars_fragment>
      void main() {
        vec3 d = normalize(dir);
        float e = max(d.y, 0.0);
        vec3 c = mix(mix(low, mid, smoothstep(0.0, 0.17, e)), top, smoothstep(0.1, 0.46, e));
        c += glow * pow(max(dot(d, glowAt), 0.0), 8.0);
        vec4 k = texture2D(clouds, vec2(turn * 4.0 + 0.36, e * 2.6));
        c = mix(c, mix(shade, lit, k.g), k.r * cloudy);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <dithering_fragment>
      }`,
  }));
  dome.frustumCulled = false;
  dome.renderOrder = 1;   // 다른 것을 다 그린 뒤 남은 자리에만 그린다
  dome.onBeforeRender = (renderer, scene, camera) => dome.matrixWorld.copyPosition(camera.matrixWorld);
  return dome;
}

export function create(ctx) {
  const { scene, renderer } = ctx;
  const dome = skyDome(), sky = dome.material.uniforms;
  scene.add(dome);
  scene.fog = new THREE.Fog(0, 1, 2);
  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  // 둘째 빛은 낮에도 세기 0 으로 장면에 둔다: 빛의 수가 바뀌면 재질을 모두 다시 엮느라 끊긴다
  const light = () => {
    const l = new THREE.DirectionalLight();
    l.target.position.set(0, 0, -8);
    l.shadow.bias = -0.0005; l.shadow.normalBias = 0.03;
    scene.add(l, l.target);
    return l;
  };
  const sun = light(), fill = light();
  fill.color.set(FILL[0]); fill.position.set(...FILL[2]);
  fitShadow(fill);

  function show(k) {
    const tm = ctx.time = mixTime(k);
    sky.top.value.copy(tm.sky[0]); sky.mid.value.copy(tm.sky[1]); sky.low.value.copy(tm.sky[2]);
    sky.lit.value.copy(tm.cloud[0]); sky.shade.value.copy(tm.cloud[1]); sky.cloudy.value = tm.cloud[2];
    sky.glow.value.copy(tm.glow);
    scene.fog.color.copy(tm.sky[2]); scene.fog.near = tm.fog[0]; scene.fog.far = tm.fog[1];
    hemi.color.copy(tm.hemi[0]); hemi.groundColor.copy(tm.hemi[1]); hemi.intensity = tm.hemi[2];
    sun.color.copy(tm.sun.color); sun.intensity = tm.sun.power; sun.position.set(...tm.sun.pos);
    fitShadow(sun);
    fill.intensity = FILL[1] * Math.max(0, k - 1);
    renderer.toneMappingExposure = tm.exposure;
  }
  show(0);

  let quality = null, shown = 0;
  return {
    reset() {},
    update(run) {
      // 눈에 띄지 않는 폭으로 끊어 두고, 값이 바뀔 때만 다시 섞는다
      const k = Math.round(timeAt(run.dist) * STEPS) / STEPS;
      if (k !== shown) show(shown = k);
      const size = SHADOW_SIZE[ctx.quality];
      sun.castShadow = !!size;
      fill.castShadow = ctx.quality === 'high' && k > 1;   // 그림자 지는 둘째 빛은 가장 높은 단계의 밤에만
      if (quality === ctx.quality) return;
      quality = ctx.quality;
      if (size) for (const l of [sun, fill]) {
        l.shadow.mapSize.set(size, size);
        if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }   // 크기가 바뀌면 지도를 새로 만들게 한다
      }
    },
    onEvent() {},
  };
}
