// 줍는 것: 코인은 도는 금색 원반, 아이템은 빛기둥 속에서 도는 금빛 공.
import * as THREE from './three.js';
import { BODY_MID } from '../sim/constants.js';

const POPS = 8, MAX_COINS = 96 + POPS;   // 놓인 코인 96개와 방금 주운 코인
const COIN_R = 0.24;
const SPIN = 4, WAVE = 0.45;   // 도는 빠르기(rad/초)와, 1m 뒤의 코인이 어긋나 도는 각: 줄 전체가 물결처럼 돈다
const POP = 0.28;              // 주운 코인이 위로 튀며 사라지는 시간(초)
const ITEM_Y = 0.75, BEAM_H = 5;

// 가운데가 도톰하고 테두리가 짙은 원반. 넓은 면이 앞을 보게 세워 둔다.
// 테두리 색이 달라서 줄지어 겹쳐 보여도 하나씩 갈라져 보인다
function coinGeometry() {
  const inner = COIN_R * 0.72, t = 0.03;
  const profile = [[0, t + 0.012], [inner, t + 0.012], [inner + 0.015, t], [COIN_R, t], [COIN_R, -t], [inner + 0.015, -t], [inner, -t - 0.012], [0, -t - 0.012]];
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20).rotateX(Math.PI / 2);
  const p = g.attributes.position, colors = [], face = new THREE.Color('#FFE066'), rim = new THREE.Color('#D4920A');
  for (let i = 0; i < p.count; i++) colors.push(...(Math.hypot(p.getX(i), p.getY(i)) < inner + 0.005 ? face : rim).toArray());
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 금빛 공: 축구공 무늬가 보이게 짙은 점을 고르게 흩는다
const ballTexture = () => canvasTexture(128, 64, g => {
  const N = 12, golden = Math.PI * (3 - Math.sqrt(5));
  g.fillStyle = '#FFD84D'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#A86A00';
  for (let i = 0; i < N; i++) {
    const lat = Math.asin(1 - (i + 0.5) / N * 2), u = (i * golden / (2 * Math.PI)) % 1;
    for (const du of [-1, 0, 1]) { g.beginPath(); g.ellipse((u + du) * 128, (0.5 - lat / Math.PI) * 64, 5 / Math.max(0.25, Math.cos(lat)), 5, 0, 0, 7); g.fill(); }
  }
});

// 빛기둥과 공 둘레의 빛무리를 한 장에. 기둥은 옆과 위로 갈수록 사라지고, 공은 아래에서 ITEM_Y 높이에 온다
const beamTexture = () => canvasTexture(128, 256, g => {
  const across = g.createLinearGradient(44, 0, 84, 0);
  across.addColorStop(0, 'rgba(255,199,44,0)'); across.addColorStop(0.5, 'rgba(255,232,150,1)'); across.addColorStop(1, 'rgba(255,199,44,0)');
  g.fillStyle = across; g.fillRect(44, 0, 40, 256);
  const up = g.createLinearGradient(0, 256, 0, 0);
  up.addColorStop(0, '#000'); up.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = up; g.fillRect(0, 0, 128, 256);
  const cy = 256 * (1 - ITEM_Y / BEAM_H), glow = g.createRadialGradient(64, cy, 3, 64, cy, 60);
  glow.addColorStop(0, 'rgba(255,244,190,1)'); glow.addColorStop(0.35, 'rgba(255,205,60,0.55)'); glow.addColorStop(1, 'rgba(255,199,44,0)');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = glow; g.fillRect(0, 0, 128, 256);
});

export function create(ctx) {
  const coins = new THREE.InstancedMesh(coinGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#8a5c00' }), MAX_COINS);
  coins.castShadow = true; coins.frustumCulled = false; coins.count = 0;

  // 아이템은 300m 넘게 떨어져 놓이므로 한 번에 하나만 보인다
  const item = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshLambertMaterial({ map: ballTexture(), emissive: '#7a5200' }));
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.5, BEAM_H).translate(0, BEAM_H / 2 - ITEM_Y, 0),
    new THREE.MeshBasicMaterial({ map: beamTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  item.add(ball, beam);
  ctx.scene.add(coins, item);
  const m = new THREE.Matrix4(), v = new THREE.Vector3();

  // 방금 주운 코인: 선수 곁에서 위로 튀며 작아진다
  const pops = Array.from({ length: POPS }, () => ({ x: 0, y: 0, at: -1e9 }));
  let next = 0;

  return {
    reset() { for (const p of pops) p.at = -1e9; },

    update(run, alpha) {
      const dist = run.pdist + (run.dist - run.pdist) * alpha, t = ctx.now;
      coins.count = 0; item.visible = false;
      for (const o of run.objs) {
        if (o.kind === 'coin') {
          if (coins.count < MAX_COINS - POPS) coins.setMatrixAt(coins.count++, m.makeRotationY(t * SPIN + o.d * WAVE).setPosition(o.x, o.h, dist - o.d));
        } else if (o.kind === 'item' && !item.visible) {
          item.visible = true;
          item.position.set(o.x, ITEM_Y + 0.12 * Math.sin(t * 4), dist - o.d);
          ball.rotation.set(0.4, t * 3, 0);
          beam.scale.x = 1 + 0.15 * Math.sin(t * 9);
          ctx.blob(o.x, dist - o.d, 0.3);
        }
      }
      for (const p of pops) {
        const u = (t - p.at) / POP;
        if (u < 0 || u >= 1) continue;
        coins.setMatrixAt(coins.count++, m.makeRotationY(u * 9).scale(v.setScalar(1 - u * u)).setPosition(p.x, p.y + 1.4 * u, -0.25));
      }
      coins.instanceMatrix.needsUpdate = true;
    },

    onEvent(ev, run) {
      if (ev.type !== 'coin') return;
      const p = pops[next];
      next = (next + 1) % POPS;
      p.x = run.x; p.y = run.y + BODY_MID; p.at = ctx.now;
    },
  };
}
