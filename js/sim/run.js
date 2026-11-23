// 한 판의 규칙 계산. 1/60초씩 나아가고, 같은 씨앗과 같은 입력이면 같은 결과가 나온다.
import {
  RULES_VERSION, TICK, LANES, laneX, MOVE_TICKS, JUMP_TICKS, JUMP_H, SPEED0, speedAt, HIT_DX, HIT_DZ, LOW_CLEAR, BEHIND,
  BEAT_DIST, BOOST_TICKS, BOOST_MULT, BOOST_REACH, BALL_SPEED, GRACE_TICKS, RUSH_SPEED, COIN_DX, COIN_DZ, COIN_DY, BODY_MID,
} from './constants.js';
import { tickObject, boxOf, isPickup } from './objects.js';
import { createTrack, extendTrack } from './track.js';

export function createRun(seed) {
  return {
    v: RULES_VERSION, seed: seed >>> 0, tick: 0, alive: true,
    dist: 0, pdist: 0, speed: SPEED0,
    lane: 2, x: 0, px: 0, move: null, queued: null, moves: 0,
    air: 0, y: 0, py: 0,
    coins: 0, beats: 0, boost: 0,
    objs: [], track: createTrack(seed), log: [],
  };
}

const smooth = u => u * u * (3 - 2 * u);

// 떠나는 레인 코앞에 서 있는 선수가 있으면 표시해 둔다. 살아서 지나치면 제친 것이 된다
function markBeat(run, lane) {
  if (run.boost > 0) return;
  for (const o of run.objs) {
    const rel = o.d - run.dist;
    if (isPickup(o) || rel <= 0 || rel > BEAT_DIST) continue;
    const box = boxOf(o);
    if (box && !box.low && Math.abs(box.x - laneX(lane)) < HIT_DX) o.beat = true;
  }
}

function startMove(run, cmd, ev) {
  const dir = cmd === 'L' ? -1 : 1, to = run.lane + dir;
  if (to < 0 || to >= LANES) { ev.push({ type: 'bump', dir }); return; }
  markBeat(run, run.lane);
  run.move = { from: run.lane, to, t: 0 };
  run.lane = to;
  ev.push({ type: 'move', dir, index: run.moves++ });
}

function startJump(run, ev) {
  run.air = JUMP_TICKS;
  ev.push({ type: 'jump' });
}

// 땅에서 옆으로 가는 중이거나 이미 떠 있을 때 온 입력은 하나만 기억한다
function command(run, cmd, ev) {
  if (cmd === 'U') {
    if (run.air > 0 || run.move) run.queued = 'U'; else startJump(run, ev);
  } else if (run.move) run.queued = cmd;
  else startMove(run, cmd, ev);
}

function runQueued(run, ev) {
  if (!run.queued) return;
  const q = run.queued;
  if (q === 'U' ? run.air > 0 || run.move : run.move) return;
  run.queued = null;
  command(run, q, ev);
}

function advanceMove(run, ev) {
  const m = run.move;
  if (!m) return;
  m.t++;
  if (m.t >= MOVE_TICKS) { run.x = laneX(m.to); run.move = null; runQueued(run, ev); }
  else run.x = laneX(m.from) + (laneX(m.to) - laneX(m.from)) * smooth(m.t / MOVE_TICKS);
}

function advanceJump(run, ev) {
  if (run.air === 0) return;
  run.air--;
  const u = 1 - run.air / JUMP_TICKS;
  run.y = run.air === 0 ? 0 : JUMP_H * 4 * u * (1 - u);
  if (run.air === 0) { ev.push({ type: 'land' }); runQueued(run, ev); }
}

function knock(o, ev) {
  o.down = true;
  ev.push({ type: 'knock', id: o.id });
}

