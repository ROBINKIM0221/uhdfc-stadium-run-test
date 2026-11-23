// 첫 화면, 달리는 동안의 글자, 멈춤, 결과, 그리고 그 위에 여는 시트(선수·유니폼·뽑기).
// 무엇을 보일지는 뿌리의 data-screen·data-sheet 로만 정하고, 보이고 숨기는 일은 CSS 가 맡는다.
import { DRAW_COST, poolOf, draw } from './gacha.js';
import { isInApp } from './inapp.js';
import { PLAYERS, byNo } from '../data/players.js';
import { KITS, GK_KITS, kitById } from '../data/kits.js';

const COUNT_MS = 700;     // 3·2·1 의 한 박자
const FLIP_MS = 450;      // 카드가 뒤집히는 시간. style.css 의 .turn 과 같다
const PHOTO_WAIT = 1200;  // 뽑은 선수의 사진을 이만큼까지 기다렸다가 카드를 뒤집는다
const SHEETS = { players: '선수', kits: '유니폼', draw: '뽑기' };
const POS = { FW: '공격수', MF: '미드필더', DF: '수비수', GK: '골키퍼' };

const wait = ms => new Promise(done => setTimeout(done, ms));

export const fmt = n => n.toLocaleString('en-US');
// 뽑기 버튼 밑의 작은 글. left: 아직 뽑을 것이 남은 수
export const drawNote = (coins, left = 1) => (!left ? '다 모았어요' : coins < DRAW_COST ? `${DRAW_COST - coins}개 더` : `코인 ${DRAW_COST}`);
// 지금 고른 선수가 입는 유니폼의 id: 골키퍼는 골키퍼 유니폼, 나머지는 필드 유니폼
export const wornKit = state => (byNo(state.player).pos === 'GK' ? state.gkKit : state.kit);
// 뽑은 것이 들어간 목록: 선수면 선수 목록, 유니폼이면 유니폼 목록
export const listOf = item => (item.type === 'player' ? 'players' : 'kits');

