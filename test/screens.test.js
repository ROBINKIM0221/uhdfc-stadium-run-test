import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt, drawNote, wornKit, listOf, shirtSvg } from '../js/ui/screens.js';
import { kitById } from '../js/data/kits.js';

test('숫자는 세 자리마다 쉼표를 찍는다', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(999), '999');
  assert.equal(fmt(1234), '1,234');
  assert.equal(fmt(1234567), '1,234,567');
});

test('뽑기 버튼의 작은 글: 모자라면 몇 개 더, 되면 값', () => {
  assert.equal(drawNote(0), '300개 더');
  assert.equal(drawNote(299), '1개 더');
  assert.equal(drawNote(300), '코인 300');
  assert.equal(drawNote(2500), '코인 300');
});

test('뽑을 것이 남지 않았으면 코인과 상관없이 다 모았다고 적는다', () => {
  assert.equal(drawNote(0, 0), '다 모았어요');
  assert.equal(drawNote(5000, 0), '다 모았어요');
  assert.equal(drawNote(299, 3), '1개 더');
  assert.equal(drawNote(300, 3), '코인 300');
});

test('골키퍼는 골키퍼 유니폼을, 나머지는 필드 유니폼을 입는다', () => {
  const state = { player: 10, kit: 'away', gkKit: 'gk25h' };
  assert.equal(wornKit(state), 'away');
  assert.equal(wornKit({ ...state, player: 21 }), 'gk25h');
});

test('뽑은 것이 선수면 선수 목록으로, 유니폼이면 유니폼 목록으로 간다', () => {
  assert.equal(listOf({ type: 'player', id: 9 }), 'players');
  assert.equal(listOf({ type: 'kit', id: 'away' }), 'kits');
  assert.equal(listOf({ type: 'kit', id: 'gk25a' }), 'kits');
});

test('셔츠 그림은 유니폼의 색을 쓰고, 세로 줄무늬는 있는 유니폼에만 긋는다', () => {
  const home = shirtSvg(kitById('home')), retro = shirtSvg(kitById('retro'));
  assert.match(home, /^<svg[^>]* viewBox="0 0 100 100"/);
  assert.ok(home.includes('#004098') && home.includes('#FFC72C'));
  assert.ok(!home.includes('clip-path'));
  assert.ok(retro.includes('#2B2A8A') && retro.includes('#0B1D63') && retro.includes('clip-path'));
});
