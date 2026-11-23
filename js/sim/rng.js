// 씨앗 난수. 규칙 계산은 Math.random 대신 이것만 쓴다.

// 상태({ s })를 들고 다니는 꼴. 판의 상태에 넣어 두면 판을 통째로 저장하고 견줄 수 있다
export function rand(st) {
  st.s = (st.s + 0x6D2B79F5) >>> 0;
  let t = st.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function mulberry32(seed) {
  const st = { s: seed >>> 0 };
  return () => rand(st);
}

// 두 정수를 섞어 새 씨앗을 만든다
export function hash2(a, b) {
  let h = (Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x7F4A7C15, 0xC2B2AE35)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7FEB352D) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846CA68B) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