// 아이템: 차 낸 공이 앞의 선수들을 가까운 차례로 쓰러뜨린다
function startBoost(run, item, ev) {
  run.boost = BOOST_TICKS;
  ev.push({ type: 'item', id: item.id });
  for (const o of run.objs) {
    const rel = o.d - run.dist;
    if (isPickup(o) || o.down || rel <= 0 || rel > BOOST_REACH) continue;
    o.knockAt = run.tick + Math.round(rel / BALL_SPEED / TICK);
  }
}

// 아이템이 끝나는 틱: 1초 안에 닿을 선수는 미리 쓰러뜨려 앞을 비운다
function endBoost(run, speed, ev) {
  ev.push({ type: 'boostEnd' });
  const zone = (speed + RUSH_SPEED) * GRACE_TICKS * TICK * 1.2;
  for (const o of run.objs) {
    const rel = o.d - run.dist;
    if (!isPickup(o) && !o.down && rel > 0 && rel <= zone) knock(o, ev);
  }
}

// 길 위의 것들을 움직이고, 줍고, 몸 상자가 겹치면 판을 끝낸다. 지나친 것은 지운다
function advanceObjects(run, ev) {
  let keep = 0, item = null;
  for (const o of run.objs) {
    const pickup = isPickup(o);
    if (!pickup) {
      tickObject(o, run);
      if (!o.down && o.knockAt !== undefined && run.tick >= o.knockAt) knock(o, ev);
    }
    const rel = o.d - run.dist;
    if (rel < -BEHIND) continue;
    if (pickup) {
      const near = Math.abs(rel) < COIN_DZ && Math.abs(run.x - o.x) < COIN_DX;
      if (near && o.kind === 'item') { item = o; continue; }
      if (near && Math.abs(run.y + BODY_MID - o.h) < COIN_DY) { run.coins++; ev.push({ type: 'coin', id: o.id }); continue; }
      run.objs[keep++] = o;
      continue;
    }
    run.objs[keep++] = o;
    if (o.beat && rel < -HIT_DZ) { o.beat = false; if (run.alive) { run.beats++; ev.push({ type: 'beat', id: o.id }); } }
    if (!run.alive || Math.abs(rel) >= HIT_DZ) continue;
    const box = boxOf(o);
    if (!box || Math.abs(run.x - box.x) >= box.halfW || (box.low && run.y > LOW_CLEAR)) continue;
    if (run.boost > 0) knock(o, ev);
    else { run.alive = false; ev.push({ type: 'hit', id: o.id }); }
  }
  run.objs.length = keep;
  if (item) startBoost(run, item, ev);
}

// cmds: 이 틱에 들어온 입력('L' | 'R' | 'U'). 첫 것만 먹는다. 일어난 일을 이벤트로 돌려준다
export function step(run, cmds = []) {
  const ev = [];
  if (!run.alive) return ev;
  run.px = run.x; run.py = run.y; run.pdist = run.dist;
  if (cmds.length) { run.log.push([run.tick, cmds[0]]); command(run, cmds[0], ev); }
  advanceMove(run, ev);
  advanceJump(run, ev);
  const base = speedAt(run.dist);
  if (run.boost > 0 && --run.boost === 0) endBoost(run, base, ev);
  run.speed = base * (run.boost > 0 ? BOOST_MULT : 1);
  run.dist += run.speed * TICK;
  if (run.track) extendTrack(run);
  advanceObjects(run, ev);
  run.tick++;
  return ev;
}

// 씨앗과 입력 기록([[틱, 명령], ...])으로 판을 다시 돌린다. 끝나거나 maxTicks 에 닿으면 멈춘다
export function replay(seed, log, maxTicks = 60 * 60 * 30) {
  const run = createRun(seed);
  let i = 0;
  while (run.alive && run.tick < maxTicks) {
    while (i < log.length && log[i][0] < run.tick) i++;
    step(run, i < log.length && log[i][0] === run.tick ? [log[i][1]] : []);
  }
  return { dist: run.dist, coins: run.coins, tick: run.tick, alive: run.alive };
}
