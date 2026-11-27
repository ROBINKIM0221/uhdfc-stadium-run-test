// 경기장: 잔디와 선, 광고판, 2층 관중석, 지붕과 조명.
// 선수는 제자리에 있고 경기장이 다가온다. 모든 무늬가 PERIOD 마다 되풀이되므로 통째로 그만큼만 밀었다가 되돌린다.
import * as THREE from './three.js';
import { LANES, LANE_W } from '../sim/constants.js';

const PERIOD = 96;                 // 중앙선에서 다음 중앙선까지(m). 잔디 줄 12m, 관중석 무늬 24m, 광고판 48m 가 이 안에서 맞아떨어진다
const HALF = LANES * LANE_W / 2;   // 터치라인까지
const TURF = 6.6;                  // 잔디 끝. 그 밖은 트랙
const WALL_X = 11;                 // 관중석 앞벽
const END = 150;                   // 골대 뒤 관중석 앞벽까지
const BACK = 66;                   // 선수 뒤로 이어지는 길이. 뒤쪽 관중석은 그 안쪽 24m 에 선다
const LEN = 336;                   // 관중석 한 채의 길이: 선수 뒤에서 골대 뒤 관중석 너머까지에 PERIOD 를 더한 것
const STEP = 0.8;                  // 관중석 한 줄의 깊이
const SEAT = [0.75, 1.35];         // 한 줄에서 보이는 높이(발판에서 어깨 아래 ~ 머리 위). 그 아래는 앞줄이 가린다
const FACING = [0, 0.6, 0.8];      // 관중이 빛을 받는 쪽: 경기장 쪽으로 비스듬히 위
const FONT = px => `900 ${px}px 'Arial Black', Impact, 'Malgun Gothic', sans-serif`;
// 전광 광고판에 차례로 뜨는 것: 구단 문구와 구단 공식 홈페이지에 실린 후원사 이름. [바탕, 글자, 문구, 글꼴]
// 글꼴: club 은 좁고 굵은 영문, brand 는 기기의 굵은 고딕
const ADS = [
  ['#00327D', '#FFC72C', 'ULSAN HD FC', 'club'], ['#FFFFFF', '#00205B', 'HD현대', 'brand'],
  ['#FFC72C', '#00205B', 'BIG CROWN', 'club'], ['#00205B', '#FFFFFF', 'HD현대일렉트릭', 'brand'],
  ['#00327D', '#FFFFFF', 'ULSAN HD FC', 'club'], ['#FFFFFF', '#00205B', 'HD현대중공업', 'brand'],
  ['#00205B', '#FFC72C', 'BIG CROWN', 'club'], ['#FFFFFF', '#00205B', 'HD현대건설기계', 'brand'],
];
const BOARD_FONT = {
  club: px => `700 ${px * 1.15}px 'Barlow Condensed', 'Arial Narrow', Impact, sans-serif`,
  brand: px => `800 ${px * 0.86}px 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`,
};

// 벽·지붕 그림 한 장에서 띠가 차지하는 세로 칸과 낱장이 차지하는 칸(px)
const AT = { wall: [0, 128], hall: [128, 192], rear: [192, 256], deck: [256, 384], track: [384, 416] };
const TILE = { plain: [8, 424, 56, 504], gate: [64, 416, 192, 512], lamp: [192, 416, 448, 512] };
const vOf = ([y0, y1], h = 512) => [1 - (y1 - 1.5) / h, 1 - (y0 + 1.5) / h];
const uvOf = ([x0, y0, x1, y1]) => [(x0 + 1.5) / 1024, 1 - (y1 - 1.5) / 512, (x1 - 1.5) / 1024, 1 - (y0 + 1.5) / 512];

const mod = (a, n) => ((a % n) + n) % n;

