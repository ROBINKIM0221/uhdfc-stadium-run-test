// 밀기와 키보드를 명령으로 바꾼다.

const SWIPE = 0.06;   // 화면 폭의 이만큼 움직인 순간 밀기로 친다. 손가락을 뗄 때까지 기다리지 않는다
// 키는 찍히는 글자가 아니라 자리(code)로 읽는다. 한글 입력 상태에서도 A·D·W 가 먹는다
const KEYS = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U' };
const TAPS = ['Enter', 'NumpadEnter', 'Space'];

// onCmd('L' | 'R' | 'U'): 옆으로·위로. onTap(): 밀지 않고 뗀 손길, 또는 Enter·스페이스.
// 돌려주는 함수를 부르면 듣기를 그만둔다
export function bindInput(target, onCmd, onTap) {
  // 먼저 닿은 손가락 하나만 따라간다. 두 엄지로 할 때 다른 손가락이 자리를 덮어쓰거나 지우지 않는다
  let finger = null;   // { id, x, y, moved }: 한 번 밀면 moved 가 서서 한 손길에 명령 하나만 나간다

  const down = e => { if (!finger) finger = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; };
  const move = e => {
    if (!finger || e.pointerId !== finger.id || finger.moved) return;
    const dx = e.clientX - finger.x, dy = e.clientY - finger.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < innerWidth * SWIPE) return;
    finger.moved = true;
    if (Math.abs(dx) >= Math.abs(dy)) onCmd(dx < 0 ? 'L' : 'R');
    else if (dy < 0) onCmd('U');
  };
  const up = e => {
    if (!finger || e.pointerId !== finger.id) return;
    if (!finger.moved) onTap();
    finger = null;
  };
  const cancel = e => { if (finger && e.pointerId === finger.id) finger = null; };
  const key = e => {
    if (e.repeat) return;
    if (KEYS[e.code]) onCmd(KEYS[e.code]);
    else if (TAPS.includes(e.code)) onTap();
  };

  const on = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, keydown: key };
  for (const type in on) target.addEventListener(type, on[type]);
  return () => { for (const type in on) target.removeEventListener(type, on[type]); };
}
