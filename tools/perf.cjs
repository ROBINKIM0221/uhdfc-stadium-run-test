// 이 컴퓨터의 그래픽 장치로 실제 시간 20초를 달려 초당 장수를 잰다. 자동 조종이 키를 눌러 준다.
//   node tools/perf.cjs [주소=http://localhost:5173/] [크기=390x844] [배율=2] [단계=auto|low|mid|high]
// 폰의 성능을 대신 재 주지는 않는다. 눈에 띄게 느린 곳을 찾는 데 쓴다.
const { chromium } = require('./pw.cjs');

(async () => {
  const [url = 'http://localhost:5173/', size = '390x844', scale = '2', q = 'auto'] = process.argv.slice(2);
  const [width, height] = size.split('x').map(Number);
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(scale) });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.addInitScript(() => localStorage.setItem('uhd-dribble-run', JSON.stringify({ seen: { hint: true }, sound: false })));
  await page.goto(`${url}?debug=1&seed=7${q === 'auto' ? '' : '&q=' + q}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(async () => {
    const gl = document.createElement('canvas').getContext('webgl'), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?';
    const { pilotCmds } = await import('/test/helpers/autopilot.js');
    const KEY = { L: 'ArrowLeft', R: 'ArrowRight', U: 'ArrowUp' };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    const gaps = [], calls = [];
    let last = performance.now();
    const t0 = last;
    await new Promise(done => {
      const loop = now => {
        gaps.push(now - last); last = now;
        const run = window.__dbg.run;
        if (run.alive) for (const c of pilotCmds(run)) window.dispatchEvent(new KeyboardEvent('keydown', { key: KEY[c], code: KEY[c], bubbles: true }));
        calls.push(window.__dbg.view.info().calls);
        if (now - t0 > 20000 || !run.alive) done(); else requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    gaps.sort((a, b) => a - b);
    const run = window.__dbg.run, info = window.__dbg.view.info();
    return { gpu, sec: (performance.now() - t0) / 1000, frames: gaps.length, fps: gaps.length / ((performance.now() - t0) / 1000), p50: gaps[gaps.length >> 1], p95: gaps[Math.floor(gaps.length * 0.95)], worst: gaps.at(-1), dist: run.dist, alive: run.alive, quality: info.quality, callsMax: Math.max(...calls) };
  });
  console.log(`${size} 배율 ${scale} 단계 ${q} → ${out.quality}`);
  console.log(`  장치: ${out.gpu}`);
  console.log(`  ${out.sec.toFixed(1)}초에 ${out.frames}장 = 초당 ${out.fps.toFixed(1)}장 | 한 장 중간 ${out.p50.toFixed(1)}ms, 95% ${out.p95.toFixed(1)}ms, 가장 긴 것 ${out.worst.toFixed(0)}ms`);
  console.log(`  달린 거리 ${out.dist.toFixed(0)}m${out.alive ? '' : ' (도중에 끝남)'} | 그리기 최대 ${out.callsMax}번`);
  await browser.close();
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
