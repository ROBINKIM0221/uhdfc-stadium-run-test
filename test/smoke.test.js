import test from 'node:test';
import assert from 'node:assert/strict';

test('three 를 한 곳에서 가져온다', async () => {
  const THREE = await import('../js/render/three.js');
  assert.equal(THREE.REVISION, '160');
  assert.equal(typeof THREE.Scene, 'function');
});
