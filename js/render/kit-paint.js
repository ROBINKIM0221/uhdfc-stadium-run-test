// 유니폼 그림. 사람 모델의 옷 그림(한 장에 살·옷·신발이 다 든 그림) 위에, 옷 부위마다 유니폼 디자인을 칠한 새 그림을 만든다.
// 옷의 세모를 그림 자리(uv)에 펼쳐 그리면서, 그 점이 몸의 어디(쉬는 자세의 cm 좌표)인지로 바탕·옆판·어깨 줄·옷깃·
// 소매 끝·스폰서·엠블럼을 정한다. 모델 그림의 밝고 어두움(주름)은 그대로 곱한다.
// 반소매: 소매 밖의 팔은 투명도 0 으로 남겨, 재질이 그 자리를 선수의 살색으로 칠한다.
import * as THREE from './three.js';
import { lift } from './rig.js';

const SIZE = 1024;
const EMBLEM = new URL('../../img/emblem.png', import.meta.url).href;

// 스폰서 글씨 그림: 앞을 향한 화살(HD 표시) 뒤에 글자. badge 면 위에 큰 HD, 밑에 회사 이름. 글자만 그리고 바탕은 비운다
function sponsorCanvas(kit) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left';
  const line = (text, size, y, max) => {
    g.font = `900 ${size}px 'Gothic A1', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;
    const mark = size * 0.78, gap = size * 0.16, width = Math.min(max, mark + gap + g.measureText(text).width), x = (512 - width) / 2, h = size * 0.72;
    g.beginPath(); g.moveTo(x, y - h / 2); g.lineTo(x + mark, y); g.lineTo(x, y + h / 2); g.lineTo(x + mark * 0.32, y); g.closePath(); g.fill();
    g.fillText(text, x + mark + gap, y + size * 0.04, width - mark - gap);
  };
  if (kit.badge) line('HD', 120, 86, 340);
  if (kit.sponsor) line(kit.sponsor, kit.badge ? 60 : 76, kit.badge ? 198 : 128, 500);
  return c;
}

const image = src => new Promise(done => { const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = src; });
// 칠하는 색은 화면에 보이는 값(sRGB) 그대로 다루고, 다 칠한 뒤 한 번에 빛의 세기(linear)로 바꿔 적는다
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };

// shift: 그림 조각을 조금씩 밀어 여러 번 칠해 조각 둘레를 넓힌다. 줄인 그림(먼 선수)에서 조각 밖의 본래 색이 섞여 들지 않게 한다
const VERT = `
attribute float _part;
uniform vec2 shift;
varying vec3 vPos; varying vec3 vNor; varying vec2 vUv; varying float vPart;
void main() { vPos = position; vNor = normal; vUv = uv; vPart = _part; gl_Position = vec4(uv * 2.0 - 1.0 + shift, 0.0, 1.0); }`;
const SPREAD = 4 / 512;   // 4 픽셀

// 좌표는 모델의 쉬는 자세(cm): 앞이 +z, 선수의 왼쪽이 +x, 발밑이 y = 0
const FRAG = `
uniform sampler2D base, sponsor, emblem;
uniform vec3 jersey, panel, shoulder, stripe, collar, cuff, shorts, shortTrim, sock, sockBand, sponsorColor, crest, piping;
uniform float longSleeve, pattern, hasEmblem, hasPiping;
varying vec3 vPos; varying vec3 vNor; varying vec2 vUv; varying float vPart;
float band(float v, float a, float b) { return step(a, v) * step(v, b); }
float lum(vec2 uv) { return dot(pow(textureLod(base, uv, 0.0).rgb, vec3(1.0 / 2.2)), vec3(0.3, 0.59, 0.11)); }
// 옷감의 밝기: 둘레 10 픽셀 안에서 가장 밝은 값. 넓은 주름은 남고, 본래 옷에 찍힌 가는 글자·줄·표시는 지워진다
float cloth(vec2 uv) {
  float m = lum(uv);
  for (int i = 0; i < 8; i++) {
    vec2 d = vec2(cos(float(i) * 0.7854), sin(float(i) * 0.7854)) / 1024.0;
    m = max(m, max(lum(uv + d * 5.0), lum(uv + d * 10.0)));
  }
  return m;
}
void main() {
  int part = int(vPart + 0.5);
  if (part < 1 || part > 3) { gl_FragColor = vec4(textureLod(base, vUv, 0.0).rgb, 1.0); return; }   // 살·신발·머리카락은 본래 그림
  float shade = clamp(cloth(vUv) / 0.8, 0.6, 1.12);
  vec3 p = vPos;
  float ax = abs(p.x), alpha = 1.0;
  vec3 c;
  if (part == 1) {
    c = jersey;
    if (ax < 22.0) {
      // 몸통: 무늬, 옆판, 어깨 위 세 줄, 옷깃, 스폰서, 엠블럼
      if (pattern > 0.5 && pattern < 1.5 && p.z > 0.0) c *= 1.0 - 0.07 * step(0.5, fract((p.x * 0.7 + p.y * 0.35) / 2.2));   // 눌러 찍은 사선 줄
      if (pattern > 1.5 && pattern < 2.5 && p.z > 0.0) c = mix(c, c * 0.72, smoothstep(98.0, 150.0, p.y) * 0.6);      // 위로 갈수록 어두워지는 물결
      if (pattern > 2.5) c = mix(c, stripe, step(0.5, fract(p.x / 7.0 + 0.25)));                                          // 세로 줄무늬
      c = mix(c, panel, step(16.0, ax) * step(abs(p.z), 5.5) * band(p.y, 90.0, 140.0));
      float top = band(p.y, 139.0, 155.0) * step(8.0, ax) * step(0.15, vNor.y);
      float lane = abs(p.z + 1.5);
      c = mix(c, shoulder, top * (band(lane, 0.0, 0.55) + band(lane, 1.6, 2.7) + band(lane, 3.8, 4.9)));
      c = mix(c, collar, band(p.y, 151.6, 156.0) * step(ax, 9.5));
      float vee = 151.6 - (7.0 - ax) * 0.9;
      c = mix(c, collar, step(4.0, p.z) * step(ax, 7.0) * band(p.y, vee - 0.9, vee));
      float rag = 151.0 - (ax - 9.0) * 1.25;
      c = mix(c, piping, hasPiping * band(ax, 9.0, 20.5) * band(p.y, rag - 0.7, rag));
      if (p.z > 6.0) {
        vec2 su = vec2((p.x + 11.0) / 22.0, (134.0 - p.y) / 18.0);
        if (su.x > 0.0 && su.x < 1.0 && su.y > 0.0 && su.y < 1.0) c = mix(c, sponsorColor, textureLod(sponsor, vec2(su.x, 1.0 - su.y), 1.0).a);
        vec2 eu = vec2((p.x - 5.0) / 6.5, (142.5 - p.y) / 8.0);
        if (hasEmblem > 0.5 && eu.x > 0.0 && eu.x < 1.0 && eu.y > 0.0 && eu.y < 1.0) { vec4 e = textureLod(emblem, vec2(eu.x, 1.0 - eu.y), 1.0); c = mix(c, crest, e.a * smoothstep(0.3, 0.65, dot(pow(e.rgb, vec3(1.0 / 2.2)), vec3(0.3, 0.59, 0.11)))); }
      }
    } else {
      // 소매: 위쪽에 세 줄, 끝에 띠. 반소매는 그 너머가 살이다
      float lane = abs(p.z + 3.7), up = step(141.0, p.y) * step(ax, 42.0);
      c = mix(c, shoulder, up * (band(lane, 0.0, 0.5) + band(lane, 1.5, 2.5) + band(lane, 3.5, 4.5)));
      float end = longSleeve > 0.5 ? 68.0 : 39.0;
      c = mix(c, cuff, band(ax, end - 2.5, end));
      if (ax > end) { alpha = 0.0; c = vec3(0.92); shade = 1.0; }
    }
  } else if (part == 2) {
    c = mix(shorts, shortTrim, min(1.0, step(15.5, ax) * step(abs(p.z - 1.0), 3.0) * band(p.y, 62.0, 97.0) + band(p.y, 56.0, 59.5)));
  } else {
    c = mix(sock, sockBand, band(p.y, 31.0, 34.5));
  }
  gl_FragColor = vec4(pow(c * shade, vec3(2.2)), alpha);
}`;

let renderer = null, emblem = null;
const maps = new Map();
export function usePainter(r) { renderer = r; }

// 유니폼 kit 을 입은 옷 그림. source() 는 옷 그림과 옷 그물을 가진 사람 모델 몸을 약속으로 준다.
// 같은 유니폼은 한 번만 그린다. 그릴 수 없으면 null 로 끝난다
export function kitMap(kit, source) {
  if (!renderer) return Promise.resolve(null);
  if (maps.has(kit.id)) return maps.get(kit.id);
  const job = (async () => {
    const mesh = await source();
    // 스폰서 글자는 등 마킹과 같은 글꼴로 쓴다. 한 번 그린 그림을 계속 쓰므로 글꼴이 오기를 잠깐 기다린다
    await Promise.race([document.fonts.load("900 60px 'Gothic A1'", '가').catch(() => {}), new Promise(done => setTimeout(done, 1500))]);
    emblem ||= image(EMBLEM).then(i => i && Object.assign(new THREE.Texture(i), { needsUpdate: true, colorSpace: THREE.SRGBColorSpace }));
    const emblemTex = await emblem;
    const sponsor = new THREE.CanvasTexture(sponsorCanvas(kit));
    const u = {
      base: { value: mesh.material.map }, sponsor: { value: sponsor }, emblem: { value: emblemTex || sponsor }, hasEmblem: { value: emblemTex && kit.emblem !== false ? 1 : 0 },
      jersey: { value: rgb(lift(kit.jersey)) }, panel: { value: rgb(lift(kit.panel || kit.jersey)) }, shoulder: { value: rgb(kit.shoulder || kit.trim) }, stripe: { value: rgb(lift(kit.stripe || kit.jersey)) },
      collar: { value: rgb(kit.collar || kit.trim) }, cuff: { value: rgb(kit.cuff || kit.trim) }, crest: { value: rgb(kit.crest || kit.sponsorColor || kit.trim) },
      piping: { value: rgb(kit.piping || kit.trim) }, hasPiping: { value: kit.piping ? 1 : 0 },
      shorts: { value: rgb(lift(kit.shorts)) }, shortTrim: { value: rgb(kit.shortTrim || kit.trim) },
      sock: { value: rgb(lift(kit.sock)) }, sockBand: { value: rgb(kit.sockBand || kit.trim) }, sponsorColor: { value: rgb(kit.sponsorColor || kit.trim) },
      longSleeve: { value: kit.gk ? 1 : 0 }, pattern: { value: { deboss: 1, wave: 2, vertical: 3 }[kit.pattern || (kit.stripe ? 'vertical' : '')] || 0 },
    };
    // 그린 판을 그대로 옷 그림으로 쓴다. 판의 아래에서 위가 그림 자리 v 의 0 에서 1 이라 모델 그림(뒤집지 않은 것)과 같은 방향이다
    const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    target.texture.anisotropy = 4;
    const scene = new THREE.Scene(), cam = new THREE.Camera();
    // 바탕: 모델 그림을 그대로 옮긴다(살·신발·옷 밖 자리)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { base: u.base }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 v; void main() { v = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D base; varying vec2 v; void main() { gl_FragColor = vec4(texture2D(base, v).rgb, 1.0); }',
    }));
    back.frustumCulled = false;
    scene.add(back);
    // 여덟 방향으로 민 것을 먼저, 제자리의 것을 마지막에 칠한다
    const flats = [...Array(9).keys()].map(i => {
      const shift = i < 8 ? new THREE.Vector2(Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)).multiplyScalar(SPREAD) : new THREE.Vector2();
      const m = new THREE.Mesh(mesh.geometry, new THREE.ShaderMaterial({ uniforms: { ...u, shift: { value: shift } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
      m.frustumCulled = false; m.renderOrder = i < 8 ? 1 : 2;
      scene.add(m);
      return m;
    });
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(target); renderer.render(scene, cam); renderer.setRenderTarget(before);
    sponsor.dispose(); back.material.dispose(); back.geometry.dispose();
    for (const m of flats) m.material.dispose();
    return target.texture;
  })().catch(() => null);
  maps.set(kit.id, job);
  return job;
}
