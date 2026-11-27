// 시작과 상태(home → run → over), 고정 틱 루프.
import { TICK } from './sim/constants.js';
import { createRun, step } from './sim/run.js';
import { clampSteps, MAX_STEPS } from './loop.js';
import { byNo } from './data/players.js';
import { createView } from './render/view.js';
import { loadPlayer, loadFar } from './render/player-model.js';
import { bindInput } from './ui/input.js';
import { createSound } from './ui/sound.js';
import { createStore } from './ui/store.js';
import { createScreens, wornKit } from './ui/screens.js';
import { makeShareFile, sendShare } from './ui/share.js';

// 규칙에서 일어난 일마다 내는 소리
const SOUND_OF = { move: ['skill'], jump: ['jump'], coin: ['coin'], item: ['item', 'kick'], knock: ['knock'], beat: ['beat'], hit: ['hit'] };
const RETRY_LOCK = 400;   // 끝난 직후 이만큼(ms)은 다시 시작을 받지 않는다. 달리던 손이 그대로 다음 판을 시작하지 않게
const SHARE_WARM = 700;   // 결과가 다 뜬 뒤에 공유 그림을 미리 그려 둔다. 누른 손길 안에서 공유 창을 열어야 하는 브라우저가 있다

const params = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const seedParam = params.get('seed');
const newSeed = () => (seedParam === null ? Math.floor(Math.random() * 2 ** 32) : Number(seedParam)) >>> 0;

