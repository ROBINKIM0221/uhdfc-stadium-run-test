import test from 'node:test';
import assert from 'node:assert/strict';
import { isInApp } from '../js/ui/inapp.js';

test('앱 안 브라우저를 알아본다', () => {
  assert.equal(isInApp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 355.0.0.24.108'), true);
  assert.equal(isInApp('Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36;KAKAOTALK 11.2.0'), true);
  assert.equal(isInApp('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]'), true);
  assert.equal(isInApp('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.9.2)'), true);
});

test('보통 브라우저는 아니다', () => {
  assert.equal(isInApp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), false);
  assert.equal(isInApp('Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'), false);
  assert.equal(isInApp(''), false);
  assert.equal(isInApp(undefined), false);
});
