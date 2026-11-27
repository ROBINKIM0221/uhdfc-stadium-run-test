// 그리기 조각을 엮는 곳. 조각은 create(ctx) 로 만들고 { reset(run), update(run, alpha, dt), onEvent(ev, run) } 만 안다.
import * as THREE from './three.js';
import { TICK, SPEED0, SPEED_MAX } from '../sim/constants.js';
import { PLAYERS, START_PLAYER } from '../data/players.js';
import { START_KITS } from '../data/kits.js';
import * as daynight from './daynight.js';
import * as fx from './fx.js';
import * as stadium from './stadium.js';
import * as hero from './hero.js';
import * as defenders from './defenders.js';
import * as pickups from './pickups.js';
import { loadFace } from './heads.js';
import { usePainter } from './kit-paint.js';

// 품질 단계와 화면 배율 상한. 그림자 지도 크기는 daynight, 관절 몸 수는 defenders 가 단계 이름으로 정한다
const TIERS = ['low', 'mid', 'high'];
const RATIO = { low: 1, mid: 1.5, high: 2 };
// 늘 선수 뒤 위에서 따라간다. 첫 화면에서도 같은 자리라 달리기 시작할 때 화면이 튀지 않는다. 세로 화면은 선수 깊이에서 가로 4m 쯤만 보여서 좌우는 일부만 따라간다
const CAM = { fov: 62, height: 3.6, back: 5.2, follow: 0.62, wide: 7 };   // wide: 가장 빠를 때 넓어지는 시야각(도)
const SHAKE = 0.35;        // 공을 찬 순간 화면이 흔들리는 시간(초)
const OVER_TILT = 0.6;     // 결과 화면으로 넘어가며 고개를 숙이는 시간(초)
const mix = (a, b, k) => a + (b - a) * k;

