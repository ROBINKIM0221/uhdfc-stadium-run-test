import test from 'node:test';
import assert from 'node:assert/strict';
import { createSound, SOUNDS } from '../js/ui/sound.js';

// 만들어진 노드와 시작된 소리만 세는 가짜 AudioContext
function fakeAudio(state = 'running') {
  const log = { started: 0, loops: 0, resumed: 0, contexts: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = extra => ({ connect(to) { return to; }, disconnect() {}, ...extra });
  const source = () => node({ frequency: param(), detune: param(), type: 'sine', buffer: null, loop: false, start() { log.started++; if (this.loop) log.loops++; }, stop() {} });
  class AC {
    constructor() { log.contexts++; this.state = state; this.currentTime = 1; this.sampleRate = 8000; this.destination = node({}); }
    createGain() { return node({ gain: param() }); }
    createOscillator() { return source(); }
    createBufferSource() { return source(); }
    createBiquadFilter() { return node({ frequency: param(), Q: param(), type: 'lowpass' }); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    resume() { log.resumed++; this.state = 'running'; return Promise.resolve(); }
  }
  return { AC, log };
}

test('소리를 낼 수 없는 곳에서도 조용히 넘어간다', () => {
  const s = createSound(null);
  assert.doesNotThrow(() => { s.unlock(); s.play('coin'); s.setOn(false); s.setOn(true); });
  assert.equal(s.on, true);
});

test('이름마다 소리가 난다', () => {
  assert.deepEqual([...SOUNDS].sort(), ['beat', 'coin', 'crowd', 'hit', 'item', 'jump', 'kick', 'knock', 'skill', 'touch', 'whistle']);
  for (const name of SOUNDS) {
    const { AC, log } = fakeAudio(), s = createSound(AC);
    s.play(name);
    assert.ok(log.started >= 1, name);
  }
});

test('모르는 이름은 무시한다', () => {
  const { AC, log } = fakeAudio(), s = createSound(AC);
  assert.doesNotThrow(() => s.play('없는 소리'));
  assert.equal(log.started, 0);
});

test('끄면 소리가 나지 않고 켜면 다시 난다', () => {
  const { AC, log } = fakeAudio(), s = createSound(AC);
  s.setOn(false);
  s.play('coin');
  assert.equal(log.started, 0);
  assert.equal(s.on, false);
  s.setOn(true);
  s.play('coin');
  assert.ok(log.started >= 1);
});

test('멈춰 있는 소리 장치는 다시 깨운다', () => {
  for (const state of ['suspended', 'interrupted']) {
    const { AC, log } = fakeAudio(state), s = createSound(AC);
    s.unlock();
    assert.equal(log.resumed, 1, state);
  }
});

test('꺼져 있으면 소리 장치를 만들지 않고, 켜는 순간 만든다', () => {
  const { AC, log } = fakeAudio(), s = createSound(AC);
  s.setOn(false);
  s.unlock();
  s.play('coin');
  assert.equal(log.contexts, 0);
  s.setOn(true);
  assert.equal(log.contexts, 1);
});

test('관중 소리는 한 번만 깔린다', () => {
  const { AC, log } = fakeAudio(), s = createSound(AC);
  s.play('crowd'); s.play('crowd');
  assert.equal(log.loops, 1);
  assert.equal(log.contexts, 1);
});