function texture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 씨앗이 정해진 난수: 무늬가 열 때마다 같게 나온다
function noise(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// 격자 난수를 부드럽게 이은 얼룩(-1..1). 가로 nx 칸, 세로 ny 칸마다 되풀이된다.
// 그림 한 장에 백만 번쯤 불리므로, 끝 칸에 첫 칸을 한 번 더 적어 두어 이웃 칸을 찾을 때 나머지 셈을 하지 않는다
function field(seed, nx, ny) {
  const r = noise(seed), w = nx + 1, lat = new Float32Array(w * (ny + 1));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) lat[j * w + i] = r() * 2 - 1;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) if (i === nx || j === ny) lat[j * w + i] = lat[j % ny * w + i % nx];
  return (x, y) => {
    x -= Math.floor(x / nx) * nx; y -= Math.floor(y / ny) * ny;
    const x0 = Math.min(x | 0, nx - 1), y0 = Math.min(y | 0, ny - 1), o = y0 * w + x0;
    const tx = (x - x0) * (x - x0) * (3 - 2 * (x - x0)), ty = (y - y0) * (y - y0) * (3 - 2 * (y - y0));
    const a = lat[o], b = lat[o + 1], c = lat[o + w], d = lat[o + w + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

// 잔디 결(가로세로 2m): 풀잎 길이로 번진 잔무늬를 크기별로 겹친다. 깎은 줄과 큰 얼룩은 그물의 꼭짓점 색이 맡는다
const grassTexture = () => texture(512, 512, g => {
  const img = g.createImageData(512, 512), d = img.data;
  const layers = [[1, 4, 0.45], [4, 8, 0.32], [16, 32, 0.28], [32, 32, 0.14]].map(([cx, cz, w], i) => [field(31 + i, 512 / cx, 512 / cz), cx, cz, w]);
  for (let y = 0, o = 0; y < 512; y++) for (let x = 0; x < 512; x++, o += 4) {
    let v = 0;
    for (const [f, cx, cz, w] of layers) v += w * f(x / cx, y / cz);
    d[o] = 80 * (1 + 0.22 * v); d[o + 1] = 138 * (1 + 0.14 * v); d[o + 2] = 72 * (1 + 0.26 * v); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});

// 선에 칠한 흰 페인트(길이 4m): 가장자리가 부드럽고 군데군데 닳아 잔디가 비친다
const paintTexture = () => texture(256, 32, g => {
  const img = g.createImageData(256, 32), d = img.data, wear = field(41, 32, 8), r = noise(42);
  for (let y = 0, o = 0; y < 32; y++) for (let x = 0; x < 256; x++, o += 4) {
    d[o] = d[o + 1] = d[o + 2] = 255;
    d[o + 3] = 255 * Math.min(1, (y + 0.5) / 3, (31.5 - y) / 3) * (0.84 + 0.16 * wear(x / 8, y / 4) - (r() < 0.07 ? 0.3 : 0));
  }
  g.putImageData(img, 0, 0);
});

// 관중 여덟 줄(가로 24m, 48자리). 뒷줄은 앞줄에 가려 위쪽만 보이므로 머리와 어깨를 칸 위쪽에 몰아 그린다.
// 12m 마다 두 자리 폭의 계단이 있고, 계단 옆 자리는 노란 의자다. 아래 두 줄은 빈자리가 많다
const crowdTexture = () => texture(2048, 512, g => {
  const r = noise(3), pick = list => list[Math.floor(r() * list.length)], cw = 2048 / 48, rh = 64;
  const hole = field(4, 12, 8), tribe = field(6, 8, 8);
  const SHIRTS = { blue: ['#1d5fd6', '#2a6ee6', '#0d3f9f', '#3b7af0', '#164fc0'], gold: ['#ffc72c', '#f5b81e', '#ffd75a'], white: ['#f4f6fb', '#e3e9f5', '#ffffff'], any: ['#22262e', '#8d98a8', '#c8372d', '#3f7d4e', '#e9e4d8', '#6b4a3a', '#d8d8de', '#2c3e6b', '#b96a8c'] };
  const SKIN = ['#f0c9a4', '#e2b48c', '#c98f66', '#f6d7b8'], HAIR = ['#17120f', '#241a14', '#0e0e12', '#3a2a1e'], CAPS = ['#1d5fd6', '#f4f6fb', '#ffc72c', '#0d3f9f'];
  // 위쪽 두 귀만 둥근 네모. 아래는 칸 밖으로 넘쳐, 다음 줄의 머리 뒤로 보이는 뒷사람의 몸이 된다
  const body = (x, y, w, k) => { g.beginPath(); g.moveTo(x, y + rh); g.lineTo(x, y + k); g.arcTo(x, y, x + k, y, k); g.arcTo(x + w, y, x + w, y + k, k); g.lineTo(x + w, y + rh); g.fill(); };
  g.fillStyle = '#0d1426'; g.fillRect(0, 0, 2048, 512);
  // 맨 윗줄의 머리 뒤에도 깔리도록 그림 밖의 한 줄부터 그린다
  for (let row = -1; row < 8; row++) {
    const y = row * rh;
    g.fillStyle = 'rgba(6,10,22,0.45)'; g.fillRect(0, y, 2048, 20);   // 머리 뒤로 보이는 사람들은 그늘져 있다
    for (let c = 0; c < 48; c++) {
      const x = c * cw, k = c % 24, mid = x + cw / 2;
      if (k < 2) {   // 계단: 디딤판 끝의 노란 띠와 그 아래 그늘
        g.fillStyle = '#9aa1ab'; g.fillRect(x, y, cw + 0.5, rh);
        g.fillStyle = '#f1c21b'; g.fillRect(x, y + 20, cw + 0.5, 5);
        g.fillStyle = 'rgba(8,12,24,0.42)'; g.fillRect(x, y + 25, cw + 0.5, rh - 25);
        continue;
      }
      g.fillStyle = k < 4 || k > 21 ? '#e9b92c' : '#184aae';
      body(x + 3, y + 19, cw - 6, 7);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 7, y + 22, cw - 14, 3);
      if (hole(c / 4, row) > (row < 6 ? 0.72 : 0.3) || r() < 0.03) continue;   // 빈자리는 몇 자리씩 뭉쳐 있다
      // 옷 색은 가까이 앉은 사람끼리 닮는다
      const t = tribe(c / 6, row), side = t > 0.5 ? 'gold' : t < -0.55 ? 'white' : 'blue';
      const lean = (r() - 0.5) * 5, drop = r() * 6, skin = pick(SKIN);
      g.fillStyle = pick(SHIRTS[r() < 0.72 ? side : 'any']);
      body(x + 1.5 + lean * 0.3, y + 22 + drop, cw - 3, 11);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath(); g.ellipse(mid + lean, y + 25 + drop, 7, 4, 0, 0, 7); g.fill();
      if (r() < 0.1) {   // 머리 위로 펼쳐 든 머플러
        g.fillStyle = skin; g.fillRect(x + 3, y + 4, 5, 24); g.fillRect(x + cw - 8, y + 4, 5, 24);
        g.fillStyle = '#ffc72c'; g.fillRect(x + 1, y + 1, cw - 2, 6);
        g.fillStyle = '#1d5fd6'; for (let i = 0; i < 3; i++) g.fillRect(x + 6 + i * 13, y + 1, 6, 6);
      }
      g.fillStyle = skin;
      g.beginPath(); g.ellipse(mid + lean, y + 14 + drop, 9, 11, 0, 0, 7); g.fill();
      g.fillStyle = r() < 0.3 ? pick(CAPS) : pick(HAIR);
      g.beginPath(); g.ellipse(mid + lean, y + 12 + drop, 9.7, 10.5, 0, Math.PI * 0.95, Math.PI * 2.05); g.fill();
    }
    // 아래로 갈수록 앞줄의 그늘이 진다
    const shade = g.createLinearGradient(0, y, 0, y + rh);
    shade.addColorStop(0.5, 'rgba(6,10,22,0)'); shade.addColorStop(1, 'rgba(6,10,22,0.45)');
    g.fillStyle = shade; g.fillRect(0, y, 2048, rh);
  }
});

// 전광판 두 줄(가로 48m): 위는 2층 앞을 한 바퀴 두른 띠, 아래는 경기장 가 광고판. 비스듬히 보이므로 글자는 가로로 넓게 쓴다
function drawBoards(g) {
  const w = 2048 / ADS.length;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const word = (kind, px, words, x, y, room) => {
    g.font = BOARD_FONT[kind](px);
    g.letterSpacing = kind === 'club' ? `${px * 0.06}px` : '0px';
    g.fillText(words, x, y, room);
  };
  ADS.forEach(([bg, fg, words, kind], i) => {
    g.fillStyle = bg; g.fillRect(i * w, 64, w, 64);
    // 후원사 칸: 글자 밑에 초록에서 파랑으로 넘어가는 가는 줄
    if (kind === 'brand') {
      const bar = g.createLinearGradient(i * w + 60, 0, i * w + w - 60, 0);
      bar.addColorStop(0, '#00A651'); bar.addColorStop(1, '#0072CE');
      g.fillStyle = bar; g.fillRect(i * w + 60, 116, w - 120, 4);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(i * w, 64, 2, 64);
    g.fillStyle = fg; word(kind, 40, words, i * w + w / 2, kind === 'brand' ? 93 : 98, w - 40);
  });
  const band = g.createLinearGradient(0, 0, 0, 64);
  band.addColorStop(0, '#0A3FA0'); band.addColorStop(1, '#062566');
  g.fillStyle = band; g.fillRect(0, 0, 2048, 64);
  g.fillStyle = '#FFC72C'; g.fillRect(0, 2, 2048, 3); g.fillRect(0, 59, 2048, 3);
  ADS.forEach(([, , words, kind], i) => { g.fillStyle = kind === 'club' ? '#FFC72C' : '#FFFFFF'; word(kind, 32, words, i * w + w / 2, 33, w - 50); });
  g.letterSpacing = '0px';
  // LED 알갱이
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < 2048; x += 4) g.fillRect(x, 0, 1, 128);
  for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 2048, 1);
}
const boardTexture = () => {
  const t = texture(2048, 128, drawBoards);
  // 영문 글꼴은 따로 받아 오는 것이라 처음 그릴 때 아직 없을 수 있다. 오면 한 번 다시 그린다
  if (document.fonts) document.fonts.load(BOARD_FONT.club(40)).then(() => { drawBoards(t.image.getContext('2d')); t.needsUpdate = true; }, () => {});
  return t;
};

// 벽과 지붕 그림 한 장. 띠는 가로 24m 로 되풀이된다
const atlasTexture = () => texture(1024, 512, g => {
  const r = noise(11), m = 1024 / 24;   // 1m 의 px
  const speck = ([y0, y1], n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${a})`; g.fillRect(r() * 1024, y0 + r() * (y1 - y0 - 2), 1 + r() * 4, 1 + r() * 2); } };
  g.textAlign = 'center'; g.textBaseline = 'middle';

  // 앞벽(높이 2m): 남색 벽에 흰 턱, 응원 걸개 셋, 통로 문 하나
  g.fillStyle = '#0c2a68'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#dfe5ee'; g.fillRect(0, 0, 1024, 8);
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 104, 1024, 24);
  for (const [at, wide, bg, fg, words] of [[1.2, 6.4, '#f4f7fb', '#0b3c9a', 'ULSAN HD FC'], [9.2, 3.4, '#ffc72c', '#0b3c9a', '1983'], [14, 6, '#0b49b8', '#ffc72c', 'VAMOS ULSAN']]) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(at * m + 3, 17, wide * m, 84);
    g.fillStyle = bg; g.fillRect(at * m, 13, wide * m, 84);
    g.fillStyle = fg; g.font = FONT(46); g.fillText(words, (at + wide / 2) * m, 58, wide * m - 20);
  }
  g.fillStyle = '#dfe5ee'; g.fillRect(21 * m - 5, 22, 2 * m + 10, 106);
  g.fillStyle = '#05070d'; g.fillRect(21 * m, 28, 2 * m, 100);
  speck(AT.wall, 500, 0.04);

  // 1층 뒤 통로: 어두운 안쪽에 기둥과 천장 등, 불 켜진 매점
  g.fillStyle = '#0a0f1c'; g.fillRect(0, 128, 1024, 64);
  g.fillStyle = 'rgba(255,226,170,0.55)'; g.fillRect(0, 133, 1024, 3);
  for (const at of [3, 9.5, 15, 20.5]) { g.fillStyle = '#f3c988'; g.fillRect(at * m, 146, 2.2 * m, 22); g.fillStyle = '#1d5fd6'; g.fillRect(at * m, 141, 2.2 * m, 5); }
  g.fillStyle = '#3d465a'; for (let at = 0; at < 24; at += 6) g.fillRect(at * m, 128, 0.55 * m, 64);

  // 2층 뒷벽: 남색 판과 창 한 줄
  g.fillStyle = '#12336f'; g.fillRect(0, 192, 1024, 64);
  g.fillStyle = '#7fa6d8'; g.fillRect(0, 204, 1024, 16);
  g.fillStyle = 'rgba(0,0,0,0.3)'; for (let at = 0; at < 24; at += 1.5) g.fillRect(at * m, 192, 2, 64);

  // 지붕 밑면: 밝은 판 사이로 빛이 비치는 줄, 길이 방향 도리, 판 이음매
  g.fillStyle = '#c3ccd9'; g.fillRect(0, 256, 1024, 128);
  g.fillStyle = '#e9eef5'; for (let y = 272; y < 384; y += 32) g.fillRect(0, y, 1024, 12);
  g.fillStyle = '#8894a8'; for (let y = 256; y < 384; y += 16) g.fillRect(0, y, 1024, 2);
  g.fillStyle = 'rgba(40,52,74,0.22)'; for (let at = 0; at < 24; at += 1.5) g.fillRect(at * m, 256, 1.5, 128);
  speck(AT.deck, 400, 0.03);

  // 트랙: 잔디 쪽 끝에 흰 줄, 광고판 밑에는 그늘
  g.fillStyle = '#5f6f8c'; g.fillRect(0, 384, 1024, 32);
  speck(AT.track, 900, 0.06);
  g.fillStyle = '#e8ecf2'; g.fillRect(0, 412, 1024, 2);
  g.fillStyle = 'rgba(10,14,24,0.35)'; g.fillRect(0, 405, 1024, 5);

  // 낱장: 색만 입히는 면에 쓰는 흰 칸, 관중석 통로 입구, 조명 묶음
  g.fillStyle = '#ffffff'; g.fillRect(0, 416, 64, 96);
  g.fillStyle = '#dfe5ee'; g.fillRect(64, 416, 128, 96);
  g.fillStyle = '#05070d'; g.fillRect(76, 428, 104, 84);
  g.fillStyle = 'rgba(255,214,150,0.3)'; g.fillRect(76, 428, 104, 6);
  g.fillStyle = '#1b1f27'; g.fillRect(192, 416, 256, 96);
  g.fillStyle = '#ffffff';
  for (let j = 0; j < 2; j++) for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(208 + i * 32, 440 + j * 48, 11, 0, 7); g.fill(); }
});

// 지붕 뼈대 한 틀(깊이 12.5m, 높이 6.25m): 뒤 기둥에서 앞 끝으로 갈수록 얇아지는 트러스. 흰 살만 있고 나머지는 비친다.
// 가는 살을 그물로 세우면 멀리서 깜빡이므로, 그림으로 그려 멀수록 흐려지게 한다
const TRUSS = { s: [21.5, 9], y: [16.2, 22.45] };
const trussTexture = () => texture(512, 256, g => {
  const k = 512 / (TRUSS.s[0] - TRUSS.s[1]), top = s => 20.5 + (21 - s) / 12, low = s => 18.9 + (21 - s) / 11.7 * 2.25;
  const beam = (s0, y0, s1, y1, w) => {
    g.lineWidth = w * k;
    g.beginPath(); g.moveTo((TRUSS.s[0] - s0) * k, (TRUSS.y[1] - y0) * k); g.lineTo((TRUSS.s[0] - s1) * k, (TRUSS.y[1] - y1) * k); g.stroke();
  };
  // 비치는 곳도 색은 희게 둔다: 줄어든 그림에서 살의 가장자리가 어두워지지 않는다
  g.fillStyle = 'rgba(255,255,255,0.004)'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  beam(20.7, 16.3, 20.7, 20.5, 0.34);
  beam(21, top(21), 9.3, top(9.3), 0.22); beam(21, low(21), 9.3, low(9.3), 0.22);
  for (let s = 21, i = 0; s > 9.5; s -= 2.34, i++) {
    beam(s, low(s), s, top(s), 0.13);
    beam(s, i % 2 ? top(s) : low(s), s - 2.34, i % 2 ? low(s - 2.34) : top(s - 2.34), 0.13);
  }
});

// 네모를 모으는 통: 꼭짓점마다 자리, 무늬 자리, 색, 빛 받는 쪽
const bin = () => ({ pos: [], uv: [], col: [], nor: [], idx: [] });
// c 는 밝기 하나나 [r, g, b]. n 을 주지 않으면 면이 향한 쪽으로 빛을 받는다
function quad(b, pts, [u0, v0, u1, v1], c = 1, n) {
  const i = b.pos.length / 3, rgb = c.length ? c : [c, c, c];
  if (!n) {   // 두 대각선에서 구한다: 한 변이 한 점으로 모인 세모꼴 네모에서도 값이 나온다
    const [p, q, r, s] = pts, ax = r[0] - p[0], ay = r[1] - p[1], az = r[2] - p[2], bx = s[0] - q[0], by = s[1] - q[1], bz = s[2] - q[2];
    const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx, len = Math.hypot(x, y, z) || 1;
    n = [x / len, y / len, z / len];
  }
  for (const p of pts) { b.pos.push(...p); b.col.push(...rgb); b.nor.push(...n); }
  b.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
  b.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
// from 에 든 것을 y 축으로 turn 만큼 돌려 (x, y, z) 로 옮긴 사본을 to 에 덧붙인다
function put(to, from, x, z, turn, y = 0) {
  const c = Math.cos(turn), s = Math.sin(turn), base = to.pos.length / 3;
  for (let i = 0; i < from.pos.length; i += 3) {
    to.pos.push(from.pos[i] * c + from.pos[i + 2] * s + x, from.pos[i + 1] + y, from.pos[i + 2] * c - from.pos[i] * s + z);
    to.nor.push(from.nor[i] * c + from.nor[i + 2] * s, from.nor[i + 1], from.nor[i + 2] * c - from.nor[i] * s);
  }
  for (const v of from.uv) to.uv.push(v);
  for (const v of from.col) to.col.push(v);
  for (const v of from.idx) to.idx.push(base + v);
  return to;
}
function geometry(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setIndex(b.idx);
  return g;
}

// 잔디: 길이 3m 인 칸의 그물. 6m 마다 가로로 깎은 줄이 번갈아 밝고 어둡고, 레인마다 세로 결이 아주 옅게 엇갈린다.
// 레인 경계에는 깎는 기계의 바퀴 자국처럼 가운데가 가장 어두운 가는 줄을 넣어, 다섯 레인이 한눈에 갈린다.
// 그 밖의 꼭짓점 색에는 칸보다 훨씬 큰 얼룩만 싣는다: 칸만 한 얼룩은 칸을 세모 둘로 나눈 금을 따라 줄이 선다
function groundGeometry() {
  const b = bin(), blot = field(21, 4, PERIOD / 8), SEAMS = [-2.25, -0.75, 0.75, 2.25];
  const xs = [-TURF, -5.25, -HALF, ...SEAMS.flatMap(x => [x - 0.08, x, x + 0.08]), HALF, 5.25, TURF];
  const tint = (x, z, k) => {
    const dry = Math.max(0, blot(x / 8, z / 8 + 5.5)) * 0.12;   // 군데군데 조금 마른 자리
    const shade = 1 - 0.2 * Math.max(0, (Math.abs(x) - 5.25) / (TURF - 5.25));   // 광고판 밑은 그늘져 어둡다
    const v = k * shade * (1 + 0.07 * blot(x / 8 + 2, z / 8)) * (SEAMS.includes(x) ? 0.76 : 1);
    return [v * (1 + dry), v, v * (1 - dry)];
  };
  for (let z = BACK; z > -END - PERIOD; z -= 3) for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1], z1 = z - 3;
    const k = (mod(Math.floor(z1 / 6), 2) ? 1 : 0.83) * (mod(Math.round((x0 + x1) / 2 / LANE_W), 2) ? 0.965 : 1);
    quad(b, [[x0, 0, z], [x1, 0, z], [x1, 0, z1], [x0, 0, z1]], [x0 / 2, z / 2, x1 / 2, z1 / 2]);
    b.col.splice(-12, 12, ...tint(x0, z, k), ...tint(x1, z, k), ...tint(x1, z1, k), ...tint(x0, z1, k));
  }
  return geometry(b);
}

// 흰 선: 터치라인과, PERIOD 마다 되풀이되는 중앙선·센터서클. 끝없이 이어지는 길이라 골라인과 벌칙 구역은 그리지 않는다
function linesGeometry() {
  const b = bin(), W = 0.14;
  const line = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), nx = (z1 - z0) / len * W / 2, nz = (x0 - x1) / len * W / 2;
    quad(b, [[x0 - nx, 0, z0 - nz], [x1 - nx, 0, z1 - nz], [x1 + nx, 0, z1 + nz], [x0 + nx, 0, z0 + nz]], [0, 0, len / 4, 1]);
  };
  // 가운데 (cx, cz), 반지름 r 인 원의 a0 ~ a1 구간. w 가 반지름의 두 배면 속이 찬 점이 된다
  const arc = (cx, cz, r, a0, a1, w = W) => {
    const n = Math.ceil((a1 - a0) * (3 + r * 4)), at = (a, k) => [cx + Math.cos(a) * k, 0, cz + Math.sin(a) * k];
    for (let i = 0; i < n; i++) {
      const p = a0 + (a1 - a0) * i / n, q = a0 + (a1 - a0) * (i + 1) / n;
      quad(b, [at(p, r - w / 2), at(q, r - w / 2), at(q, r + w / 2), at(p, r + w / 2)], [p * r / 4, 0, q * r / 4, 1]);
    }
  };
  const spot = z => arc(0, z, 0.055, 0, Math.PI * 2, 0.11);
  for (const x of [-HALF, HALF]) line(x, BACK, x, -END - PERIOD);
  for (let z = 0; z > -END - PERIOD; z -= PERIOD) {
    line(-HALF, z, HALF, z); arc(0, z, LANE_W * 1.5, 0, Math.PI * 2); spot(z);
  }
  return geometry(b);
}

// 관중석 한 채를 재질별 통에 담는다. 경기장 쪽(+z)을 보고 x 로 길게 뻗는다: 단면은 앞벽에서 뒤로 잰 깊이 s 와 높이 y 로 적는다.
// 같은 것을 돌려 왼쪽·오른쪽·골대 뒤에 세우므로 글자는 어디서나 바로 읽힌다
function standBins() {
  const solid = bin(), crowd = bin(), truss = bin(), led = bin(), glow = bin();
  const X0 = -BACK, X1 = X0 + LEN, PLAIN = uvOf(TILE.plain);
  const BLUE = [0.04, 0.16, 0.5], STEEL = [0.86, 0.89, 0.94];
  // 길이 방향으로 뻗은 띠: 단면의 (s0, y0) 에서 (s1, y1) 까지. 무늬는 per(m)마다 한 장
  const strip = (b, s0, y0, s1, y1, [v0, v1], c, per = 24, n) => quad(b, [[X0, y0, -s0], [X1, y0, -s0], [X1, y1, -s1], [X0, y1, -s1]], [X0 / per, v0, X1 / per, v1], c, n);
  const flat = (s0, y0, s1, y1, c) => quad(solid, [[X0, y0, -s0], [X1, y0, -s0], [X1, y1, -s1], [X0, y1, -s1]], PLAIN, c);

  strip(solid, -4.4, 0.02, 0, 0.02, vOf(AT.track), 1);            // 트랙
  strip(led, -3.4, 0, -3.4, 0.95, vOf([64, 128], 128), 1, 48);    // 경기장 가 광고판
  flat(-3.37, 0, -3.37, 0.95, 0.06);                              // 광고판 뒷면
  strip(solid, 0, 0, 0, 2, vOf(AT.wall), 1);                      // 앞벽
  flat(0, 2, 0.5, 2, 0.7);
  flat(-0.03, 2.5, -0.03, 2.56, STEEL);                           // 1층 앞 난간
  flat(0.5, 1.9, 9.9, 6.84, 0.04);                                // 1층 바닥(줄 사이로 비치는 곳)
  flat(9.9, 6.4, 11.5, 6.4, 0.16);
  strip(solid, 11.5, 6.4, 11.5, 8.6, vOf(AT.hall), 0.85);         // 1층 뒤 통로
  flat(11.5, 8.6, 8.6, 8.6, 0.13);                                // 2층이 내민 밑면
  flat(8.6, 8.6, 8.6, 10.1, [0.8, 0.84, 0.92]);                   // 2층 앞 띠
  strip(led, 8.57, 8.9, 8.57, 9.8, vOf([0, 64], 128), 1, 48);
  flat(8.57, 10.5, 8.57, 10.56, STEEL);                           // 2층 앞 난간
  flat(9, 9.95, 20.4, 17.65, 0.04);                               // 2층 바닥
  strip(solid, 20.4, 16.3, 20.4, 18.9, vOf(AT.rear), 0.7);        // 2층 뒷벽. 그 위로 지붕까지는 뚫려 하늘이 보인다
  // 지붕 밑면은 빛이 비쳐 드는 판이라 위에서 빛을 받는 것으로 친다. 아래를 향한 면으로 두면 잔디에서 되비친 빛에 초록으로 물든다
  strip(solid, 21.2, 20.58, 9, 21.6, vOf(AT.deck), 0.3, 24, [0, 1, 0]);
  flat(9, 21.5, 9, 22.4, 0.95);                                   // 지붕 앞 끝
  flat(8.98, 22.02, 8.98, 22.3, BLUE);

  // 관중: 한 줄에 띠 하나. 1층은 꽉 찬 줄만, 2층은 빈자리 많은 줄까지 쓴다. 2층 밑과 지붕 밑으로 들어갈수록 어둡다
  const rows = (n, s, t, rise, from, dim) => {
    for (let i = 0; i < n; i++) {
      const at = (from + i * 5 % 6) * 64;   // 무늬 여덟 줄 가운데 여섯 줄을 섞어 쓴다
      strip(crowd, s + i * STEP, t + i * rise + SEAT[0], s + i * STEP, t + i * rise + SEAT[1], vOf([at, at + 64]), dim(i), 24, FACING);
    }
  };
  rows(12, 0.6, 1.3, 0.42, 0, i => (i < 9 ? 1 : 0.9 - (i - 8) * 0.15));
  rows(14, 9.2, 9.4, 0.54, 2, i => 0.8 - i * 0.02);

  for (let x = X0 + 6.5; x < X1; x += 12) {   // 계단 위
    // 지붕 뼈대: 길을 가로지르는 면에 12m 마다 한 틀
    quad(truss, [[x, TRUSS.y[0], -TRUSS.s[0]], [x, TRUSS.y[0], -TRUSS.s[1]], [x, TRUSS.y[1], -TRUSS.s[1]], [x, TRUSS.y[1], -TRUSS.s[0]]], [0, 0, 1, 1]);
    // 지붕 앞 끝에 매단 조명 묶음: 꺼진 몸체 위에, 켜졌을 때의 밝은 면과 번짐을 더해 그린다. 색 자리에는 번짐의 반지름을 넣는다
    quad(solid, [[x - 1.8, 20.75, -9.35], [x + 1.8, 20.75, -9.35], [x + 1.8, 21.45, -8.95], [x - 1.8, 21.45, -8.95]], uvOf(TILE.lamp), 0.6, [0, 0, 1]);
    quad(glow, [[x - 1.8, 20.74, -9.33], [x + 1.8, 20.74, -9.33], [x + 1.8, 21.44, -8.93], [x - 1.8, 21.44, -8.93]], [0, 0, 0, 0], 0);
    quad(glow, Array(4).fill([x, 21.05, -8.6]), [-1, -1, 1, 1], 2.7);
  }
  // 관중석 가운데로 뚫린 통로 입구: 1층은 24m 마다, 2층은 그 사이에
  const gate = (x, s, y) => {
    const x0 = x - 1.2, x1 = x + 1.2, y1 = y + 2.3, s1 = s + 2.8;
    quad(solid, [[x0, y, -s], [x1, y, -s], [x1, y1, -s], [x0, y1, -s]], uvOf(TILE.gate));
    for (const at of [x0, x1]) quad(solid, [[at, y, -s], [at, y, -s1], [at, y1, -s1], [at, y1, -s]], PLAIN, 0.8);
    quad(solid, [[x0, y1, -s], [x1, y1, -s], [x1, y1, -s1], [x0, y1, -s1]], PLAIN, 0.85);
  };
  for (let x = X0 + 0.5; x < X1 - 12; x += 24) { gate(x, 3.65, 2.98); gate(x + 12, 11.45, 11.02); }   // 계단과 계단의 가운데

  return { solid, crowd, truss, led, glow };
}

export function create(ctx) {
  // 비스듬히 보이는 무늬가 뭉개지지 않을 만큼만. 더 올리면 느린 기기에서 화면 채우는 값이 눈에 띄게 는다
  const aniso = Math.min(4, ctx.renderer.capabilities.getMaxAnisotropy());
  const map = make => { const t = make(); t.anisotropy = aniso; return t; };
  const moving = new THREE.Group();
  ctx.scene.add(moving);

  const ground = new THREE.Mesh(groundGeometry(), new THREE.MeshLambertMaterial({ map: map(grassTexture), vertexColors: true }));
  ground.receiveShadow = true;
  // 실제 잔디 사진과 그 결의 높낮이(노멀) 그림이 오면 바꿔 끼운다. 오기 전과 못 받았을 때는 위의 그린 잔디로 둔다
  const photo = (file, srgb, done) => new THREE.TextureLoader().load(new URL(`../../img/turf/${file}`, import.meta.url).href, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    done(t);
  });
  photo('grass.jpg', true, t => { ground.material.map = t; });
  photo('grass-normal.jpg', false, t => { ground.material.normalMap = t; ground.material.normalScale.set(0.6, 0.6); ground.material.needsUpdate = true; });
  // 선은 잔디와 같은 높이에 깔고 깊이만 앞당겨 겹쳐 떨리지 않게 한다. 발밑 그림자보다 먼저 그려야 그림자가 선 위에도 진다
  const lines = new THREE.Mesh(linesGeometry(), new THREE.MeshLambertMaterial({
    map: map(paintTexture), color: '#eef2ea', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  lines.receiveShadow = true; lines.renderOrder = -1;
  moving.add(ground, lines);

  const mats = {
    solid: new THREE.MeshLambertMaterial({ map: map(atlasTexture), vertexColors: true, side: THREE.DoubleSide }),
    crowd: new THREE.MeshLambertMaterial({ map: map(crowdTexture), vertexColors: true }),
    // 뼈대는 어느 쪽에서 봐도 보여야 한다. 비치는 양면 재질을 두 번에 나눠 그리지 않게 한다
    truss: new THREE.MeshBasicMaterial({ map: map(trussTexture), side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthWrite: false }),
    led: new THREE.MeshBasicMaterial({ map: map(boardTexture) }),
    // 조명의 밝은 면과 번짐을 더해 그린다. 번짐은 늘 카메라를 마주 보는 네모이고 가운데가 밝다
    glow: new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color() } }, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec2 p; void main() { p = uv; vec4 at = modelViewMatrix * vec4(position, 1.0); at.xy += uv * color.r; gl_Position = projectionMatrix * at; }',
      fragmentShader: 'uniform vec3 tint; varying vec2 p; void main() { float g = max(0.0, 1.0 - length(p)); gl_FragColor = vec4(tint * (g * g * 0.45 + pow(g, 7.0)), 1.0); }',
    }),
  };
  // 왼쪽과 오른쪽 관중석은 한 그물로 묶어 경기장과 함께 흘려보내고, 앞뒤 골대 뒤 관중석은 늘 같은 거리에 세워 둔다.
  // 골대 뒤에서는 지붕 뼈대가 옆으로 누워 보이지 않으므로 넣지 않는다
  const stand = standBins(), [v0, v1] = vOf([64, 128], 128), rear = -END - 20.4, glows = [];
  const add = (parent, name, b) => {
    const mesh = new THREE.Mesh(geometry(b), mats[name]);
    mesh.frustumCulled = false;
    if (name === 'glow') glows.push(mesh);
    parent.add(mesh);
  };
  for (const name in stand) add(moving, name, put(put(bin(), stand[name], -WALL_X, 0, Math.PI / 2), stand[name], WALL_X, BACK * 2 - LEN, -Math.PI / 2));
  for (const name of ['solid', 'crowd', 'led', 'glow']) {
    // 모퉁이에서 옆 관중석의 트랙과 같은 높이로 겹쳐 떨리지 않게 1cm 띄운다
    const b = put(put(bin(), stand[name], BACK - LEN / 2, -END, 0, 0.01), stand[name], LEN / 2 - BACK, BACK - 24, Math.PI, 0.01);
    // 옆 관중석은 PERIOD 만큼 더 길어 앞뒤 관중석 너머로 나와 있다. 뒷벽과 지붕 사이를 막아 그 틈으로 비치지 않게 한다
    if (name === 'solid') for (const [z, d] of [[rear, LEN / 2], [BACK - 24 + 20.4, -LEN / 2]]) quad(b, [[-d, 18.9, z], [d, 18.9, z], [d, 20.66, z], [-d, 20.66, z]], uvOf(TILE.plain), [0.03, 0.1, 0.3]);
    // 골대 뒤 2층 위의 전광판: 광고판 그림의 첫 칸을 크게 띄운다
    if (name === 'led') quad(b, [[-6.5, 17, rear + 0.1], [6.5, 17, rear + 0.1], [6.5, 20.4, rear + 0.1], [-6.5, 20.4, rear + 0.1]], [0.004, v0, 1 / ADS.length - 0.004, v1]);
    add(ctx.scene, name, b);
  }

  let time = null;
  return {
    reset() {},
    update(run, alpha) {
      moving.position.z = mod(run.pdist + (run.dist - run.pdist) * alpha, PERIOD);
      if (time === ctx.time) return;
      time = ctx.time;
      mats.truss.color.copy(time.roof);
      mats.led.color.setScalar(1 + 0.35 * time.lamps);
      mats.glow.uniforms.tint.value.setRGB(1, 0.96, 0.86).multiplyScalar(time.lamps);
      for (const g of glows) g.visible = time.lamps > 0.01;
    },
    onEvent() {},
  };
}
