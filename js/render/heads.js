// 머리 모양과 얼굴 사진.
// 머리 관절의 가운데를 원점으로 한 부품 목록([도형, 색 이름])을 돌려주고, rig.js 가 한 그물로 합친다. 앞은 -Z.
import * as THREE from './three.js';

// 얼굴 사진은 정사각형이고 머리가 한가운데 있다: 정수리가 위에서 8%, 턱이 78%.
// side: 사진 한 변이 머리 반폭의 몇 배인지, mid: 머리 가운데의 높이(아래에서 잰 비율).
// 사진 머리는 세로로 긴 타원이라 그린 머리보다 폭을 줄이고(slim) 세로·앞뒤로 늘리며(tall, deep), 그만큼 가운데를 올린다(rise)
const FACE = { side: 4.1, mid: 0.513, slim: 0.92, tall: 1.3, deep: 1.1, rise: 0.13 };

// 그린 머리: 둥근 머리에 머리카락 덮개, 귀, 점 눈
export function drawnHead(headR, eyeR) {
  const at = (geo, key, x, y, z) => [geo.translate(x, y, z), key];
  const parts = [
    [new THREE.SphereGeometry(headR, 16, 12).scale(1, 1.07, 1), 'skin'],
    // 덮개를 뒤로 젖혀 이마를 드러낸다
    at(new THREE.SphereGeometry(headR * 1.05, 16, 8, 0, Math.PI * 2, 0, 1.85).scale(1, 1.1, 1.02).rotateX(0.5), 'hair', 0, headR * 0.04, 0),
  ];
  for (const s of [-1, 1]) {
    parts.push(at(new THREE.SphereGeometry(headR * 0.17, 6, 4), 'skin', s * headR * 0.98, -headR * 0.08, 0));
    parts.push(at(new THREE.SphereGeometry(eyeR, 6, 4).scale(1, 1.3, 0.5), 'eye', s * headR * 0.36, -headR * 0.1, -headR * 0.9));
  }
  return parts;
}

// 사진 머리와 같은 크기의 입체 머리: 타원 머리, 머리카락 덮개, 귀. 얼굴은 그리지 않는다.
// 납작한 사진 머리를 쓰는 선수가 등을 보일 때의 뒤통수다
export function longHead(headR) {
  const R = headR * FACE.slim, y = headR * FACE.rise;
  const parts = [
    [new THREE.SphereGeometry(1, 20, 14).scale(R, R * FACE.tall, R * FACE.deep).translate(0, y, 0), 'skin'],
    [new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, 1.55).rotateX(0.95).scale(R * 1.06, R * FACE.tall * 1.09, R * FACE.deep * 1.07).translate(0, y, 0), 'hair'],
  ];
  for (const s of [-1, 1]) parts.push([new THREE.SphereGeometry(R * 0.2, 8, 6).translate(s * R * 0.97, y - R * 0.1, R * 0.05), 'skin']);
  return parts;
}

// ---------- 사진 받기 ----------
const DIR = new URL('../../img/', import.meta.url);
const CUT = no => `face/${no}.png`, BIG = no => `head/${no}.png`;   // 같은 컷아웃의 128px 과 256px
const pics = new Map();   // 경로 → { img, done, ready }

function pic(path) {
  let p = pics.get(path);
  if (!p) {
    const img = new Image();
    img.src = new URL(path, DIR).href;
    pics.set(path, p = { img, done: false });
    // 못 받은 사진은 지워 두어 다음에 다시 받는다
    p.ready = img.decode().then(() => { p.done = true; }, e => { pics.delete(path); throw e; });
  }
  return p;
}
const got = path => { const p = pics.get(path); return p && p.done ? p.img : null; };

// 컷아웃 하나를 받는다. big 이면 가까이서 보는 내 선수용 큰 것. 못 받으면 거절된다
export const loadFace = (no, big = false) => pic((big ? BIG : CUT)(no)).ready;

// ---------- 납작한 사진 머리 ----------
const flats = new Map();   // 그림 경로 → 재질
const planes = new Map();  // 머리 반지름 → 판
let level = 1;

// 얼굴 컷아웃을 붙인 판. 놓는 쪽이 faceCamera 로 늘 카메라를 보게 돌린다. 사진이 아직 안 왔으면 null
export function flatHead(no, headR, big = false) {
  const path = (big ? BIG : CUT)(no), img = got(path);
  if (!img) return null;
  let material = flats.get(path), geometry = planes.get(headR);
  if (!material) {
    const map = new THREE.Texture(img);
    map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true;
    flats.set(path, material = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5 }));
    material.color.setScalar(level);
  }
  if (!geometry) {
    const S = FACE.side * FACE.slim * headR;
    planes.set(headR, geometry = new THREE.PlaneGeometry(S, S).translate(0, headR * FACE.rise + (0.5 - FACE.mid) * S, 0));
  }
  return { geometry, material };
}

// 가까이서 보는 사진 머리: 머리 타원만큼 앞으로 볼록한 판에 사진을 앞에서 비추듯 입히고 빛을 받게 한다.
// 카메라 쪽으로 돌리지 않고 머리 뼈와 같이 돌린다(placeFace 의 rigid). 사진이 아직 안 왔으면 null
const rounds = new Map();   // 선수 번호 → { geometry, material }
export function roundHead(no, headR) {
  const flat = flatHead(no, headR, true);
  if (!flat) return null;
  let r = rounds.get(no);
  if (!r) {
    const S = FACE.side * FACE.slim * headR, R = headR * FACE.slim, cy = headR * FACE.rise;
    const geometry = new THREE.PlaneGeometry(S, S, 32, 32).translate(0, cy + (0.5 - FACE.mid) * S, 0), p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / R, t = (p.getY(i) - cy) / (R * FACE.tall);
      p.setZ(i, R * FACE.deep * Math.sqrt(Math.max(0, 1 - u * u - t * t)));
    }
    geometry.computeVertexNormals();
    rounds.set(no, r = { geometry, material: new THREE.MeshLambertMaterial({ map: flat.material.map, alphaTest: 0.5 }) });
  }
  return r;
}

// 납작한 머리는 빛을 받지 않는다. 시간대가 어두워지면 이 값(0..1)으로 같이 낮춘다
export function shadeFlats(v) {
  level = v;
  for (const m of flats.values()) m.color.setScalar(v);
}

const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), up = new THREE.Vector3(), AXIS_Z = new THREE.Vector3(0, 0, 1);
// 납작한 머리를 카메라 쪽으로 돌린다. 몸통이 뻗은 쪽이 화면에서도 얼굴의 위가 되게 돌려, 옆으로 누운 선수는 얼굴도 눕는다
export function faceCamera(head, camera) {
  head.parent.getWorldQuaternion(q);
  up.set(0, 1, 0).applyQuaternion(q).applyQuaternion(q2.copy(camera.quaternion).invert());
  const roll = Math.hypot(up.x, up.y) > 0.05 ? Math.atan2(-up.x, up.y) : 0;
  head.quaternion.copy(q.invert()).multiply(camera.quaternion).multiply(q2.setFromAxisAngle(AXIS_Z, roll));
}
