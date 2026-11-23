import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/render/three.js';
import { lift, tint } from '../js/render/rig.js';
import { cast } from '../js/render/defenders.js';
import { PLAYERS, byNo } from '../js/data/players.js';
import { KITS, GK_KITS, kitById } from '../js/data/kits.js';
import { mulberry32 } from '../js/sim/rng.js';

const hsl = hex => new THREE.Color(hex).getHSL({}, THREE.SRGBColorSpace);

test('어두운 옷 색은 색상을 지킨 채 밝아지고, 밝은 색은 그대로다', () => {
  for (const hex of ['#FFFFFF', '#CFD4DC', '#C8DD35', '#F2B13D', '#FFC72C']) assert.equal(lift(hex), hex);
  for (const hex of ['#004098', '#16213A', '#2B2A8A', '#0B1D63', '#002B6B', '#7A1230']) {
    const a = hsl(hex), b = hsl(lift(hex));
    assert.ok(b.l > a.l + 0.02, `${hex} 가 밝아진다`);
    assert.ok(Math.abs(b.h - a.h) < 0.01, `${hex} 의 색상이 그대로다`);
  }
});

test('밝혀도 유니폼끼리의 밝기 차례는 바뀌지 않는다', () => {
  const dark = ['#16213A', '#0B1D63', '#002B6B', '#004098', '#2B2A8A'].sort((a, b) => hsl(a).l - hsl(b).l);
  const lit = dark.map(lift);
  for (let i = 1; i < lit.length; i++) assert.ok(hsl(lit[i]).l >= hsl(lit[i - 1]).l);
});

test('몸에 칠하는 색: 옷감만 밝히고 등번호·줄 색은 그대로 둔다', () => {
  const fourth = kitById('fourth'), c = tint({ kit: fourth, skin: '#aa8866', hair: '#111111' });
  assert.equal(c.number, fourth.number);
  assert.equal(c.trim, fourth.trim);
  assert.equal(c.jersey, fourth.jersey);
  assert.notEqual(c.shorts, fourth.shorts);
  assert.equal(c.skin, '#aa8866');
  assert.equal(tint({ kit: kitById('home') }).stripe, undefined);
  assert.equal(tint({ kit: kitById('retro') }).stripe, lift('#0B1D63'));
  for (const kit of [...KITS, ...GK_KITS]) for (const key of ['jersey', 'shorts', 'sock']) assert.match(tint({ kit })[key], /^#[0-9a-f]{6}$/i);
});

test('막는 쪽으로 나올 선수: 내 선수는 빠지고, 골키퍼는 골키퍼끼리 모인다', () => {
  for (const hero of [10, 21, 9]) {
    const who = cast(hero, mulberry32(hero));
    assert.ok(!who.field.includes(hero) && !who.gk.includes(hero));
    assert.ok(who.field.every(no => byNo(no).pos !== 'GK'));
    assert.ok(who.gk.every(no => byNo(no).pos === 'GK'));
    assert.equal(who.field.length + who.gk.length, PLAYERS.length - 1);
    assert.equal(new Set([...who.field, ...who.gk]).size, PLAYERS.length - 1);
  }
});

test('막는 선수의 차례는 판마다 섞인다', () => {
  const a = cast(10, mulberry32(1)), b = cast(10, mulberry32(2));
  assert.notDeepEqual(a.field, b.field);
  assert.deepEqual(cast(10, mulberry32(1)), a);
});
