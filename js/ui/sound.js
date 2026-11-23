// 효과음. 소리 파일 없이 Web Audio 로 합성한다.
// 브라우저는 첫 손길 전에는 소리를 막으므로 unlock() 을 첫 탭에서 부른다.

const VOLUME = 0.9;

// 한 음: 주파수가 f0 에서 f1 로 미끄러지며 dur 초 동안 사라진다
function tone(c, out, t, { type = 'sine', f0, f1 = f0, dur, gain }) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

// 걸러 낸 잡음: 바람, 타격, 함성에 쓴다. peak 초에 가장 크고 dur 초에 사라진다
function noise(c, out, t, buffer, { filter = 'bandpass', f0, f1 = f0, q = 1, dur, gain, peak = 0.01, loop = false }) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buffer; s.loop = loop;
  f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (loop) g.gain.value = gain;
  else {
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + peak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  s.connect(f).connect(g).connect(out);
  s.start(t);
  if (!loop) s.stop(t + dur + 0.02);
  return s;
}

const RECIPES = {
  touch: (c, o, t) => tone(c, o, t, { f0: 150, f1: 70, dur: 0.07, gain: 0.22 }),
  skill: (c, o, t, n) => noise(c, o, t, n, { f0: 500, f1: 2600, q: 1.4, dur: 0.2, gain: 0.16, peak: 0.06 }),
  jump: (c, o, t) => tone(c, o, t, { type: 'triangle', f0: 300, f1: 660, dur: 0.16, gain: 0.16 }),
  coin: (c, o, t) => { tone(c, o, t, { type: 'triangle', f0: 1320, dur: 0.06, gain: 0.13 }); tone(c, o, t + 0.05, { type: 'triangle', f0: 1760, dur: 0.12, gain: 0.13 }); },
  item: (c, o, t) => [523, 659, 784, 1047].forEach((f, i) => tone(c, o, t + i * 0.07, { type: 'triangle', f0: f, dur: 0.16, gain: 0.17 })),
  kick: (c, o, t, n) => { tone(c, o, t, { f0: 190, f1: 45, dur: 0.16, gain: 0.55 }); noise(c, o, t, n, { filter: 'highpass', f0: 1800, dur: 0.05, gain: 0.25 }); },
  knock: (c, o, t, n) => { tone(c, o, t, { f0: 120, f1: 55, dur: 0.13, gain: 0.34 }); noise(c, o, t, n, { filter: 'lowpass', f0: 900, dur: 0.09, gain: 0.2 }); },
  beat: (c, o, t, n) => noise(c, o, t, n, { f0: 700, f1: 1100, q: 0.5, dur: 1.0, gain: 0.3, peak: 0.25 }),
  hit: (c, o, t) => { RECIPES.whistle(c, o, t); tone(c, o, t + 0.28, { type: 'sawtooth', f0: 300, f1: 170, dur: 0.45, gain: 0.1 }); },
  whistle: (c, o, t) => { tone(c, o, t, { f0: 2500, f1: 2380, dur: 0.24, gain: 0.16 }); tone(c, o, t, { f0: 2590, f1: 2460, dur: 0.24, gain: 0.08 }); },
};

export const SOUNDS = [...Object.keys(RECIPES), 'crowd'];

// AC: AudioContext 생성자. 없으면 아무 소리도 내지 않는다
export function createSound(AC = globalThis.AudioContext || globalThis.webkitAudioContext) {
  let ctx = null, master = null, hiss = null, crowd = null, on = true;

  function ready() {
    if (!AC) return false;
    if (!ctx) {
      // iOS 는 기본 설정에서 무음 스위치가 켜져 있으면 Web Audio 를 통째로 끈다
      try { if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'playback'; } catch { /* 지원하지 않는 브라우저 */ }
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = on ? VOLUME : 0; master.connect(ctx.destination);
      hiss = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = hiss.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    // 화면 기록이나 전화로 끊긴 뒤에는 suspended 가 아니라 interrupted 로 남는다
    if (ctx.state !== 'running') ctx.resume();
    return true;
  }

  return {
    get on() { return on; },
    // 꺼져 있는 동안에는 소리 장치를 만들지 않는다. 만들기만 해도 기기에서 듣던 음악이 끊길 수 있다
    unlock() { if (on) ready(); },
    setOn(v) { on = v; if (v) ready(); if (master) master.gain.value = v ? VOLUME : 0; },
    play(name) {
      if (!on || !(name in RECIPES || name === 'crowd') || !ready()) return;
      if (name !== 'crowd') RECIPES[name](ctx, master, ctx.currentTime, hiss);
      else if (!crowd) crowd = noise(ctx, master, ctx.currentTime, hiss, { filter: 'lowpass', f0: 650, q: 0.3, gain: 0.05, loop: true });
    },
  };
}
