// 뽑기 입장: 어두운 통로 끝 밝은 입구를 등지고 선수가 걸어(또는 뛰어) 나온다(실루엣). 카메라는 낮은 자리에서 올려다보며 천천히 물러난다.
// 펼치는 순간 조명이 쾅 켜지며 카메라가 가슴 위로 바짝 다가가고, 선수가 멈춰 서서 세리머니를 한다. 걸음과 세리머니는 뽑을 때마다 고른다.
// 게임과 같은 그래픽 장치로 따로 둔 장면에 그린다.
import * as THREE from './three.js';
import { loadPlayer, createBody } from './player-model.js';
import { roundHead, loadFace } from './heads.js';
import { byNo } from '../data/players.js';
import { kitById } from '../data/kits.js';
import { FACE_COLORS } from '../data/face-colors.js';

const WALK = 2.6;               // 입구에서 멈춰 설 자리까지 걷는 시간(초). 단서가 다 나오는 시간과 같다
const TO = -1.9;                // 멈춰 서는 자리(z, m)
// 걸음: 동작, 트는 빠르기, 1배로 틀 때 몸이 나아가는 속도(모델 단위 cm/s, 동작 원본의 엉덩이가 간 거리 / 길이).
// 속도가 맞아야 발이 바닥에서 미끄러지지 않는다
const GAITS = [{ clip: 'walk', rate: 1, speed: 160.5 }, { clip: 'strut', rate: 1.15, speed: 87.1 }, { clip: 'jog', rate: 1, speed: 232.7 }];
// 조명이 켜진 뒤의 세리머니. 끝나면 처음과 FADE 초 동안 섞어 되풀이한다(모두 선 자세로 시작하고 끝난다)
const POSES = ['winBox', 'winJoy', 'cheer', 'rally', 'excited', 'flex', 'armsBack', 'clap', 'wave'];
const FADE = 0.35;
const HEAD_R = 0.12;
const LOOK_WALK = 0.25, LOOK_LIT = 0.7;      // 머리를 카메라 쪽으로 돌리는 정도: 걸을 때, 멈춘 뒤
const MOTES = 160;                            // 빛 속에 떠다니는 먼지

const canvasTexture = (size, paint) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const glowTexture = () => canvasTexture(128, (g, n) => {
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.35, 'rgba(255,214,140,.45)'); r.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = r; g.fillRect(0, 0, n, n);
});
// 입구에서 사방으로 뻗는 빛살: 가운데에서 바깥으로 흐려지는 가는 쐐기들
const raysTexture = () => canvasTexture(512, (g, n) => {
  g.translate(n / 2, n / 2);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, w = 0.01 + rnd() * 0.045, len = n * (0.3 + rnd() * 0.2);
    const r = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    r.addColorStop(0, `rgba(255,236,190,${0.25 + rnd() * 0.35})`); r.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = r;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, len, a - w, a + w); g.closePath(); g.fill();
  }
});
const ease = x => 1 - (1 - x) ** 3;

