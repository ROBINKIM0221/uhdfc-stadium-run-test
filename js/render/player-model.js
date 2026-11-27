// 사람 모델(models/player.glb): 한 번 불러와 선수마다 복제해 쓴다.
// 몸은 보이지 않는 관절 몸(rig.js)을 따라 움직인다: 관절마다 세상 기준 회전을 옮겨 담아, 기술과 공 닿음을 그대로 쓴다.
// 옷 부위(꼭짓점의 part)마다 유니폼 색을 곱하고, 살색과 머리색을 선수에 맞춘다.
import * as THREE from './three.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone } from '../vendor/SkeletonUtils.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { tint } from './rig.js';
import { faceCamera } from './heads.js';
import { kitMap } from './kit-paint.js';
import { backPrint, PRINT } from './marking.js';

const model = name => new URL(`../../models/${name}`, import.meta.url).href;
const SCALE = 0.0098;                  // 모델은 cm 로 되어 있다. 키 1.75m 쯤이 되게 줄인다
const BASE_CM = 175, BASE_BMI = 23;    // 그 크기일 때의 키와, 몸통 폭을 그대로 두는 체질량 지수
const BASE_SKIN = new THREE.Color('#c28d6c'), BASE_HAIR = new THREE.Color('#2a211b');   // 모델 그림의 살색과 머리색
const P = 'mixamorig5';
const HEAD_UP = 0.09;               // 머리 뼈에서 사진 머리의 가운데까지(m)
// 관절 몸의 관절 → 모델의 뼈, 그 뼈가 가리키는 다음 뼈, 쉬는 자세에서 관절 몸의 그 뼈가 향하는 쪽
const UP = [0, 1, 0], DOWN = [0, -1, 0], FOOT = [0, -0.45, -1];
const MAP = [
  ['hips', 'Hips', 'Spine', UP], ['spine', 'Spine1', 'Spine2', UP], ['head', 'Head', 'HeadTop_End', UP],
  ['shL', 'LeftArm', 'LeftForeArm', DOWN], ['elL', 'LeftForeArm', 'LeftHand', DOWN],
  ['shR', 'RightArm', 'RightForeArm', DOWN], ['elR', 'RightForeArm', 'RightHand', DOWN],
  ['hpL', 'LeftUpLeg', 'LeftLeg', DOWN], ['knL', 'LeftLeg', 'LeftFoot', DOWN], ['anL', 'LeftFoot', 'LeftToeBase', FOOT],
  ['hpR', 'RightUpLeg', 'RightLeg', DOWN], ['knR', 'RightLeg', 'RightFoot', DOWN], ['anR', 'RightFoot', 'RightToeBase', FOOT],
];

const loads = {};
const loadModel = name => (loads[name] ||= new GLTFLoader().loadAsync(model(name)).then(g => ({ scene: g.scene, clips: g.animations })));
export const loadPlayer = () => loadModel('player.glb');
// 멀리 있는 선수용: 세모를 크게 줄이고 그림도 작게 한 같은 사람
export const loadFar = () => loadModel('player-far.glb');
// 유니폼 그림을 그릴 때 펼치는 옷 그물과 바탕 그림: 가까이서 보는 모델의 것. 멀리 있는 모델도 그림 자리가 같아 같은 그림을 쓴다
let source = null;
const sourceMesh = () => (source ||= loadPlayer().then(l => { let mesh = null; l.scene.traverse(o => { if (o.isSkinnedMesh && o.name === 'body') mesh = o; }); return mesh; }));

