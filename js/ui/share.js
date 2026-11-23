// 기록 그림. 거리와 선수 사진을 한 장에 그려 기기의 공유 창으로 보내고, 공유 창이 없으면 내려받는다.

const W = 1080, H = 1350;
const UI = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const NUM = "Teko, 'Barlow Condensed', 'Arial Narrow', sans-serif";
const TITLE = "'Barlow Condensed', Teko, 'Arial Narrow', sans-serif";
const GOLD = '#FFC72C', NAVY = '#072A66';

// 못 받은 사진은 null. 그림은 사진 없이도 나온다
function image(src) {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img, () => null);
}

// 캔버스는 아직 받지 않은 글꼴을 기다려 주지 않는다. 미리 받아 두되 CDN 이 늦으면 기본 글꼴로 그린다
const fonts = words => Promise.race([
  Promise.all([document.fonts.load('600 100px Teko'), document.fonts.load("700 100px 'Barlow Condensed'"), document.fonts.load("900 100px 'Pretendard Variable'", words)]).catch(() => {}),
  new Promise(done => setTimeout(done, 1500)),
]);

// 여러 조각을 한 줄로 이어 가운데에 놓는다. parts: [[글, 글꼴, 색], ...]
function line(g, y, gap, parts) {
  const widths = parts.map(([text, font]) => { g.font = font; return g.measureText(text).width; });
  let x = (W - widths.reduce((a, b) => a + b, gap * (parts.length - 1))) / 2;
  parts.forEach(([text, font, color], i) => {
    g.font = font; g.fillStyle = color;
    g.fillText(text, x, y);
    x += widths[i] + gap;
  });
}

// { dist: 달린 거리(m), player: { no, name } } → PNG 파일
export async function makeShareFile({ dist, player }) {
  const [emblem, photo] = await Promise.all([image('img/emblem.png'), image(`img/card/${player.no}.jpg`), fonts(player.name)]);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, NAVY); sky.addColorStop(1, '#004098');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // 사진 뒤를 가로지르는 금색 띠
  g.fillStyle = GOLD;
  g.fillRect(0, 470, W, 170);

  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  if (emblem) g.drawImage(emblem, 70, 62, 100, 100 * emblem.height / emblem.width);
  g.font = `600 60px ${NUM}`; g.fillStyle = GOLD; g.fillText('UHDFC', 200, 112);
  g.font = `700 92px ${TITLE}`; g.fillStyle = '#fff'; g.fillText('STADIUM RUN', 198, 196);

  // 선수 사진: 흰 테를 두른 동그라미
  const R = 262, cx = W / 2, cy = 545;
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(cx, cy, R + 14, 0, 7); g.fill();
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  g.fillStyle = '#0B3F9A'; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  if (photo) g.drawImage(photo, cx - R, cy - R, R * 2, R * 2);
  g.restore();

  line(g, 920, 22, [[String(player.no), `600 104px ${NUM}`, GOLD], [player.name, `800 68px ${UI}`, '#fff']]);
  line(g, 1255, 26, [[dist.toLocaleString('en-US'), `600 360px ${NUM}`, GOLD], ['m', `600 150px ${NUM}`, '#fff']]);

  const blob = await new Promise(done => c.toBlob(done, 'image/png'));
  return new File([blob], 'uhdfc-stadium-run.png', { type: 'image/png' });
}

export async function sendShare(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try { return await navigator.share({ files: [file], title: 'UHDFC Stadium Run' }); }
    catch (e) { if (e.name === 'AbortError') return; }   // 공유 창을 닫은 것. 그 밖의 실패는 내려받기로 넘긴다
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
