// 유니폼 등 마킹. 위에서부터 ULSAN 패치(있는 유니폼만), 이름, 등번호, 스폰서. 배치와 비율은 2026 유니폼 사진과 구단 마킹 그림을 따른다.
// 등번호: 숫자 안에 유니폼마다 다른 무늬, 셔츠 색의 가는 안쪽 선, 번호 색의 바깥 테두리, 숫자마다 아래쪽에 작은 엠블럼.
// 그림은 몸의 등(쉬는 자세 x -16..16cm, y 92..152cm)에 펼쳐 붙는다. 붙이는 셰이더는 player-model.js 의 kitMaterial 이다.
import * as THREE from './three.js';
import { lift } from './rig.js';

export const PRINT = { half: 16, y0: 92, y1: 152 };
const PX = 8, W = PRINT.half * 2 * PX, H = (PRINT.y1 - PRINT.y0) * PX;   // 1cm = 8픽셀
const cm = n => n * PX;
const BOLD = 0.35 * PX;   // 등번호 획을 글꼴보다 한쪽에 이만큼 두껍게(구단 마킹의 굵기)
const cy = y => (PRINT.y1 - y) * PX;                                     // 몸 높이(cm) → 그림의 세로 자리
const NAME = s => `900 ${s}px 'Gothic A1', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;
const DIGIT = s => `700 ${s}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;   // 폭이 좁고 세로로 긴 숫자
const EMBLEM = new URL('../../img/emblem.png', import.meta.url).href;

let ready = null, done = false, emblem = null;   // 글꼴 둘과 엠블럼 그림을 다 받으면 끝나는 약속
function load() {
  if (!ready) {
    const img = new Image();
    img.src = EMBLEM;
    ready = Promise.allSettled([document.fonts.load(NAME(40), '가'), document.fonts.load(DIGIT(40), '0'), img.decode().then(() => { emblem = img; })]).then(() => { done = true; });
  }
  return ready;
}

// 숫자 안의 무늬: 어두운 번호는 밝게, 밝은 번호는 어둡게 결을 낸다
function pattern(g, kind, ink) {
  const c = new THREE.Color(ink), light = c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.5;
  g.strokeStyle = `#${c.clone().lerp(new THREE.Color(light ? '#000' : '#fff'), light ? 0.16 : 0.2).getHexString()}`;
  g.lineCap = 'round';
  g.globalAlpha = 0.6;
  if (kind === 'wave') {          // 밤바다의 물결: 겹겹이 흐르는 등고선
    g.lineWidth = 2;
    for (let k = -10; k < 60; k++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 6) g.lineTo(x, k * 9 + 7 * Math.sin(x / 23 + k * 0.6) + 4 * Math.sin(x / 9 - k));
      g.stroke();
    }
  } else if (kind === 'industry') {   // 공업 도시: 크레인과 철골의 곧은 선
    g.lineWidth = 2;
    for (let x = 4; x < W; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 10; y < H; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + 8); g.stroke(); }
    for (let x = -H; x < W; x += 40) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H * 0.6, 0); g.stroke(); }
  } else {                         // 호랑이 무늬: 끝이 가는 비스듬한 줄
    for (let k = -8; k < 30; k++) {
      const y = k * 26 + (k % 2) * 9, t = 3 + (k % 3);
      g.lineWidth = t;
      g.beginPath(); g.moveTo(-10, y + 40); g.bezierCurveTo(W * 0.25, y - 14 + (k % 4) * 6, W * 0.6, y + 46, W + 10, y - 10); g.stroke();
    }
  }
  g.globalAlpha = 1;
}