// 유니폼 색을 옷 부위마다 곱하는 재질. 부위: 0 살, 1 상의, 2 하의, 3 양말, 4 축구화, 5 머리카락
function kitMaterial(src) {
  const m = new THREE.MeshLambertMaterial({ map: src.map, normalMap: src.normalMap || null, transparent: src.transparent, alphaTest: src.alphaTest, side: THREE.FrontSide });
  m.userData.tints = Array.from({ length: 6 }, () => new THREE.Color(1, 1, 1));
  m.userData.skin = new THREE.Color(1, 1, 1);
  m.userData.print = { value: null };   // 등 마킹 그림(marking.js). 없으면 그리지 않는다
  m.userData.hasPrint = { value: 0 };
  m.onBeforeCompile = shader => {
    shader.uniforms.tints = { value: m.userData.tints };
    shader.uniforms.skinTone = { value: m.userData.skin };
    shader.uniforms.printMap = m.userData.print;
    shader.uniforms.hasPrint = m.userData.hasPrint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _part;\nvarying float vPart;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = _part;\nvRest = position;')
      // 셔츠 밑단의 접힌 면은 아래를 향해 잔디 빛만 받아 얼룩처럼 어둡다. 옆을 향한 면처럼 빛을 받게 한다
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (_part > 0.5 && _part < 1.5 && position.y < 97.0 && objectNormal.y < 0.0) objectNormal = normalize(vec3(objectNormal.x, 0.15, objectNormal.z) + vec3(0.0, 0.0, 1e-4));');
    // 등 마킹: 쉬는 자세의 자리(cm)로 상의 등에 붙여서 몸이 움직이면 옷과 같이 휜다
    const print = `vec2 pu = vec2((${PRINT.half.toFixed(1)} - vRest.x) / ${(PRINT.half * 2).toFixed(1)}, (vRest.y - ${PRINT.y0.toFixed(1)}) / ${(PRINT.y1 - PRINT.y0).toFixed(1)});
vec4 pr = texture2D(printMap, pu);
float onBack = hasPrint * float(int(vPart + 0.5) == 1) * step(vRest.z, -2.0) * step(0.0, pu.x) * step(pu.x, 1.0) * step(0.0, pu.y) * step(pu.y, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, pr.rgb, pr.a * onBack);`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 tints[6];\nuniform vec3 skinTone;\nuniform sampler2D printMap;\nuniform float hasPrint;\nvarying float vPart;\nvarying vec3 vRest;')
      // 유니폼 그림에서 투명한 상의 자리(반소매 밖의 팔)는 선수의 살색에 그림의 밝기만 곱해 칠한다
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= tints[int(vPart + 0.5)];\nif (int(vPart + 0.5) == 1) { diffuseColor.rgb = mix(skinTone * diffuseColor.rgb, diffuseColor.rgb, sampledDiffuseColor.a); diffuseColor.a = 1.0; }\n' + print);
  };
  m.customProgramCacheKey = () => 'kit';
  return m;
}

const v = new THREE.Vector3(), w = new THREE.Vector3(), s3 = new THREE.Vector3(), q = new THREE.Quaternion(), qp = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);   // 모델은 +Z 를, 관절 몸은 -Z 를 본다
const ratio = (hex, from) => { const c = new THREE.Color(hex); return c.setRGB(Math.min(1.6, c.r / from.r), Math.min(1.6, c.g / from.g), Math.min(1.6, c.b / from.b)); };