// 셔츠 그림. 몸판은 상의 색, 깃과 소매 끝은 줄 색이고, 세로 줄무늬가 있는 유니폼은 몸판 위에 긋는다
const SHIRT = 'M30 9 42 5Q50 14 58 5L70 9 95 27 83 45 72 37V95H28V37L17 45 5 27Z';
export function shirtSvg(kit) {
  const stripes = kit.stripe
    ? `<clipPath id="cut-${kit.id}"><path d="${SHIRT}"/></clipPath><g clip-path="url(#cut-${kit.id})" fill="${kit.stripe}">${[4.5, 18.5, 32.5, 46.5, 60.5, 74.5, 88.5].map(x => `<rect x="${x}" width="7" height="100"/>`).join('')}</g>`
    : '';
  return `<svg class="shirt" viewBox="0 0 100 100" aria-hidden="true"><path d="${SHIRT}" fill="${kit.jersey}"/>${stripes}`
    + `<path d="M42 5Q50 14 58 5M93 30 85 42M7 30 15 42" fill="none" stroke="${kit.trim}" stroke-width="5" stroke-linecap="round"/>`
    + `<path d="${SHIRT}" fill="none" stroke="rgba(4,26,69,.28)" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

const playerCell = (p, s) => {
  const has = s.players.includes(p.no);
  return `<button class="cell" data-act="pick" data-id="${p.no}" aria-pressed="${p.no === s.player}"${has ? '' : ' disabled'}>`
    + `<i class="face" style="background-image:url(img/face/${p.no}.png)"></i><b>${p.no}</b><span>${has ? p.name : ''}</span></button>`;
};
const kitCell = (k, s, worn) => `<button class="cell" data-act="wear" data-id="${k.id}" aria-pressed="${k.id === worn}"${s.kits.includes(k.id) ? '' : ' disabled'}>${shirtSvg(k)}<span>${k.name}</span></button>`;
// 뒤집힌 카드의 앞면: 선수면 사진·등번호·이름·포지션, 유니폼이면 셔츠 그림과 이름
function cardFront(item) {
  if (item.type === 'player') {
    const p = byNo(item.id);
    return `<img src="img/card/${p.no}.jpg" alt=""><p><b>${p.no}</b><span><strong>${p.name}</strong><small>${POS[p.pos]}</small></span></p>`;
  }
  const k = kitById(item.id);
  return `${shirtSvg(k)}<p><span><strong>${k.name}</strong><small>${k.gk ? '골키퍼' : '필드'} 유니폼</small></span></p>`;
}

// 버튼 속 그림. 선 굵기와 색은 CSS 가 정한다
const icon = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  player: icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c.6-3.6 3.6-6 7.5-6s6.9 2.4 7.5 6'),
  kit: icon('M8.5 3.5 4 5.6 2 10l3 1.6 1.5-1v9.9h11v-9.9l1.5 1L22 10l-2-4.4-4.5-2.1c-.6 1.5-1.9 2.4-3.5 2.4s-2.9-.9-3.5-2.4Z'),
  draw: icon('M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5ZM12 8.2l1.1 2.4 2.6.3-1.9 1.8.5 2.6-2.3-1.3-2.3 1.3.5-2.6-1.9-1.8 2.6-.3Z'),
  share: icon('M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5'),
  home: icon('M3.5 11.5 12 4l8.5 7.5M6 9.8V20h4.5v-5.5h3V20H18V9.8'),
  crown: icon('M4 18.5h16M4.6 15.5 3.5 7l5 3.8L12 5l3.5 5.8 5-3.8-1.1 8.5Z'),
  left: icon('M14.5 5.5 8 12l6.5 6.5'),
  right: icon('M9.5 5.5 16 12l-6.5 6.5'),
  // 소리가 켜져 있으면 물결(.on), 꺼져 있으면 가위표(.off)가 보인다
  sound: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.5v5h3.2l5.3 4.2V5.3L6.7 9.5H3.5Z"/><path class="on" d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.2a8.2 8.2 0 0 1 0 11.6"/><path class="off" d="m16 9.5 5 5m0-5-5 5"/></svg>',
};

const DRAW_TILE = `<button class="tile" data-act="draw">${ICON.draw}<b>뽑기</b><small data-k="need"></small></button>`;
const DRAW_SHEET = `<div class="draw">
  <div class="card"><div class="turn"><div class="back"><img src="img/emblem.png" alt=""></div><div class="front"></div></div></div>
  <div class="acts">
    <p class="msg"></p>
    <div class="pair" hidden><button class="go" data-act="ok">확인</button><button class="go alt" data-act="list"></button></div>
    <button class="go" data-act="roll">뽑기<small>코인 ${DRAW_COST}</small></button>
  </div>
</div>`;
const HTML = `
<section class="screen s-home">
  <div class="top">
    <div class="bar">
      <span class="tag"><em>최고</em><b data-k="best"></b><small>m</small></span>
      <img class="crest" src="img/emblem.png" alt="" width="34" height="44">
      <span class="right"><span class="tag"><i class="coin"></i><b data-k="coins"></b></span><button class="round" data-act="sound">${ICON.sound}</button></span>
    </div>
    <h1 class="logo"><span>UHDFC</span>STADIUM RUN</h1>
  </div>
  <div class="pick">
    <button class="round" data-act="prev" aria-label="앞 선수">${ICON.left}</button>
    <div class="hero">
      <button class="photo" data-act="players" aria-label="선수 목록 열기"><img alt="" width="256" height="256"></button>
      <button class="kit" data-act="kits" aria-label="유니폼 바꾸기"></button>
      <p class="who"><b data-k="no"></b><span><strong data-k="name"></strong><small data-k="pos"></small></span></p>
    </div>
    <button class="round" data-act="next" aria-label="다음 선수">${ICON.right}</button>
  </div>
  <div class="actions">
    <p class="inapp">모은 선수를 오래 두려면 크롬이나 사파리에서 여세요</p>
    <button class="go" data-act="start" data-primary>달리기</button>
    <div class="dock">
      <button class="tile" data-act="players">${ICON.player}<b>선수</b><small data-k="havePlayers"></small></button>
      <button class="tile" data-act="kits">${ICON.kit}<b>유니폼</b><small data-k="haveKits"></small></button>
      ${DRAW_TILE}
    </div>
  </div>
</section>
<div class="hud">
  <span class="dist"><b data-k="dist"></b><small>m</small></span>
  <span class="right"><span class="tag"><i class="coin"></i><b data-k="got"></b></span><button class="round pause" data-act="pause" aria-label="일시정지"></button></span>
</div>
<div class="hint">
  <span><kbd>←</kbd><kbd>→</kbd></span><b><i>밀어서 </i>피해요</b>
  <span><kbd>↑</kbd></span><b><i>밀어서 </i>넘어요</b>
</div>
<section class="screen s-pause">
  <h2>잠깐 멈췄어요</h2>
  <button class="go" data-act="resume" data-primary>계속 달리기</button>
  <button class="chip" data-act="quit">그만하기</button>
</section>
<div class="count" data-k="count"></div>
<section class="screen s-over">
  <div class="top">
    <p class="best">${ICON.crown}최고 기록!</p>
    <p class="past">최고 기록 <span data-k="best"></span>m</p>
    <p class="final"><b data-k="final"></b><small>m</small></p>
    <dl class="sum">
      <div><dt>이번 코인</dt><dd><i class="coin"></i><b data-k="won"></b></dd></div>
      <div><dt>모은 코인</dt><dd><i class="coin"></i><b data-k="coins"></b></dd></div>
    </dl>
  </div>
  <div class="actions">
    <button class="go" data-act="start" data-primary>다시 달리기</button>
    <div class="dock">
      <button class="tile" data-act="share">${ICON.share}<b>공유</b></button>
      ${DRAW_TILE}
      <button class="tile" data-act="home">${ICON.home}<b>처음으로</b></button>
    </div>
  </div>
</section>
<section class="screen s-sheet">
  <header><h2><span data-k="sheet"></span><small data-k="have"></small></h2><span class="purse tag"><i class="coin"></i><b data-k="coins"></b></span><button class="chip" data-act="close" data-primary>닫기</button></header>
  <div class="body"></div>
</section>
<p class="screen s-nogl">이 브라우저에서는 경기장을 그릴 수 없어요. 크롬이나 사파리로 열어 주세요.</p>`;

// show(name, data): 'home' | 'run' { hint } | 'pause' | 'over' { dist, coins, best } | 'nogl' 은 화면을 바꾸고,
// 'players' | 'kits' | 'draw' 는 지금 화면 위에 시트를 연다.
// onLook(): 고른 선수나 유니폼이 바뀌었다(저장은 이미 했다)
export function createScreens(root, { store, sound, onStart, onOpen, onPause, onResume, onShare, onHome, onQuit, onLook }) {
  root.innerHTML = HTML;
  root.toggleAttribute('data-inapp', isInApp(navigator.userAgent));
  const slots = {}, body = root.querySelector('.s-sheet .body');
  const card = root.querySelector('.hero'), photo = card.querySelector('img'), kitBox = card.querySelector('.kit');
  for (const el of root.querySelectorAll('[data-k]')) (slots[el.dataset.k] ||= []).push(el);
  const set = (key, text) => { for (const el of slots[key]) if (el.textContent !== text) el.textContent = text; };
  let timer = 0, dist = -1, coins = -1;
  let got = null, turn = 0;   // 뽑기 시트: 방금 뽑아 펼쳐 놓은 것, 시트를 열고 닫을 때마다 바뀌는 번호(늦게 끝난 뒤집기를 버린다)

  // 모은 수 / 모을 수 있는 수
  const have = {
    players: () => `${store.state.players.length}/${PLAYERS.length}`,
    kits: () => `${store.state.kits.length}/${KITS.length + GK_KITS.length}`,
  };

  // 저장된 값에서 오는 글자와 표시
  function refresh() {
    const s = store.state, p = byNo(s.player), left = poolOf(s).length;
    set('best', fmt(s.best)); set('coins', fmt(s.coins)); set('need', drawNote(s.coins, left));
    set('no', String(p.no)); set('name', p.name); set('pos', POS[p.pos]);
    // 첫 화면의 선수 카드: 사진과 입은 유니폼. 가진 선수가 하나뿐이면 넘기는 버튼을 감춘다
    const src = `img/card/${p.no}.jpg`, kit = wornKit(s);
    if (photo.getAttribute('src') !== src) photo.src = src;
    if (kitBox.dataset.kit !== kit) { kitBox.dataset.kit = kit; kitBox.innerHTML = shirtSvg(kitById(kit)); }
    root.toggleAttribute('data-solo', s.players.length < 2);
    set('havePlayers', have.players()); set('haveKits', have.kits());
    root.toggleAttribute('data-draw', left > 0 && s.coins >= DRAW_COST);
    root.toggleAttribute('data-mute', !s.sound);
    root.querySelector('[data-act="sound"]').setAttribute('aria-label', s.sound ? '소리 끄기' : '소리 켜기');
  }

  // 뽑기 시트의 글과 버튼: 뽑기 전에는 큰 "뽑기", 펼친 뒤에는 "확인"과 "목록으로", 그 밑에 작은 "한 번 더".
  // 코인이 모자라거나 다 모았으면 뽑는 버튼 대신 까닭을 적는다
  function drawUi() {
    const s = store.state, left = poolOf(s).length, need = DRAW_COST - s.coins;
    const [msg, pair, list, roll] = ['.msg', '.pair', '[data-act="list"]', '[data-act="roll"]'].map(q => body.querySelector(q));
    msg.textContent = !left ? '다 모았어요' : need > 0 ? `코인 ${fmt(need)}개 더 모으면 뽑을 수 있어요` : '';
    msg.classList.toggle('done', !left);
    pair.hidden = !got;
    if (got) list.textContent = `${SHEETS[listOf(got)]} 목록으로`;
    roll.hidden = !left || need > 0;
    roll.className = got ? 'pill' : 'go';
    roll.firstChild.data = got ? '한 번 더' : '뽑기';
  }

  const sheets = {
    players() {
      const s = store.state;
      body.innerHTML = Object.keys(POS).map(pos => `<h3>${POS[pos]}</h3><div class="grid">${PLAYERS.filter(p => p.pos === pos).map(p => playerCell(p, s)).join('')}</div>`).join('');
    },
    kits() {
      const s = store.state;
      const group = (title, list, worn) => `<h3>${title}</h3><div class="grid kits">${list.map(k => kitCell(k, s, worn)).join('')}</div>`;
      body.innerHTML = group('필드 선수', KITS, s.kit) + group('골키퍼', GK_KITS, s.gkKit);
    },
    draw() {
      body.innerHTML = DRAW_SHEET;
      drawUi();
    },
  };

  function show(name, data = {}) {
    clearTimeout(timer);   // 세던 3·2·1 은 그만둔다
    refresh();
    if (SHEETS[name]) {
      got = null; turn++;
      set('sheet', SHEETS[name]); set('have', have[name]?.() ?? ''); root.dataset.sheet = name;
      sheets[name]();
      body.scrollTop = 0;
      // 방금 뽑은 칸(fresh)이 있으면 그 칸을, 아니면 고른 칸을 보이는 데까지 내린다
      const fresh = data.fresh != null && body.querySelector(`[data-id="${data.fresh}"]`);
      if (fresh) fresh.setAttribute('data-new', '');
      (fresh || body.querySelector('[aria-pressed="true"]'))?.scrollIntoView({ block: 'nearest' });
      return;
    }
    delete root.dataset.sheet;
    root.dataset.screen = name;
    root.toggleAttribute('data-hint', !!data.hint);
    if (name !== 'over') return;
    set('final', fmt(data.dist)); set('won', `+${fmt(data.coins)}`);
    root.toggleAttribute('data-best', !!data.best);
  }

  // 고른 칸만 눌린 것으로 표시한다. scope: 하나만 고를 수 있는 범위
  const mark = (cell, scope) => { for (const c of scope.querySelectorAll('[aria-pressed]')) c.setAttribute('aria-pressed', c === cell); };
  const chose = () => { store.save(); sound.play('touch'); onLook(); };

  // 첫 화면에서 가진 선수를 등번호 차례로 넘긴다. dir: 앞 -1, 다음 1. 카드는 넘긴 쪽에서 미끄러져 들어온다
  function step(dir) {
    const s = store.state, mine = PLAYERS.filter(p => s.players.includes(p.no)).map(p => p.no).sort((a, b) => a - b);
    if (root.dataset.screen !== 'home' || root.dataset.sheet || mine.length < 2) return;
    s.player = mine[(mine.indexOf(s.player) + dir + mine.length) % mine.length];
    chose(); refresh();
    card.removeAttribute('data-slide'); void card.offsetWidth; card.dataset.slide = dir > 0 ? 'next' : 'prev';
  }
  // 카드 언저리를 옆으로 밀어도 넘어간다. 밀고 뗀 손길이 카드의 누름으로 이어지지 않게 시각을 적어 둔다
  let downX = null, swiped = 0;
  const pick = root.querySelector('.pick');
  pick.addEventListener('pointerdown', e => { downX = e.clientX; });
  pick.addEventListener('pointerup', e => {
    const dx = downX === null ? 0 : e.clientX - downX;
    downX = null;
    if (Math.abs(dx) > 28) { swiped = performance.now(); step(dx < 0 ? 1 : -1); }
  });

  const acts = {
    prev: () => step(-1), next: () => step(1),
    start: onStart, pause: onPause, resume: onResume, share: onShare, home: onHome, quit: onQuit,
    players: () => onOpen('players'), kits: () => onOpen('kits'), draw: () => onOpen('draw'),
    close() { turn++; delete root.dataset.sheet; body.innerHTML = ''; refresh(); },
    sound() { store.state.sound = !store.state.sound; store.save(); sound.setOn(store.state.sound); refresh(); },
    pick(cell) { store.state.player = Number(cell.dataset.id); mark(cell, body); chose(); },
    wear(cell) {
      const kit = kitById(cell.dataset.id);
      store.state[kit.gk ? 'gkKit' : 'kit'] = kit.id;
      mark(cell, cell.parentElement); chose();
    },
    // 한 번 뽑는다. 펼쳐 둔 카드가 있으면 먼저 덮고, 새 카드의 사진이 준비되면 뒤집는다
    async roll() {
      const box = body.firstElementChild;
      const item = !box.hasAttribute('data-busy') && draw(store.state, Math.random);
      if (!item) return;
      store.save(); refresh();
      box.setAttribute('data-busy', '');
      const mine = turn, photo = item.type === 'player' && Object.assign(new Image(), { src: `img/card/${item.id}.jpg` });
      if (box.hasAttribute('data-open')) { box.removeAttribute('data-open'); await wait(FLIP_MS); }
      if (photo) await Promise.race([photo.decode().catch(() => {}), wait(PHOTO_WAIT)]);
      if (mine !== turn) return;   // 그사이 시트를 닫았다. 뽑은 것은 이미 저장돼 있다
      box.querySelector('.front').innerHTML = cardFront(item);
      box.setAttribute('data-open', '');
      sound.play('item');
      await wait(FLIP_MS);          // 카드가 다 뒤집힌 뒤에 고르는 버튼을 낸다
      if (mine !== turn) return;
      box.removeAttribute('data-busy');
      got = item;
      drawUi();
    },
    ok() { acts.close(); },
    // 방금 뽑은 것이 들어간 목록을 연다. 결과 화면에서 왔으면 목록을 닫았을 때 고른 모습이 보이게 첫 화면으로 먼저 간다
    list() {
      const item = got, over = root.dataset.screen === 'over';
      acts.close();
      if (over) onHome();
      show(listOf(item), { fresh: item.id });
    },
  };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || performance.now() - swiped < 350) return;
    if (e.detail) b.blur();   // 손이나 마우스로 누른 버튼에 초점이 남으면 다음 Enter·스페이스가 그 버튼을 다시 누른다
    acts[b.dataset.act](b);
  });
  // 화면 글자 위에서 시작한 손길과 버튼 위의 Enter·스페이스는 게임 입력으로 넘기지 않는다
  root.addEventListener('pointerdown', e => e.stopPropagation());
  root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button')) e.stopPropagation(); });

  return {
    show,
    step,
    // 지금 열려 있는 화면의 큰 버튼을 누른다(Enter·스페이스). 달리는 동안에는 없다
    primary() { [...root.querySelectorAll('[data-primary]')].find(b => b.offsetParent)?.click(); },
    hud(d, c) {
      if (d !== dist) set('dist', fmt(dist = d));
      if (c !== coins) set('got', fmt(coins = c));
    },
    // 3·2·1 을 세고 done 을 부른다. 세는 동안 show 가 불리면 done 은 불리지 않는다
    countdown(done) {
      show('count');
      let n = 3;
      (function beat() {
        if (!n) return done();
        // 숫자마다 새 요소를 넣어 커졌다 사라지는 움직임이 처음부터 다시 돈다
        slots.count[0].replaceChildren(Object.assign(document.createElement('b'), { textContent: n-- }));
        sound.play('touch');
        timer = setTimeout(beat, COUNT_MS);
      })();
    },
  };
}