function paint(c, layer, kit, no, name) {
  const g = c.getContext('2d'), ink = kit.number, back = lift(kit.jersey);
  g.clearRect(0, 0, W, H);
  g.textAlign = 'center';

  // ULSAN 패치: 번호 색 판에 셔츠 색 글자
  if (kit.patch) {
    const w = cm(9), h = cm(3), x = (W - w) / 2, y = cy(149.5);
    g.fillStyle = ink; g.beginPath(); g.roundRect(x, y, w, h, cm(0.4)); g.fill();
    g.fillStyle = back;
    g.fillRect(x + cm(0.5), y + cm(0.5), cm(2), cm(2));
    g.fillStyle = ink; g.font = NAME(cm(1.6)); g.textBaseline = 'middle'; g.fillText('U', x + cm(1.5), y + cm(1.55));
    g.fillStyle = back; g.textAlign = 'left';
    g.font = NAME(cm(1.35)); g.fillText('ULSAN', x + cm(3), y + cm(1.15), cm(5.6));
    g.font = NAME(cm(0.62)); g.fillText('THE RISING CITY', x + cm(3), y + cm(2.3), cm(5.6));
    g.textAlign = 'center';
  }

  // 이름: 굵은 고딕을 한 번 더 굵게, 글자 사이는 조금만 띄운다
  if (name) {
    let size = cm(6.2);
    g.font = NAME(size);
    const chars = [...name], gap = () => size * 0.14, width = () => chars.reduce((s, ch) => s + g.measureText(ch).width, 0) + gap() * (chars.length - 1);
    if (width() > cm(24)) { size *= cm(24) / width(); g.font = NAME(size); }
    let x = (W - width()) / 2;
    g.fillStyle = g.strokeStyle = ink; g.lineWidth = size * 0.06; g.lineJoin = 'round'; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (const ch of chars) { g.fillText(ch, x, cy(139.5)); g.strokeText(ch, x, cy(139.5)); x += g.measureText(ch).width + gap(); }
    g.textAlign = 'center';
  }

  // 등번호: 숫자 높이 24cm. 구단 마킹처럼 숫자 하나의 폭이 높이의 0.4배쯤 되게 옆으로 좁힌다.
  // 숫자와 무늬·엠블럼을 따로 그린 뒤 테두리 위에 얹는다
  const digits = no === '' ? [] : [...String(no)];
  if (digits.length) {
    const l = layer.getContext('2d'), base = cy(109), tall = cm(24);
    g.font = DIGIT(100);
    const m = g.measureText('0');
    const size = tall / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * 100;
    g.font = l.font = DIGIT(size);
    const space = size * 0.04, ws = digits.map(d => g.measureText(d).width), total = ws.reduce((a, b) => a + b, 0) + space * (digits.length - 1);
    const squeeze = Math.min(1, tall * 0.4 * digits.length / total), sx = x => W / 2 + (x - W / 2) * squeeze;
    const xs = [];
    let x = (W - total) / 2;
    for (const w of ws) { xs.push(x + w / 2); x += w + space; }
    const narrow = c => c.setTransform(squeeze, 0, 0, 1, W / 2 * (1 - squeeze), 0);
    l.clearRect(0, 0, W, H);
    l.globalCompositeOperation = 'source-over';
    l.textAlign = 'center'; l.textBaseline = 'alphabetic'; l.fillStyle = ink;
    // 글꼴보다 획을 BOLD 만큼 두껍게: 같은 색 선을 둘레에 한 번 더 긋는다
    l.lineJoin = 'round'; l.strokeStyle = ink; l.lineWidth = BOLD * 2;
    narrow(l);
    digits.forEach((d, i) => { l.fillText(d, xs[i], base); l.strokeText(d, xs[i], base); });
    l.resetTransform();
    l.globalCompositeOperation = 'source-atop';
    pattern(l, kit.mark, ink);
    if (emblem) { const e = cm(1.7); digits.forEach((d, i) => l.drawImage(emblem, sx(xs[i]) - e / 2, base - size * 0.07 - e / 2, e, e)); }
    l.globalCompositeOperation = 'source-over';
    g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    narrow(g);
    g.strokeStyle = ink; g.lineWidth = BOLD * 2 + cm(1.7); digits.forEach((d, i) => g.strokeText(d, xs[i], base));
    g.strokeStyle = back; g.lineWidth = BOLD * 2 + cm(0.85); digits.forEach((d, i) => g.strokeText(d, xs[i], base));
    g.resetTransform();
    g.drawImage(layer, 0, 0);
  }

  // 등 아래 스폰서: 화살 모양 HD 표시 뒤에 글자. 글자가 'HD' 뿐이면 크게 로고처럼
  if (kit.back) {
    const logo = kit.back === 'HD', size = cm(logo ? 4.2 : 2.9), y = cy(logo ? 103 : 102);
    g.font = NAME(size); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = ink;
    const mark = size * 0.78, gap = size * 0.18, width = Math.min(cm(22), mark + gap + g.measureText(kit.back).width);
    const x = (W - width) / 2, h = size * 0.72;
    g.beginPath();   // 앞을 향한 화살: 뒤가 파인 세모
    g.moveTo(x, y - h / 2); g.lineTo(x + mark, y); g.lineTo(x, y + h / 2); g.lineTo(x + mark * 0.32, y); g.closePath(); g.fill();
    g.fillText(kit.back, x + mark + gap, y + size * 0.04, width - mark - gap);
    g.textAlign = 'center';
  }
}

// 선수 한 명의 등 그림. draw 를 부르면 다시 그리고, 글꼴이 늦게 오면 그 뒤에 한 번 더 그린다
export function backPrint() {
  const c = document.createElement('canvas'), layer = document.createElement('canvas');
  c.width = layer.width = W; c.height = layer.height = H;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  let last = null;
  const draw = (kit, no, name) => {
    last = [kit, no, name];
    paint(c, layer, kit, no, name);
    texture.needsUpdate = true;
    if (!done) load().then(() => { if (last && last[0] === kit && last[1] === no && last[2] === name) { paint(c, layer, kit, no, name); texture.needsUpdate = true; } });
  };
  return { texture, draw };
}
