// 사람을 흉내 낸 자동 조종으로 여러 판을 돌려 달린 거리의 분포를 본다. 난이도 숫자를 맞출 때 쓴다.
//   node tools/balance.mjs [판 수=400]
// 흉내 내는 것: 줄을 보고 반응하기까지의 시간, 가끔 하는 실수, 낮은 것을 넘을지 피할지.
import { createRun, step } from '../js/sim/run.js';
import { boxOf, isPickup } from '../js/sim/objects.js';
import { laneX, LANES, TICK } from '../js/sim/constants.js';
import { mulberry32 } from '../js/sim/rng.js';

const PROFILES = {
  초보: { react: 0.50, jitter: 0.12, miss: 0.10, see: 1.4, jump: 0.3 },
  보통: { react: 0.34, jitter: 0.08, miss: 0.04, see: 1.6, jump: 0.6 },
  고수: { react: 0.25, jitter: 0.05, miss: 0.015, see: 1.8, jump: 0.8 },
};

// 가장 가까운 줄(앞뒤 1.5m 안에 모인 것들)과 그 줄에서 막힌 레인. low 는 넘을 수 있는 것만 막은 레인
function nextRow(run) {
  const ahead = run.objs.filter(o => !isPickup(o) && !o.down && o.d - run.dist > 0.6).sort((a, b) => a.d - b.d);
  if (!ahead.length) return null;
  const row = ahead.filter(o => o.d - ahead[0].d < 1.5), high = new Set(), low = new Set();
  for (const o of row) {
    // 오가는 수비수는 오가는 범위 전체를 막힌 것으로 본다
    if (o.kind === 'shift') { for (let l = Math.min(o.a, o.b); l <= Math.max(o.a, o.b); l++) high.add(l); continue; }
    // 골키퍼가 날아가는 중이면 누울 자리를 본다
    const box = o.kind === 'keeper' && o.state === 'fly' ? { x: laneX(o.lane + 1.5 * o.side), halfW: 1.08, low: true } : boxOf(o);
    for (let l = 0; l < LANES; l++) if (box && Math.abs(laneX(l) - box.x) < box.halfW) (box.low ? low : high).add(l);
  }
  return { id: row[0].id, rel: ahead[0].d - run.dist, high, low, key: [...high].join() + '|' + [...low].join() };
}

function play(seed, p) {
  const run = createRun(seed), r = mulberry32(seed * 7919 + 13);
  let plan = null, cause = null;   // plan: { key, at(틱), target, jump }
  while (run.alive && run.tick < 60 * 60 * 20) {
    const row = nextRow(run), cmds = [];
    if (row && row.rel < run.speed * p.see) {
      // 줄을 처음 봤거나 줄 모양이 바뀌면(움직이는 수비수, 몸을 날린 골키퍼) 반응 시간 뒤에 다시 정한다
      if (!plan || plan.key !== row.key) {
        const free = l => !row.high.has(l) && !row.low.has(l);
        let target = run.lane, jump = false;
        if (r() < p.miss) target = Math.max(0, Math.min(LANES - 1, run.lane + (r() < 0.5 ? -1 : 1)));
        else if (row.high.has(run.lane) || row.low.has(run.lane)) {
          if (row.low.has(run.lane) && !row.high.has(run.lane) && r() < p.jump) jump = true;
          else for (let k = 1; k < LANES; k++) { const c = [run.lane - k, run.lane + k].filter(l => l >= 0 && l < LANES && free(l)); if (c.length) { target = c[Math.floor(r() * c.length)]; break; } }
        }
        plan = { key: row.key, at: run.tick + Math.round((p.react + (r() - 0.5) * 2 * p.jitter) / TICK), target, jump };
      }
      if (run.tick >= plan.at) {
        if (plan.jump) { if (row.rel < run.speed * 0.28 && run.air === 0) cmds.push('U'); }
        else if (!run.move && run.lane !== plan.target) cmds.push(run.lane < plan.target ? 'R' : 'L');
      }
    }
    for (const e of step(run, cmds)) if (e.type === 'hit') cause = run.objs.find(o => o.id === e.id)?.kind ?? '?';
  }
  return { dist: run.dist, sec: run.tick * TICK, coins: run.coins, cause };
}

const N = Number(process.argv[2]) || 400;
const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
for (const [name, p] of Object.entries(PROFILES)) {
  const runs = Array.from({ length: N }, (_, i) => play(i + 1, p)), d = runs.map(x => x.dist).sort((a, b) => a - b);
  const causes = {};
  for (const x of runs) causes[x.cause] = (causes[x.cause] || 0) + 1;
  const avg = k => Math.round(runs.reduce((s, x) => s + x[k], 0) / N);
  console.log(`${name}: 거리 25%=${Math.round(q(d, 0.25))} 중간=${Math.round(q(d, 0.5))} 75%=${Math.round(q(d, 0.75))} 90%=${Math.round(q(d, 0.9))} | 100m 못 감 ${Math.round(d.filter(v => v < 100).length / N * 100)}% 1000m 넘김 ${Math.round(d.filter(v => v >= 1000).length / N * 100)}% | 평균 ${avg('sec')}초 코인 ${avg('coins')}개 | 끝난 까닭 ${JSON.stringify(causes)}`);
}