function boot() {
  let storage = null;
  try { storage = localStorage; } catch { /* 저장이 막힌 브라우저: 이번 방문 동안만 남는다 */ }
  const store = createStore(storage), sound = createSound();
  sound.setOn(store.state.sound);
  // 지금 고른 선수와 그 선수가 입는 유니폼
  const look = () => ({ hero: store.state.player, kit: wornKit(store.state) });
  const screens = createScreens($('ui'), {
    store, sound, onStart: start, onPause: pause, onResume: resume, onHome: home, onQuit: quit,
    onOpen: name => screens.show(name),
    onLook: () => view.setLook(look()),
    // 뽑기 입장 장면: start 는 걸어 나올 수 있으면 true, reveal 은 조명을 켜고, stop 은 게임 장면으로 돌아간다
    onReveal: (step, no, kit) => {
      if (!view) return false;
      if (step === 'start') return view.walkout.start(no, kit);
      if (step === 'reveal') view.walkout.reveal(); else if (step === 'stop') view.walkout.stop();
      return true;
    },
    onShare: async () => sendShare(await card()),
  });

  let view;
  try { view = createView($('game'), { quality: params.get('q') || 'auto', look: look() }); }
  catch (e) { console.error(e); screens.show('nogl'); return; }

  let run = null, mode = 'home';
  let acc = 0, last = performance.now(), at = 1, overAt = 0;   // at: 마지막으로 그린 틱 사이 자리
  let paused = false;       // 확인용으로 루프를 세워 둔다
  let halt = null;          // 달리다 멈춘 상태. 'menu': 멈춤 화면, 'count': 3·2·1 을 세는 중
  let card = null, warm = 0;   // 이번 결과의 공유 그림을 주는 함수와, 그것을 미리 부르는 타이머
  const pending = [];       // 아직 규칙에 넘기지 않은 입력. 틱마다 하나씩 넘긴다

  function home() {
    run = createRun(newSeed());
    view.reset(run);
    mode = 'home'; view.setMode('home');
    screens.show('home');
  }

  // fromUi: 화면의 버튼이나 키로 시작한 판. 첫 판이면 조작 안내를 띄운다
  function begin(fromUi = false) {
    const hint = fromUi && !store.state.seen.hint;
    if (hint) { store.state.seen.hint = true; store.save(); }
    clearTimeout(warm);
    run = createRun(newSeed());
    pending.length = 0; acc = 0; halt = null;
    view.reset(run);
    view.setMode('run');
    mode = 'run';
    screens.show('run', { hint });
    sound.play('crowd');
  }

  function start() {
    if (mode === 'home' || (mode === 'over' && performance.now() - overAt > RETRY_LOCK)) begin(true);
  }

  function finish() {
    mode = 'over'; overAt = performance.now(); view.setMode('over');
    const dist = Math.floor(run.dist), player = byNo(store.state.player);
    const { best } = store.addRun({ dist: run.dist, coins: run.coins });
    let file = null;
    card = () => file ||= makeShareFile({ dist, player });
    warm = setTimeout(card, SHARE_WARM);
    screens.show('over', { dist, coins: run.coins, best });
  }

  function pause() {
    if (mode !== 'run' || halt === 'menu') return;
    halt = 'menu'; pending.length = 0;
    screens.show('pause');
  }

  function resume() {
    if (halt !== 'menu') return;
    halt = 'count';
    screens.countdown(() => { halt = null; screens.show('run'); });
  }

  // 멈춤 화면에서 그만두기: 여기까지 주운 코인과 거리는 남기고 첫 화면으로
  function quit() {
    if (halt !== 'menu') return;
    halt = null;
    store.addRun({ dist: run.dist, coins: run.coins });
    home();
  }

  function tick(cmds) {
    const events = step(run, cmds);
    view.onEvents(events, run);
    for (const ev of events) for (const name of SOUND_OF[ev.type] || []) sound.play(name);
    if (!run.alive) finish();
  }

  function draw(alpha, dt) {
    at = alpha;
    view.frame(run, alpha, dt);
    if (mode === 'run') screens.hud(Math.floor(run.dist), run.coins);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;   // 멈춰 있는 동안에도 시각은 따라가서, 다시 달릴 때 밀린 시간이 한꺼번에 들어오지 않는다
    if (paused || halt) return;
    if (mode === 'run') {
      acc += elapsed;
      const n = clampSteps(acc);
      acc = n === MAX_STEPS ? 0 : acc - n * TICK;   // 길게 끊겼으면 밀린 시간은 버린다
      for (let i = 0; i < n && run.alive; i++) tick(pending.length ? [pending.shift()] : []);
    }
    // 남은 시간은 -반 틱 ~ +반 틱이라 가운데를 0.5 로 본다
    draw(mode === 'run' ? Math.min(1, Math.max(0, acc / TICK + 0.5)) : 1, elapsed);
  }

  // 화면 글자 위의 손길은 여기까지 오지 않는다(screens 가 막는다). 탭으로 오는 것은 Enter·스페이스뿐이다
  bindInput(window,
    cmd => {
      if (mode === 'run' && !halt && pending.length < 2) pending.push(cmd);
      else if (mode === 'home' && cmd !== 'U') screens.step(cmd === 'L' ? -1 : 1);   // 첫 화면에서는 좌우 키가 선수를 넘긴다
    },
    () => screens.primary());
  addEventListener('keydown', e => { if (e.key === 'Escape' && !e.repeat) (halt === 'menu' ? resume : pause)(); });
  document.addEventListener('visibilitychange', () => {
    sound.setOn(!document.hidden && store.state.sound);
    if (document.hidden) pause();
  });
  // 크기를 바꾸면 캔버스가 비워지므로, 루프가 서 있을 때는 한 장을 다시 그린다
  addEventListener('resize', () => { view.resize(); if (paused || halt) draw(at, 0); });
  // 브라우저는 손길 안에서만 소리를 풀어 준다. 터치는 뗄 때, 마우스와 키는 누를 때가 손길로 쳐진다.
  // 버튼 위의 손길은 위로 올라오다 막히므로 내려가는 길에 듣는다
  for (const type of ['pointerdown', 'pointerup', 'keydown']) addEventListener(type, sound.unlock, true);

  home();
  requestAnimationFrame(frame);
  // 내 선수의 얼굴은 첫 화면과 같이 받고, 나머지 얼굴은 첫 화면이 그려진 뒤에 받는다.
  // 그때 달리는 장면도 한 번 그려 두어 첫 판의 시작이 멈칫하지 않게 한다
  requestAnimationFrame(() => setTimeout(() => {
    view.preload();
    const trial = createRun(1);
    step(trial, []);
    const warm = () => { if (mode === 'home') view.warm(trial, run); };
    warm();
    // 사람 모델은 늦게 온다. 오면 그 몸과 재질로 한 번 더 그려 둔다
    Promise.all([loadPlayer(), loadFar()]).then(warm, () => {});
  }));

  if (params.get('debug') === '1') window.__dbg = {
    get run() { return run; }, get seed() { return run.seed; }, view, screens,
    // 새 판을 until 틱까지 돌려 놓고 멈춘다. log 는 [[틱, 'L'|'R'|'U'], ...]
    stepTo(until, log = []) {
      paused = true;
      begin();
      for (let i = 0; run.alive && run.tick < until;) {
        while (i < log.length && log[i][0] < run.tick) i++;
        tick(i < log.length && log[i][0] === run.tick ? [log[i][1]] : []);
      }
      draw(1, 0);
    },
    pause(on) { paused = on; },
    renderOnce() { draw(1, 0); },
  };
}

boot();
