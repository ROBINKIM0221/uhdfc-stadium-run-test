import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../js/ui/input.js';

globalThis.innerWidth = 400;   // 밀기 문턱은 폭의 6% = 24px

// 이벤트를 손으로 넣어 볼 수 있는 가짜 대상
function rig() {
  const on = {}, cmds = [];
  let taps = 0;
  const target = { addEventListener: (t, f) => { on[t] = f; }, removeEventListener: t => { delete on[t]; } };
  const unbind = bindInput(target, c => cmds.push(c), () => taps++);
  const ptr = (type, id, x, y = 300) => on[type]({ pointerId: id, clientX: x, clientY: y });
  return { cmds, taps: () => taps, ptr, key: e => on.keydown(e), on, unbind };
}

test('문턱을 넘는 순간 한 번만 명령이 나간다', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 100);
  r.ptr('pointermove', 1, 120);
  assert.deepEqual(r.cmds, []);
  r.ptr('pointermove', 1, 126);
  r.ptr('pointermove', 1, 180);
  r.ptr('pointerup', 1, 180);
  assert.deepEqual(r.cmds, ['R']);
  assert.equal(r.taps(), 0);
});

test('왼쪽과 위로 밀기', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 200, 300); r.ptr('pointermove', 1, 170, 305); r.ptr('pointerup', 1, 170, 305);
  r.ptr('pointerdown', 1, 200, 300); r.ptr('pointermove', 1, 205, 260); r.ptr('pointerup', 1, 205, 260);
  r.ptr('pointerdown', 1, 200, 300); r.ptr('pointermove', 1, 205, 340); r.ptr('pointerup', 1, 205, 340);
  assert.deepEqual(r.cmds, ['L', 'U']);
});

test('밀지 않고 떼면 탭이다', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 100); r.ptr('pointermove', 1, 104); r.ptr('pointerup', 1, 104);
  assert.equal(r.taps(), 1);
  assert.deepEqual(r.cmds, []);
});

test('둘째 손가락이 닿아도 첫 손가락의 자리가 바뀌지 않는다', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 100);
  r.ptr('pointerdown', 2, 300);
  r.ptr('pointermove', 1, 101);
  assert.deepEqual(r.cmds, []);
  r.ptr('pointermove', 2, 360);
  assert.deepEqual(r.cmds, [], '둘째 손가락은 첫 손가락이 떨어질 때까지 세지 않는다');
});

test('다른 손가락을 떼도 밀던 손가락의 입력이 남는다', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 100);
  r.ptr('pointerdown', 2, 300);
  r.ptr('pointerup', 2, 300);
  r.ptr('pointermove', 1, 130);
  assert.deepEqual(r.cmds, ['R']);
  assert.equal(r.taps(), 0);
});

test('첫 손가락을 뗀 뒤에는 다음 손가락을 받는다', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 100); r.ptr('pointermove', 1, 60); r.ptr('pointerup', 1, 60);
  r.ptr('pointerdown', 2, 300); r.ptr('pointermove', 2, 340); r.ptr('pointerup', 2, 340);
  assert.deepEqual(r.cmds, ['L', 'R']);
});

test('키는 글자가 아니라 자리로 읽는다(한글 입력 상태에서도 된다)', () => {
  const r = rig();
  r.key({ code: 'KeyA', key: 'ㅁ' }); r.key({ code: 'KeyD', key: 'ㅇ' }); r.key({ code: 'KeyW', key: 'ㅈ' });
  r.key({ code: 'ArrowLeft', key: 'ArrowLeft' }); r.key({ code: 'ArrowRight', key: 'ArrowRight' }); r.key({ code: 'ArrowUp', key: 'ArrowUp' });
  assert.deepEqual(r.cmds, ['L', 'R', 'U', 'L', 'R', 'U']);
});

test('Enter 와 스페이스는 탭, 누르고 있는 키의 되풀이는 무시한다', () => {
  const r = rig();
  r.key({ code: 'Enter', key: 'Enter' }); r.key({ code: 'Space', key: ' ' });
  r.key({ code: 'ArrowLeft', key: 'ArrowLeft', repeat: true });
  assert.equal(r.taps(), 2);
  assert.deepEqual(r.cmds, []);
});

test('그만 듣기', () => {
  const r = rig();
  r.unbind();
  assert.deepEqual(Object.keys(r.on), []);
});
