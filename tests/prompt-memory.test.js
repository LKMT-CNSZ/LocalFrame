'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PromptMemory = require('../resources/h3-studio/app/public/prompt-memory');

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
}

test('remembers prompt pairs, deduplicates and moves reused entries to the front', () => {
  const data = storage();
  const memory = PromptMemory.create('image', { prompt: 2000, negative: 1000 }, data);
  assert.equal(memory.remember({ prompt: ' 森林晨光 ', negative: '模糊', apiKey: 'secret' }), true);
  memory.remember({ prompt: '海边', negative: '' });
  memory.remember({ prompt: '森林晨光', negative: '模糊' });
  assert.deepEqual(memory.list(), [
    { values: { prompt: '森林晨光', negative: '模糊' } },
    { values: { prompt: '海边', negative: '' } },
  ]);
  assert.equal(data.getItem('image').includes('secret'), false);
  assert.deepEqual(PromptMemory.create('image', { prompt: 2000, negative: 1000 }, data).list(), memory.list());
});

test('keeps the latest 30 entries with independent page histories', () => {
  const data = storage();
  const video = PromptMemory.create('video', { prompt: 4000 }, data);
  const image = PromptMemory.create('image', { prompt: 2000 }, data);
  for (let index = 0; index < 35; index += 1) video.remember({ prompt: `镜头 ${index}` });
  image.remember({ prompt: '图片' });
  assert.equal(video.list().length, 30);
  assert.equal(video.list()[0].values.prompt, '镜头 34');
  assert.equal(video.list()[29].values.prompt, '镜头 5');
  assert.equal(image.list()[0].values.prompt, '图片');
  assert.equal(video.remove(video.list()[0].values), true);
  assert.equal(video.list().length, 29);
  assert.equal(video.clear(), true);
  assert.deepEqual(video.list(), []);
  assert.equal(image.list().length, 1);
});

test('rejects empty, oversized and malformed values and recovers from corrupt storage', () => {
  const data = storage();
  const memory = PromptMemory.create('test', { prompt: 4, negative: 2 }, data);
  for (const value of [null, {}, { prompt: '  ' }, { prompt: 3 }, { prompt: '12345' }, { prompt: 'ok', negative: '123' }]) {
    assert.equal(memory.remember(value), false);
  }
  for (const value of ['{broken', 'null', '{}', '[null, {}, {"values":{"prompt":5}}]']) {
    data.setItem('test', value);
    assert.deepEqual(memory.list(), []);
  }
  assert.equal(memory.remember({ prompt: '<>&"' }), true);
  assert.equal(memory.list()[0].values.prompt, '<>&"');
});

test('reports storage failures without claiming a successful save', () => {
  const memory = PromptMemory.create('test', { prompt: 4000 }, {
    getItem() { throw new Error('unavailable'); },
    setItem() { throw new Error('quota exceeded'); },
  });
  assert.deepEqual(memory.list(), []);
  assert.equal(memory.remember({ prompt: 'test' }), false);
  assert.equal(memory.clear(), false);
});
