/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitChunks } from './chunks.ts';

test('long values split into chunks that rejoin exactly', () => {
  const value = 'x'.repeat(4000) + 'end';
  const chunks = splitChunks(value, 1800);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((c) => c.length <= 1800));
  assert.equal(chunks.join(''), value);
});

test('short and empty values are one chunk', () => {
  assert.deepEqual(splitChunks('abc', 1800), ['abc']);
  assert.deepEqual(splitChunks('', 1800), ['']);
});
