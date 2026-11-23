// 관절이 이어진 캐릭터. 앞은 -Z, 왼쪽(L)은 -X.
// 몸은 뼈대를 따라 휘는 그물 둘(정점에 색을 칠한 팔다리, 등번호 그림을 입은 상의)이고, 머리는 목 위에 굳게 얹힌다.
import * as THREE from './three.js';
import { drawnHead, longHead } from './heads.js';
import { BONES, measure, buildBody } from './body.js';

// 몸 비율(5등신). 길이는 전부 키 H 에 대한 비율이고 head+neck+torso+thigh+shin+footH = 1
const PROPORTIONS = {
  H: 1.75, head: 0.215, neck: 0.015, torso: 0.31, thigh: 0.20, shin: 0.20, footH: 0.06,
  shoulderW: 0.295, waistW: 0.24, depth: 0.66, legR: 0.056, armR: 0.04, upArm: 0.165, foreArm: 0.145,
  hand: 0.036, footL: 0.185, footW: 0.092, legGap: 0.072, eye: 0.014,
};

const PAINTED = new THREE.MeshLambertMaterial({ vertexColors: true });
const NAME_FONT = "700 42px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
const NO_FACE = "'Barlow Condensed'", NO_FONT = `700 %dpx ${NO_FACE}, 'Arial Narrow', sans-serif`;

// 어두운 옷 색은 빛과 톤 매핑을 거치며 화면에서 남색으로 가라앉는다. 밝기가 DARK 아래인 색만, 모자란 만큼의 LIFT 를 올린다
const DARK = 0.5, LIFT = 0.35;
export function lift(hex) {
  const c = new THREE.Color(hex), { h, s, l } = c.getHSL({}, THREE.SRGBColorSpace);
  return l >= DARK ? hex : `#${c.setHSL(h, s, l + (DARK - l) * LIFT, THREE.SRGBColorSpace).getHexString()}`;
}

// 몸에 칠하는 색. 옷감(상의, 줄무늬, 하의, 양말)만 화면에 맞게 밝히고 등번호와 줄 색은 그대로 둔다
export function tint({ kit, skin = '#efc7a2', hair = '#16171b' }) {
  const c = { ...kit, skin, hair, eye: '#17181c', glove: '#F4F4F2', sole: '#1D2230' };
  for (const key of ['jersey', 'stripe', 'shorts', 'sock']) if (c[key]) c[key] = lift(c[key]);
  return c;
}

// 상의 옆면에 감기는 그림. 가운데(x=256)가 등, 양 끝(x=0, 512)이 가슴
function drawJersey(g, c, no, name) {
  g.fillStyle = c.jersey; g.fillRect(0, 0, 512, 256);
  // 세로 줄무늬: 등과 가슴 한가운데에 줄 하나씩이 오게 놓는다
  if (c.stripe) { g.fillStyle = c.stripe; for (let x = -16; x < 512; x += 64) g.fillRect(x, 0, 32, 256); }
  g.fillStyle = c.trim;
  g.fillRect(0, 0, 512, 12); g.fillRect(0, 246, 512, 10);
  for (const x of [128, 384]) g.fillRect(x - 5, 12, 10, 234);
  g.fillStyle = c.number; g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = (s, font, x, y, squeeze) => { g.save(); g.translate(x, y); g.scale(squeeze, 1); g.font = font; g.fillText(s, 0, 0); g.restore(); };
  if (name) text(name, NAME_FONT, 256, 58, 0.8);
  if (no === '') return;
  text(no, NO_FONT.replace('%d', 150), 256, name ? 166 : 136, 0.95);
  for (const x of [0, 512]) text(no, NO_FONT.replace('%d', 76), x, 118, 0.95);
}

// 등번호 글꼴이 아직 안 왔으면 받아 오고, 그 전에 그린 옷은 온 뒤에 한 번 다시 그린다
const late = new Set();
let asked = false;
function whenNumbers(redraw) {
  const font = `700 64px ${NO_FACE}`;
  if (document.fonts.check(font)) return;
  late.add(redraw);
  if (asked) return;
  asked = true;
  document.fonts.load(font).then(() => { for (const f of late) f(); late.clear(); }, () => {});
}