export function createWalkout(renderer) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  scene.background = new THREE.Color('#02060F');
  scene.fog = new THREE.Fog('#02060F', 9, 24);

  // 통로: 어두운 바닥과 벽, 벽을 따라 입구로 모이는 파란 줄 조명, 끝에 밝은 입구와 그 빛무리·빛살, 바닥에 비친 입구 빛
  const dark = new THREE.MeshLambertMaterial({ color: '#0E1626' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 34).rotateX(-Math.PI / 2), dark);
  floor.position.z = -13;
  const wall = side => { const m = new THREE.Mesh(new THREE.PlaneGeometry(34, 6).rotateY(side * Math.PI / 2), dark); m.position.set(-side * 3.5, 3, -13); return m; };
  const strip = new THREE.MeshBasicMaterial({ color: '#2B6BFF' });
  const strips = [-1, 1].flatMap(side => [0.35, 2.7].map(y => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 30), strip); m.position.set(side * 3.45, y, -11); return m; }));
  const glow = glowTexture();
  const add = (map, opacity) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.6), new THREE.MeshBasicMaterial({ color: '#FFF1CC', fog: false, toneMapped: false }));
  door.position.set(0, 1.8, -24);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), add(glow, 0.9));
  halo.position.set(0, 2, -23.5);
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), add(raysTexture(), 0.55));
  rays.position.set(0, 2, -23);
  const shine = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 26).rotateX(-Math.PI / 2), add(glow, 0.35));
  shine.position.set(0, 0.01, -11);
  scene.add(floor, wall(1), wall(-1), ...strips, door, halo, rays, shine);

  // 먼지: 입구 빛을 받아 반짝이며 천천히 떠오른다
  const dust = new Float32Array(MOTES * 3), drift = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    dust.set([(Math.random() - 0.5) * 5, Math.random() * 3.5, -14 + Math.random() * 15], i * 3);
    drift[i] = Math.random() * Math.PI * 2;
  }
  const dustGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: glow, size: 0.05, color: '#FFE2A8', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(motes);

  // 빛: 입구 쪽에서 오는 빛(윤곽), 펼칠 때 쾅 켜지는 앞 조명, 뒤 양옆에서 비추는 금빛·파란 빛, 옅은 둘레 빛
  const back = new THREE.DirectionalLight('#FFE2A8', 2.2); back.position.set(0, 4, -20);
  const key = new THREE.DirectionalLight('#FFFFFF', 0); key.position.set(1.8, 3, 6);
  const rimL = new THREE.DirectionalLight('#FFC72C', 0); rimL.position.set(-4, 3, -4);
  const rimR = new THREE.DirectionalLight('#3D7BFF', 0); rimR.position.set(4, 3, -4);
  const fill = new THREE.HemisphereLight('#7088C8', '#0B1220', 0.25);
  scene.add(back, key, rimL, rimR, fill);

  let body = null, t = 0, litAt = -1, active = false, who = null, faced = false;
  let gait = GAITS[0], pose = POSES[0], from = TO;
  let bones = [], saved = [], hips = null;
  const hipsSaved = new THREE.Vector3();
  loadPlayer().then(loaded => {
    body = createBody(loaded);
    scene.add(body.root, body.anchor);
    body.root.traverse(o => { if (o.isBone) bones.push(o); });
    saved = bones.map(() => new THREE.Quaternion());
    hips = bones.find(o => o.name.endsWith('Hips'));
    renderer.compile(scene, camera);   // 처음 뽑을 때 재질을 만드느라 멈칫하지 않게 미리 만든다
  }, () => {});
  // 동작 a 의 ta 초 자세와 b 의 tb 초 자세를 w(0..1)만큼 섞어 뼈에 넣는다
  const blend = (a, ta, b, tb, w) => {
    body.mocap(a, ta);
    bones.forEach((o, i) => saved[i].copy(o.quaternion)); hipsSaved.copy(hips.position);
    body.mocap(b, tb);
    bones.forEach((o, i) => o.quaternion.slerp(saved[i], 1 - w)); hips.position.lerp(hipsSaved, 1 - w);
  };
  const pick = list => list[Math.floor(Math.random() * list.length)];

  const aim = new THREE.Vector3(), at = new THREE.Vector3();
  const walk = {
    get active() { return active; },
    // 선수 no 가 유니폼 kit 을 입고 걸어 나온다. 사람 모델이 아직 없으면 false
    start(no, kit) {
      if (!body) return false;
      const p = byNo(no);
      who = no; t = 0; litAt = -1; active = true; faced = false;
      body.dress({ kit: kitById(kit), no, name: p.name, cm: p.cm, kg: p.kg, ...FACE_COLORS[no] });
      gait = pick(GAITS); pose = pick(POSES);
      from = TO - gait.speed * body.root.scale.z * gait.rate * WALK;   // 몸 크기만큼 보폭도 달라진다
      body.setFace(null);   // 사진이 오기 전에는 모델의 머리. 어두운 동안이라 바뀌어도 티가 안 난다
      loadFace(no, true).catch(() => {});
      return true;
    },
    // 펼치는 순간: 조명이 켜지고 카메라가 다가가며 선수가 멈춰 선다
    reveal() { if (active && litAt < 0) { litAt = t; t = Math.max(t, WALK); } },
    stop() { active = false; },
    frame(dt, width, height) {
      t += Math.min(dt, 0.1);
      const u = Math.min(1, t / WALK), since = litAt < 0 ? -1 : t - litAt;
      const z = from + (TO - from) * u;   // 고른 빠르기로 와야 발이 바닥에서 미끄러지지 않는다
      body.root.position.set(0, 0, z);
      if (since < 0) body.mocap(gait.clip, (t * gait.rate) % body.clips.get(gait.clip).duration);
      else {
        const L = body.clips.get(pose).duration - FADE, k = since % L;
        if (since >= L && k < FADE) blend(pose, L + k, pose, k, k / FADE); else body.mocap(pose, k);
      }
      if (!faced && who !== null) { const face = roundHead(who, HEAD_R); if (face) { body.setFace(face); faced = true; } }

      // 카메라. 걸을 때: 무릎 높이에서 선수를 올려다보며 천천히 물러나고, 손에 든 듯 조금 흔들린다.
      // 켜진 뒤: 가슴 위가 차도록 바짝 다가간 자리로 끊어 넘어가 천천히 더 다가간다
      body.root.updateMatrixWorld(true);
      if (since < 0) {
        camera.position.set(0.12 * Math.sin(t * 0.7), 0.8 + 0.02 * Math.sin(t * 1.9), 3 + 0.6 * u);
        aim.set(0.04 * Math.sin(t * 1.1), 1.15, z);
      } else {
        const e = ease(Math.min(1, since / 2.5)), headY = body.head.getWorldPosition(at).y;
        camera.position.set(0.35 - 0.1 * e, headY - 0.15, TO + 3.4 - 0.3 * e);   // 팔을 머리 위로 뻗어도 손이 화면 안에 든다
        aim.set(0, headY - 0.3, TO);
      }
      camera.lookAt(aim);
      body.look(camera.position, since < 0 ? LOOK_WALK : LOOK_LIT * ease(Math.min(1, since / 0.6)));
      body.placeFace(camera, true);

      // 빛: 켜지는 순간 앞 조명이 세게 터졌다가 가라앉는다. 입구 빛살은 천천히 돌며 일렁인다
      const flash = since < 0 ? 0 : 1 + 1.2 * Math.exp(-since * 5);
      key.intensity = 1.5 * flash; rimL.intensity = rimR.intensity = since < 0 ? 0 : 1.4;
      fill.intensity = since < 0 ? 0.25 : 0.6;
      rays.rotation.z = t * 0.05; rays.material.opacity = 0.3 + 0.06 * Math.sin(t * 2.3);
      for (let i = 0; i < MOTES; i++) {
        dust[i * 3 + 1] = (dust[i * 3 + 1] + 0.12 * Math.min(dt, 0.1)) % 3.5;
        dust[i * 3] += 0.002 * Math.sin(t + drift[i]);
      }
      dustGeo.attributes.position.needsUpdate = true;

      if (camera.aspect !== width / height) { camera.aspect = width / height; camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
    },
  };
  return walk;
}
