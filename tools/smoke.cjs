// 실제 시간으로 한 바퀴 돌려 본다: 첫 화면 → 달리기 → 멈춤 → 그만하기 → 달리기 → 끝 → 다시 → 처음으로 → 선수·유니폼 열기.
// 화면 오류가 하나라도 나오면 실패로 끝난다.
//   node tools/smoke.cjs [주소=http://localhost:5173/] [크기=390x844]
const { chromium } = require('./pw.cjs');

(async () => {
  const url = process.argv[2] || 'http://localhost:5173/', [width, height] = (process.argv[3] || '390x844').split('x').map(Number);
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const mode = () => page.evaluate(() => document.getElementById('ui').dataset.screen);
  const check = (ok, what) => { console.log((ok ? '✔ ' : '✖ ') + what); if (!ok) process.exitCode = 1; };

  // 코인을 넉넉히 넣어 두고 연다(뽑기까지 보려고)
  await page.addInitScript(() => localStorage.setItem('uhd-dribble-run', JSON.stringify({ v: 1, coins: 250, best: 0, players: [10], kits: ['home', 'gk26h'], player: 10, kit: 'home', gkKit: 'gk26h', sound: true, seen: { hint: true } })));
  await page.goto(url + '?debug=1&seed=7', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  check(await mode() === 'home', '첫 화면이 뜬다');

  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  check(await mode() === 'run', '시작하면 달린다');
  const d0 = await page.evaluate(() => window.__dbg.run.dist);
  for (const key of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowLeft']) { await page.keyboard.press(key); await page.waitForTimeout(350); }
  const d1 = await page.evaluate(() => window.__dbg.run.dist);
  check(d1 > d0 + 5, `달리는 동안 거리가 는다 (${d0.toFixed(0)} → ${d1.toFixed(0)}m)`);

  // 손가락(포인터)으로 미는 입력도 먹는다
  const moves0 = await page.evaluate(() => window.__dbg.run.moves);
  await page.mouse.move(width / 2, height * 0.6); await page.mouse.down(); await page.mouse.move(width / 2 + width * 0.2, height * 0.6, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(350);
  check(await page.evaluate(() => window.__dbg.run.moves) === moves0 + 1, '밀면 옆 레인으로 간다');

  // 멈췄다가 그만두면 첫 화면으로 가고, 다시 시작할 수 있다
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await mode() === 'pause', '달리다 멈출 수 있다');
  await page.getByText('그만하기', { exact: true }).click();
  await page.waitForTimeout(600);
  check(await mode() === 'home', '그만하면 첫 화면으로 간다');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);

  // 아무것도 누르지 않으면 곧 부딪힌다
  await page.waitForFunction(() => document.getElementById('ui').dataset.screen === 'over', null, { timeout: 60000 });
  check(true, '부딪히면 결과가 뜬다');
  await page.waitForTimeout(900);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  check(await mode() === 'run', '다시를 누르면 바로 달린다');
  await page.waitForFunction(() => document.getElementById('ui').dataset.screen === 'over', null, { timeout: 60000 });
  await page.waitForTimeout(900);

  const tap = async text => { await page.getByText(text, { exact: true }).first().click(); await page.waitForTimeout(700); };
  await tap('처음으로');
  check(await mode() === 'home', '처음으로 돌아간다');
  const info = await page.evaluate(() => window.__dbg.view.info());
  console.log('  그리기', JSON.stringify(info));
  for (const name of ['선수', '유니폼']) { await tap(name); await tap('닫기'); }
  check(true, '선수·유니폼 목록이 열리고 닫힌다');

  check(errors.length === 0, `화면 오류 없음${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
  await browser.close();
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
