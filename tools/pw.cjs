// Playwright 를 찾아 준다. 이 폴더에 설치돼 있지 않으면 전역으로 설치된 것(npm i -g playwright)을 쓴다.
const path = require('node:path');
const { execSync } = require('node:child_process');

function load() {
  try { return require('playwright'); } catch { /* 전역 설치본을 찾아본다 */ }
  return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'));
}

module.exports = load();
