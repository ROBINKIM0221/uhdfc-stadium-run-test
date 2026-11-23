// 화면을 헤드리스 크롬으로 열어 한 장 찍는다.
//   node tools/shot.cjs <주소> <png> [--size 390x844] [--wait ms] [--eval "js"]
// --eval 은 열린 뒤 화면 안에서 돌리는 식이고, 값이 있으면 JSON 으로 찍어 준다. --wait 는 그 뒤 찍기 전에 기다리는 시간.
const { chromium } = require('./pw.cjs');

function parse(argv) {
  const rest = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
    else rest.push(argv[i]);
  }
  return { rest, opt };
}

// 주소를 열고 준비가 끝난 페이지를 준다. sheet.cjs 도 같이 쓴다
async function open(url, size = '390x844') {
  const [width, height] = size.split('x').map(Number);
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  return { browser, page };
}

async function main() {
  const { rest: [url, out], opt } = parse(process.argv.slice(2));
  if (!url || !out) throw new Error('쓰는 법: node tools/shot.cjs <주소> <png> [--size 390x844] [--wait ms] [--eval "js"]');
  const { browser, page } = await open(url, opt.size);
  if (opt.eval) {
    const value = await page.evaluate(opt.eval);
    if (value !== undefined) console.log(JSON.stringify(value));
  }
  await page.waitForTimeout(Number(opt.wait || 300));
  await page.screenshot({ path: out });
  await browser.close();
}

module.exports = { parse, open };
if (require.main === module) main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
