import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 제목 글꼴은 화면에 나오는 글자만 담고 있다. 담기지 않은 글자는 다른 글꼴로 섞여 나온다
test('제목 글꼴에 화면 글자, 선수 이름, 유니폼 이름의 한글이 모두 들어 있다', () => {
  const have = new Set(readFileSync('fonts/black-han-sans-ui.txt', 'utf8'));
  const missing = new Set();
  for (const f of ['js/ui/screens.js', 'js/data/players.js', 'js/data/kits.js']) {
    for (const c of readFileSync(f, 'utf8')) if (c >= '가' && c <= '힣' && !have.has(c)) missing.add(c);
  }
  assert.deepEqual([...missing], [], 'tools/font.py 를 다시 돌린다');
});
