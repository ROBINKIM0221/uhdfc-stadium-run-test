// 한 화면을 여러 시점에 멈춰 찍어 한 장에 모아 붙인다(동작 확인용).
//   node tools/sheet.cjs <주소> <png> --eval "틱이나 u 를 받는 함수" --at a,b,c [--cols 4] [--crop x,y,w,h] [--size 390x844]
// 예: --eval "t => __dbg.stepTo(t)" --at 100,200,300      --eval "u => __lab.at(u)" --at 0,0.25,0.5,0.75
// 모은 그림은 폭 1900px 을 넘지 않게 줄인다.
const fs = require('node:fs');
const { parse, open } = require('./shot.cjs');

const MAX_WIDTH = 1900;

async function main() {
  const { rest: [url, out], opt } = parse(process.argv.slice(2));
  if (!url || !out || !opt.eval || !opt.at) throw new Error('쓰는 법: node tools/sheet.cjs <주소> <png> --eval "v => ..." --at a,b,c [--cols 4] [--crop x,y,w,h]');
  const { browser, page } = await open(url, opt.size);
  const size = page.viewportSize();
  const [x, y, width, height] = opt.crop ? opt.crop.split(',').map(Number) : [0, 0, size.width, size.height];
  const at = opt.at.split(',').map(Number), shots = [];
  for (const v of at) {
    await page.evaluate(`(${opt.eval})(${v})`);
    await page.waitForTimeout(80);
    shots.push((await page.screenshot({ clip: { x, y, width, height } })).toString('base64'));
  }

  // 빈 화면의 캔버스에 칸칸이 그려 넣는다
  const board = await browser.newPage();
  const data = await board.evaluate(async ({ shots, at, cols, w, h, max }) => {
    const k = Math.min(1, max / (cols * w)), cw = Math.round(w * k), ch = Math.round(h * k);
    const c = document.createElement('canvas');
    c.width = cw * cols; c.height = ch * Math.ceil(shots.length / cols);
    const g = c.getContext('2d');
    g.font = '15px sans-serif'; g.textBaseline = 'top';
    for (const [i, b64] of shots.entries()) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const px = (i % cols) * cw, py = Math.floor(i / cols) * ch, label = String(at[i]);
      g.drawImage(img, px, py, cw, ch);
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(px, py + ch - 22, g.measureText(label).width + 12, 22);
      g.fillStyle = '#fff'; g.fillText(label, px + 6, py + ch - 18);
    }
    return c.toDataURL('image/png');
  }, { shots, at, cols: Number(opt.cols || 4), w: width, h: height, max: MAX_WIDTH });
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  await browser.close();
}

main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
