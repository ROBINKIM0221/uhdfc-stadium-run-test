import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLAYERS, byNo, START_PLAYER } from '../js/data/players.js';
import { FACE_COLORS } from '../js/data/face-colors.js';
import { KITS, GK_KITS, kitById, START_KITS, opponentKits } from '../js/data/kits.js';
import { mulberry32 } from '../js/sim/rng.js';

const HEX = /^#[0-9a-f]{6}$/i;
const root = new URL('..', import.meta.url);

test('선수는 33명이고 번호가 겹치지 않는다', () => {
  assert.equal(PLAYERS.length, 33);
  assert.equal(new Set(PLAYERS.map(p => p.no)).size, 33);
  const count = pos => PLAYERS.filter(p => p.pos === pos).length;
  assert.deepEqual([count('FW'), count('MF'), count('DF'), count('GK')], [5, 11, 11, 6]);
  assert.equal(byNo(START_PLAYER).name, '이동경');
});

test('선수마다 얼굴 사진 둘과 피부색·머리색이 있다', () => {
  for (const p of PLAYERS) {
    for (const f of [`img/face/${p.no}.png`, `img/head/${p.no}.png`, `img/card/${p.no}.jpg`]) assert.ok(fs.existsSync(new URL(f, root)), f);
    assert.match(FACE_COLORS[p.no].skin, HEX);
    assert.match(FACE_COLORS[p.no].hair, HEX);
  }
});

test('달리는 데 쓰는 얼굴 사진은 다 합쳐 600KB 를 넘지 않는다', () => {
  const total = PLAYERS.reduce((s, p) => s + fs.statSync(new URL(`img/face/${p.no}.png`, root)).size, 0);
  assert.ok(total <= 600 * 1024, `${Math.round(total / 1024)}KB`);
});

test('유니폼은 필드 5벌, 골키퍼 4벌', () => {
  assert.equal(KITS.length, 5);
  assert.equal(GK_KITS.length, 4);
  for (const k of [...KITS, ...GK_KITS]) for (const key of ['jersey', 'trim', 'number', 'shorts', 'sock', 'boot']) assert.match(k[key], HEX, `${k.id}.${key}`);
  for (const k of KITS) assert.ok(['dark', 'light'].includes(k.tone), k.id);
  assert.deepEqual(START_KITS, ['home', 'gk26h']);
  assert.equal(kitById('retro').stripe, '#0B1D63');
});

test('막는 쪽은 내 유니폼과 다른 계열을 입는다', () => {
  const rnd = mulberry32(3);
  for (let i = 0; i < 50; i++) {
    for (const mine of KITS) assert.notEqual(opponentKits(mine.id, rnd).field.tone, mine.tone);
    for (const mine of GK_KITS) {
      const o = opponentKits(mine.id, rnd);
      assert.equal(o.field.id, 'home');
      assert.notEqual(o.gk.id, mine.id);
    }
    assert.ok(GK_KITS.includes(opponentKits('home', rnd).gk));
  }
});