// look: 처음에 세울 선수 번호(hero)와 그 선수가 입은 유니폼 id(kit).
// WebGL 을 못 쓰는 브라우저에서는 예외를 던진다
export function createView(canvas, { quality = 'auto', look = {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  usePainter(renderer);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.5, 300);
  const auto = quality === 'auto';

  // 조각들이 같이 보는 것. mode: 'home' | 'run' | 'over', now: 동작에 쓰는 시계(초),
  // time: 지금 시간대 값(daynight 가 채움), blob(x, z, r): 발밑 그림자 놓기(fx 가 채움)
  const ctx = {
    THREE, scene, camera, renderer, quality: auto ? 'mid' : quality,
    look: { hero: START_PLAYER, kit: START_KITS[0], ...look }, mode: 'home', now: 0, time: null, blob: null,
  };
  // daynight 와 fx 가 앞에 와야 한다: 뒤 조각들이 ctx.time 과 ctx.blob 을 쓴다
  const pieces = [daynight, fx, stadium, hero, defenders, pickups].map(m => m.create(ctx));
  let shown = null;
  let over = 0;        // 결과 화면으로 넘어온 정도(0..1). 카메라가 고개를 숙이는 데 쓴다
  let shakeAt = -1e9;  // 화면이 흔들리기 시작한 시각
  const calm = matchMedia('(prefers-reduced-motion: reduce)');   // 움직임 줄이기에서는 흔들지 않는다

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RATIO[ctx.quality]));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function setQuality(name) { ctx.quality = name; resize(); }

  // 자동 품질: 2초씩 초당 장수를 재서 45 아래면 내리고, 58 위로 10초를 채우면 올린다.
  // 한 번 내려온 단계로는 다시 올라가지 않아 오르내리기를 되풀이하지 않는다
  let frames = 0, span = 0, good = 0, ceiling = TIERS.length - 1;
  function measure(dt) {
    if (dt <= 0 || dt >= 0.25) { frames = span = 0; return; }   // 멈췄다 돌아온 프레임은 재지 않는다
    frames++; span += dt;
    if (span < 2) return;
    const fps = frames / span, i = TIERS.indexOf(ctx.quality);
    frames = span = 0;
    if (fps < 45 && i > 0) { ceiling = i - 1; good = 0; setQuality(TIERS[i - 1]); }
    else if (fps > 58 && i < ceiling) { good += 2; if (good >= 10) { good = 0; setQuality(TIERS[i + 1]); } }
    else good = 0;
  }

  function reset(run) {
    shown = run;
    ctx.now = run.tick * TICK;
    for (const p of pieces) p.reset(run);
  }

  resize();
  const view = {
    resize, reset,
    // 달리는 장면(trial)을 한 번 그려 보고 지금 장면(back)으로 돌아온다. 선수들의 옷 그림과 그늘·재질의 셰이더가 이때 만들어져서,
    // 첫 판을 시작하는 순간에 한꺼번에 만드느라 화면이 멈추지 않는다. 같은 프레임 안에서 다시 그리므로 화면에는 보이지 않는다
    warm(trial, back) {
      const mode = ctx.mode;
      ctx.mode = 'run'; reset(trial); view.frame(trial, 1, 0);
      ctx.mode = mode; reset(back); view.frame(back, 1, 0);
    },
    setMode(mode) { ctx.mode = mode; },
    // 선수 번호와 유니폼 id. 조각들은 reset 에서 ctx.look 을 읽어 갈아입힌다
    setLook({ hero, kit }) {
      if (hero === ctx.look.hero && kit === ctx.look.kit) return;
      Object.assign(ctx.look, { hero, kit });
      if (shown) reset(shown);
    },
    // 막는 쪽으로 나올 선수들의 얼굴을 미리 받아 둔다. 못 받은 얼굴은 그린 머리로 나온다
    preload() { for (const p of PLAYERS) loadFace(p.no).catch(() => {}); },
    // 틱을 돌린 뒤마다 부른다. 시계를 그 틱이 시작한 시각에 맞춰 두어 조각들이 ctx.now 를 동작의 시작으로 쓴다
    onEvents(events, run) {
      ctx.now = (run.tick - 1) * TICK;
      if (events.some(ev => ev.type === 'item') && !calm.matches) shakeAt = ctx.now;
      for (const ev of events) for (const p of pieces) p.onEvent(ev, run);
    },

    // alpha: 앞 틱과 지금 틱 사이 어디를 그릴지(0..1), dt: 지난 프레임부터 흐른 시간(초)
    frame(run, alpha, dt) {
      if (auto) measure(dt);
      // 달리는 동안은 규칙의 시계를 따라가 같은 틱이면 같은 그림이 나온다
      ctx.now = ctx.mode === 'run' && run.alive ? (run.tick - 1 + alpha) * TICK : ctx.now + dt;
      // 카메라를 먼저 놓는다: 납작한 머리가 이번 프레임의 카메라를 보고 돈다
      const x = (run.px + (run.x - run.px) * alpha) * CAM.follow;
      // 아이템으로 공을 찬 순간 잠깐 흔들린다
      const shake = Math.max(0, 1 - (ctx.now - shakeAt) / SHAKE) ** 2 * 0.14;
      camera.position.set(x + shake * Math.sin(ctx.now * 71), CAM.height + shake * Math.sin(ctx.now * 53 + 1), CAM.back);
      // 결과 화면에서는 고개를 숙여 선수를 화면 가운데로 올린다. 아래쪽 버튼이 선수를 가리지 않는다
      over = ctx.mode === 'over' ? Math.min(1, over + dt / OVER_TILT) : 0;
      const down = over * over * (3 - 2 * over);
      camera.lookAt(x * 0.92, mix(0.1, -1.7, down), -7);
      // 빨라질수록 시야를 넓혀 빠르기가 눈에 보이게 한다. 아이템 동안에는 조금 더 넓어진다
      const fast = ctx.mode === 'run' ? Math.min(1.3, Math.max(0, (run.speed - SPEED0) / (SPEED_MAX - SPEED0))) : 0;
      const fov = CAM.fov + CAM.wide * fast;
      if (Math.abs(fov - camera.fov) > 0.01) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
      for (const p of pieces) p.update(run, alpha, dt);
      renderer.render(scene, camera);
    },

    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: ctx.quality }),
  };
  return view;
}
