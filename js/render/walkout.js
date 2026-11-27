// 뽑기 입장: 어두운 통로 끝 밝은 입구를 등지고 선수가 느린 걸음으로 다가온다(실루엣). 펼치는 순간 앞 조명이 켜지며
// 유니폼과 얼굴이 드러나고 선수가 멈춰 선다. 게임과 같은 그래픽 장치로 따로 둔 장면에 그린다.
import * as THREE from './three.js';
import { loadPlayer, createBody } from './player-model.js';
import { flatHead, loadFace } from './heads.js';
import { byNo } from '../data/players.js';
import { kitById } from '../data/kits.js';
import { FACE_COLORS } from '../data/face-colors.js';

const WALK = 2.6;               // 입구에서 멈춰 설 자리까지 걷는 시간(초). 단서가 다 나오는 시간과 같다
const FROM = -7.5, TO = -1.9;   // 걷기 시작하는 자리와 멈춰 서는 자리(z, m). 카메라는 z = 3 에서 본다
const SLOW = 0.6;               // 느린 화면: 실제 사람의 가볍게 뛰기를 이 빠르기로 튼다
const LIGHT_UP = 0.35;          // 앞 조명이 다 켜지는 시간(초)
const HEAD_R = 0.12;

const glowTexture = () => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.35, 'rgba(255,214,140,.45)'); r.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export function createWalkout(renderer) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  scene.background = new THREE.Color('#02060F');
  scene.fog = new THREE.Fog('#02060F', 9, 24);
  camera.position.set(0, 1.2, 3); camera.lookAt(0, 1.15, -2);

  // 통로: 어두운 바닥과 벽, 끝에 밝은 입구와 그 빛무리, 바닥에 비친 입구 빛
  const dark = new THREE.MeshLambertMaterial({ color: '#0E1626' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 34).rotateX(-Math.PI / 2), dark);
  floor.position.z = -13;
  const wall = side => { const m = new THREE.Mesh(new THREE.PlaneGeometry(34, 6).rotateY(side * Math.PI / 2), dark); m.position.set(-side * 3.5, 3, -13); return m; };
  const glow = glowTexture();
  const add = (w, h, opacity) => new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.6), new THREE.MeshBasicMaterial({ color: '#FFF1CC', fog: false, toneMapped: false }));
  door.position.set(0, 1.8, -24);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), add(14, 12, 0.9));
  halo.position.set(0, 2, -23.5);
  const shine = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 26).rotateX(-Math.PI / 2), add(3.2, 26, 0.35));
  shine.position.set(0, 0.01, -11);
  scene.add(floor, wall(1), wall(-1), door, halo, shine);

  // 빛: 입구 쪽에서 오는 빛, 펼칠 때 켜지는 앞 조명, 옅은 둘레 빛
  const back = new THREE.DirectionalLight('#FFE2A8', 2.2); back.position.set(0, 4, -20);
  const key = new THREE.DirectionalLight('#FFFFFF', 0); key.position.set(1.8, 3, 6);
  const fill = new THREE.HemisphereLight('#7088C8', '#0B1220', 0.25);
  scene.add(back, key, fill);

  let body = null, t = 0, litAt = -1, active = false, who = null;
  loadPlayer().then(loaded => {
    body = createBody(loaded);
    scene.add(body.root, body.anchor);
    renderer.compile(scene, camera);   // 처음 뽑을 때 재질을 만드느라 멈칫하지 않게 미리 만든다
  }, () => {});

  const walk = {
    get active() { return active; },
    // 선수 no 가 유니폼 kit 을 입고 걸어 나온다. 사람 모델이 아직 없으면 false
    start(no, kit) {
      if (!body) return false;
      const p = byNo(no);
      who = no; t = 0; litAt = -1; active = true;
      body.dress({ kit: kitById(kit), no, name: p.name, cm: p.cm, kg: p.kg, ...FACE_COLORS[no] });
      body.setFace(null);   // 어두운 동안은 사진 얼굴(빛을 안 받는다)을 감추고 모델의 머리를 그림자로 둔다
      loadFace(no).catch(() => {});
      key.intensity = 0; fill.intensity = 0.25;
      return true;
    },
    // 펼치는 순간: 조명이 켜지고 선수가 멈춰 서서 얼굴이 보인다
    reveal() { if (active && litAt < 0) { litAt = t; t = Math.max(t, WALK); } },
    stop() { active = false; },
    frame(dt, width, height) {
      t += Math.min(dt, 0.1);
      const lit = litAt < 0 ? 0 : Math.min(1, (t - litAt) / LIGHT_UP), u = Math.min(1, t / WALK);
      body.root.position.set(0, 0, FROM + (TO - FROM) * u);   // 고른 빠르기로 와야 발이 바닥에서 미끄러지지 않는다
      if (litAt < 0) body.mocap('jog', (t * SLOW) % body.clips.get('jog').duration);
      else body.mocap('idle', (t - litAt) % body.clips.get('idle').duration);
      if (lit > 0 && who !== null) { const face = flatHead(who, HEAD_R); if (face) { body.setFace(face); } }
      body.root.updateMatrixWorld(true);
      body.placeFace(camera);
      key.intensity = 2.6 * lit; fill.intensity = 0.25 + 0.55 * lit;
      // 카메라는 다가오는 선수를 따라 아주 조금 물러난다
      camera.position.z = 3 + 0.3 * u;
      if (camera.aspect !== width / height) { camera.aspect = width / height; camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
    },
  };
  return walk;
}