// 선수 한 명의 몸. loaded 는 loadPlayer() 가 준 것, plate 면 등에 번호와 이름을 단다
export function createBody(loaded, { plate = true } = {}) {
  const root = clone(loaded.scene);
  root.scale.setScalar(SCALE);
  const bone = name => root.getObjectByName(P + name);
  const mats = [];
  let bodyMesh = null, atlas = null, wornKit = null;   // 옷 그림을 바꿔 끼우는 몸 그물, 모델 본래의 옷 그림, 지금 입은 유니폼
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.material = kitMaterial(o.material);
    if (o.name === 'body') { bodyMesh = o; atlas = o.material.map; }
    o.castShadow = true;
    o.frustumCulled = false;   // 자세에 따라 팔다리가 쉬는 자세의 둘레 밖으로 나간다
    mats.push(o.material);
  });

  // 관절 몸의 쉬는 자세와 맞춘 뼈마다의 세상 기준 회전. 모델을 관절 몸과 같은 쪽(-Z)을 보게 반 바퀴 돌려 잰다
  root.rotation.y = Math.PI;
  root.updateMatrixWorld(true);
  const links = MAP.map(([joint, name, child, dir]) => {
    const b = bone(name);
    b.getWorldPosition(v); bone(child).getWorldPosition(w);
    const swing = new THREE.Quaternion().setFromUnitVectors(w.sub(v).normalize(), new THREE.Vector3(...dir).normalize());
    // 뼈의 부모들(모델 뿌리 밑에서 이 뼈 바로 위까지). 부모의 세상 기준 회전을 행렬 없이 곱해서 얻는 데 쓴다
    const chain = [];
    for (let a = b.parent; a !== root; a = a.parent) chain.unshift(a);
    return { joint, b, chain, rest: swing.multiply(b.getWorldQuaternion(new THREE.Quaternion())) };
  });
  const hips = bone('Hips'), head = bone('Head'), hipsRest = hips.position.clone();
  // 모든 뼈를 부모부터 차례로. 관절 몸에 없는 뼈(손가락, 목, 쇄골 같은)는 쉬는 자세의 회전을 적어 둔다
  const linkOf = new Map(links.map(l => [l.b, l])), order = [];
  hips.traverse(o => { if (o.isBone) order.push({ b: o, link: linkOf.get(o), rest: o.quaternion.clone() }); });
  // 실제 사람의 동작(모션 캡처). 시각을 직접 정해 그 자세를 뼈에 넣는다
  const mixer = new THREE.AnimationMixer(root), clips = new Map(loaded.clips.map(c => [c.name, c]));
  let action = null;
  const baseHip = hips.getWorldPosition(v).y;   // 땅에서 엉덩이 관절까지(m), 기본 체격일 때
  let hipHeight = baseHip;
  root.rotation.y = 0;

  // 사진 머리: 장면에 따로 두고 머리 뼈의 자리와 방향을 따라간다. 모델은 cm 로 줄여 놓아서 그 밑에 달면 같이 작아진다
  const anchor = new THREE.Object3D(), face = new THREE.Mesh();
  face.position.y = HEAD_UP; face.visible = false;
  anchor.add(face);

  const print = plate && bodyMesh ? backPrint() : null;
  if (print) { bodyMesh.material.userData.print.value = print.texture; bodyMesh.material.userData.hasPrint.value = 1; }

  return {
    root, head, anchor,
    get hipHeight() { return hipHeight; },
    // 옷, 등번호, 이름, 살색·머리색, 키(cm)·몸무게(kg). 키만큼 늘이고, 같은 키에서 무거울수록 몸을 옆과 앞뒤로 넓힌다
    dress({ kit, no = '', name = '', skin, hair, cm = BASE_CM, kg = BASE_BMI * (BASE_CM / 100) ** 2 }) {
      const tall = cm / BASE_CM, wide = tall * Math.min(1.15, Math.max(0.9, Math.sqrt(kg / (cm / 100) ** 2 / BASE_BMI)));
      root.scale.set(SCALE * wide, SCALE * tall, SCALE * wide);
      hipHeight = baseHip * tall;
      const c = tint({ kit, skin, hair });
      // 살과 머리카락은 모델 그림의 색에서 선수의 색이 되도록 비율을 곱한다. 축구화는 그림 색 그대로 둔다
      const parts = [ratio(c.skin, BASE_SKIN), new THREE.Color(c.jersey), new THREE.Color(c.shorts), new THREE.Color(c.sock), new THREE.Color(1, 1, 1), ratio(c.hair, BASE_HAIR)];
      for (const m of mats) { m.userData.tints.forEach((t, i) => t.copy(parts[i])); m.userData.skin.set(c.skin); }
      // 유니폼 그림이 준비되면 바꿔 끼우고 옷 부위에는 색을 곱하지 않는다. 그 전에는 본래 그림에 색만 곱한다
      if (bodyMesh && wornKit !== kit.id) {
        wornKit = kit.id;
        bodyMesh.material.map = atlas;
        kitMap(kit, sourceMesh).then(tex => {
          if (!tex || wornKit !== kit.id) return;
          bodyMesh.material.map = tex;
          for (const i of [1, 2, 3]) bodyMesh.material.userData.tints[i].setRGB(1, 1, 1);
        });
      } else if (bodyMesh && bodyMesh.material.map !== atlas) for (const i of [1, 2, 3]) bodyMesh.material.userData.tints[i].setRGB(1, 1, 1);
      if (print) print.draw(kit, no, name);
    },
    clips,
    // 동작 name 의 time 초 자세를 뼈에 넣는다. follow(rig, w) 가 w 만큼 관절 몸 쪽으로 섞는다
    mocap(name, time) {
      const clip = clips.get(name);
      if (!clip) return;
      const next = mixer.clipAction(clip);
      if (next !== action) { if (action) action.stop(); action = next; action.play(); }
      action.time = time;
      mixer.update(0);
    },
    // 동작 name 에서 한 발(side: 'Left' | 'Right')이 가장 앞에 나온 시각(초). 걸음의 박자를 맞추는 데 쓴다
    footForward(name, side) {
      const clip = clips.get(name), foot = bone(side + 'Foot');
      let best = 0, most = -Infinity;
      for (let i = 0; i < 32; i++) {
        this.mocap(name, clip.duration * i / 32);
        root.updateMatrixWorld(true);
        const z = foot.getWorldPosition(v).applyMatrix4(m4.copy(root.matrixWorld).invert()).z;
        if (z > most) { most = z; best = clip.duration * i / 32; }
      }
      return best;
    },
    // 관절 몸(rig)의 지금 자세를 옮겨 담는다. w(0..1): 0 이면 mocap 으로 넣어 둔 자세 그대로, 1 이면 관절 몸 그대로.
    // 돌려주는 것: 다리 길이의 비(모델 / 관절 몸)
    follow(rig, mix = 1) {
      rig.root.updateMatrixWorld(true);
      root.position.copy(rig.root.position);
      root.quaternion.copy(rig.root.quaternion).multiply(TURN);
      // 엉덩이 자리: 관절 몸의 엉덩이가 선 자세에서 벗어난 만큼을 다리 길이의 비로 늘려 옮긴다.
      // 관절 몸이 누워 있어도 맞도록 관절 몸 뿌리를 기준으로 재고, 모델은 반 바퀴 돌아 있으므로 앞뒤·좌우를 뒤집는다
      const k = hipHeight / rig.legLen;
      rig.j.hips.getWorldPosition(v).sub(rig.root.position).applyQuaternion(q.copy(rig.root.quaternion).invert());
      v.y -= rig.legLen;
      v.set(-v.x * k / root.scale.x, v.y * k / root.scale.y, -v.z * k / root.scale.z);
      if (mix >= 1) hips.position.copy(hipsRest).add(v); else hips.position.lerp(v.add(hipsRest), mix);
      // 부모 쪽 뼈부터 차례로: 관절 몸의 세상 기준 회전에 쉬는 자세의 차이를 곱하고, 부모의 회전을 덜어 제 회전으로 둔다.
      // 관절 몸에 없는 뼈는 쉬는 자세로 간다. 세상 행렬은 그릴 때 한꺼번에 갱신된다
      if (mix > 0) for (const { b, link, rest } of order) {
        if (!link) { b.quaternion.slerp(rest, mix); continue; }
        rig.j[link.joint].matrixWorld.decompose(w, q, s3);
        q.multiply(link.rest);
        qp.copy(root.quaternion);
        for (const a of link.chain) qp.multiply(a.quaternion);
        b.quaternion.slerp(qp.invert().multiply(q), mix);
      }
      return k;
    },
    // 사진 머리({ geometry, material })를 씌운다. 비우면 모델의 머리로 돌아온다. 모델의 머리카락과 속눈썹도 머리 뼈에 붙어 같이 감춰진다
    setFace(flat) {
      face.visible = !!flat;
      if (flat) { face.geometry = flat.geometry; face.material = flat.material; }
      head.scale.setScalar(flat ? 1e-3 : 1);
    },
    // 사진 머리를 머리 자리에 놓고 카메라 쪽으로 돌린다. follow 뒤에 부른다
    placeFace(camera) {
      if (!face.visible) return;
      head.getWorldPosition(anchor.position); head.getWorldQuaternion(anchor.quaternion);
      anchor.updateMatrixWorld(true);
      faceCamera(face, camera);
    },
    dispose() { for (const m of mats) m.dispose(); if (print) print.texture.dispose(); },
  };
}

// 관절 몸(rig, 원점에 선)의 지금 자세 그대로 굳힌 한 덩어리 그물. 멀리 있는 선수 여럿을 한 번에 그리는 데 쓴다.
// 돌려주는 것: geometry(살·옷과 머리카락 두 묶음), materials(그 둘의 재질), dress(옷 입히기)
export function bakeBody(loaded, rig) {
  const body = createBody(loaded, { plate: false });
  body.follow(rig);
  body.root.updateMatrixWorld(true);
  const parts = [], materials = [];
  body.root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry.clone(), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); pos.setXYZ(i, v.x, v.y, v.z); }
    g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
    g.computeVertexNormals();
    parts.push(g); materials.push(o.material);
  });
  return { geometry: mergeGeometries(parts, true), materials, dress: look => body.dress(look) };
}