// 부품([도형, 색 이름])을 한 그물로 합친다. 유니폼을 갈아입힐 때 다시 칠할 정점 구간을 적어 둔다.
// 색 이름이 없는 부품은 이미 합쳐진 그물이라 그 구간을 그대로 옮겨 적는다.
function merge(parts) {
  let nv = 0, ni = 0;
  for (const [g] of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint16Array(ni), spans = [];
  let v = 0, i = 0;
  for (const [g, key] of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3);
    if (key) spans.push([key, v, n]);
    else for (const [k, start, count] of g.userData.spans) spans.push([k, v + start, count]);
    for (const k of g.index.array) idx[i++] = k + v;
    v += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.userData.spans = spans;
  return out;
}

// 그물의 구간마다 그 이름의 색을 칠한다. colors 는 tint 가 준 것
export function paint(geo, colors) {
  const col = geo.attributes.color, c = new THREE.Color();
  for (const [key, start, count] of geo.userData.spans) {
    c.set(colors[key]);
    for (let i = start; i < start + count; i++) col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// kit: { jersey, trim, number, shorts, sock, boot, stripe? }. gk 면 긴소매에 큰 장갑을 낀다.
// long: 납작한 사진 머리와 같은 크기의 긴 머리(얼굴 없음)로 만든다. 아니면 눈을 그린 둥근 머리.
// 돌려주는 것: root(놓는 쪽이 자리와 방향을 잡는다) > body(자세가 돌린다) > j.hips > 나머지 관절
export function makeRig({ kit, no = '', name = '', skin, hair, gk = false, long = false, proportions: P = PROPORTIONS }) {
  const m = measure(P);
  const look = { kit, no, name, skin, hair };
  let colors = tint(look);

  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const joint = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; };
  const hips = joint(body, 0, m.legLen, 0), spine = joint(hips, 0, m.spineY, 0);
  const arm = s => { const sh = joint(spine, s * m.shX, m.shY, 0); return [sh, joint(sh, 0, -m.uA, 0)]; };
  const leg = s => { const hp = joint(hips, s * m.gap, 0, 0), kn = joint(hp, 0, -m.Lt, 0); return [hp, kn, joint(kn, 0, -m.Ls, 0)]; };
  const [shL, elL] = arm(-1), [shR, elR] = arm(1), [hpL, knL, anL] = leg(-1), [hpR, knR, anR] = leg(1);
  const j = { hips, spine, shL, elL, shR, elR, hpL, knL, anL, hpR, knR, anR };

  // 상의에 입히는 등번호 그림
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const g2d = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const redraw = () => { drawJersey(g2d, colors, String(look.no), look.name); map.needsUpdate = true; };
  redraw(); whenNumbers(redraw);

  // 그물은 선 자세에서 만든 것이라, 뼈가 모두 제자리에 있을 때 묶는다
  const { flesh, shell } = buildBody(P, gk);
  paint(flesh, colors);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map(n => j[n]));
  const limbs = new THREE.SkinnedMesh(flesh, PAINTED), torso = new THREE.SkinnedMesh(shell, new THREE.MeshLambertMaterial({ map }));
  for (const mesh of [limbs, torso]) {
    mesh.castShadow = true;
    mesh.frustumCulled = false;   // 자세에 따라 팔다리가 선 자세의 둘레 밖으로 나간다
    root.add(mesh);
    mesh.bind(skeleton);
  }

  const headGeo = merge(long ? longHead(m.headR) : drawnHead(m.headR, P.eye * m.H));
  paint(headGeo, colors);
  const head = new THREE.Mesh(headGeo, PAINTED);
  head.position.set(0, m.headY, 0); head.castShadow = true; spine.add(head);
  j.head = head;
  const own = { geometry: headGeo, material: PAINTED };

  // 옷, 등번호, 이름, 살색·머리색 가운데 준 것만 바꾼다
  function dress(next) {
    Object.assign(look, next);
    colors = tint(look);
    paint(flesh, colors); paint(headGeo, colors);
    redraw();
  }

  // 머리를 밖에서 만든 것({ geometry, material }: 납작한 사진 머리)으로 바꿔 끼운다. 비우면 제 머리로 돌아온다
  function setHead(other) { Object.assign(head, other || own); }

  function dispose() {
    late.delete(redraw);
    flesh.dispose(); shell.dispose(); headGeo.dispose();
    torso.material.dispose(); map.dispose(); skeleton.dispose();
  }

  return { root, body, P, legLen: m.legLen, headR: m.headR, get colors() { return colors; }, dress, setHead, dispose, j };
}

// 지금 자세 그대로 굳힌 한 덩어리 그물(뿌리가 원점에 있을 때). 멀리 있는 선수 여럿을 한 번에 그리는 데 쓴다.
// 그린 머리를 한 캐릭터만 굳힐 수 있다
export function bakeRig(rig) {
  rig.root.updateMatrixWorld(true);
  const parts = [], v = new THREE.Vector3();
  rig.root.traverse(m => {
    if (!m.isMesh) return;
    const geo = m.geometry.clone();
    if (m.isSkinnedMesh) {
      // 뼈를 따라 휜 자리를 정점마다 계산해 굳힌다
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v); pos.setXYZ(i, v.x, v.y, v.z); }
      geo.computeVertexNormals();
    }
    parts.push([geo.applyMatrix4(m.matrixWorld), m.material.map ? 'jersey' : null]);
  });
  const geo = merge(parts);
  paint(geo, rig.colors);
  return geo;
}
