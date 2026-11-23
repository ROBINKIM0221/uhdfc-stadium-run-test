import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const SELF = 'test/hygiene.test.js';
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter(f => /\.(js|cjs|mjs|html|css|md|yml|json)$/.test(f) && !f.startsWith('js/vendor/') && f !== SELF);

// 저장소는 누구나 본다. 한 사람의 컴퓨터에서만 맞는 경로나 작업용 폴더 이름이 남아 있으면 안 된다
const BANNED = [
  [/[A-Za-z]:[\\/]Users[\\/]/, '컴퓨터의 사용자 폴더 경로'],
  [/AppData/, '컴퓨터의 사용자 폴더 경로'],
  [/\.superpowers/, '작업용 폴더 이름'],
];

test('올라가는 파일에 내 컴퓨터 경로와 작업용 폴더 이름이 없다', () => {
  assert.ok(files.length > 40, `파일 ${files.length}개`);
  const found = [];
  for (const f of files) {
    const lines = fs.readFileSync(new URL(f, root), 'utf8').split('\n');
    lines.forEach((line, i) => { for (const [re, what] of BANNED) if (re.test(line)) found.push(`${f}:${i + 1} ${what}`); });
  }
  assert.deepEqual(found, []);
});
