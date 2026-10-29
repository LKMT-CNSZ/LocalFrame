'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LastSettings = require('../resources/h3-studio/app/public/last-settings');

function element(id, type = 'text', value = '', options = []) {
  return { id, type, value, tagName: type === 'select' ? 'SELECT' : 'INPUT', options, min: '', max: '', maxLength: -1,
    handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } };
}
test('remembers only whitelisted, valid values and never stores secrets or consent', () => {
  const fields = { size: element('size', 'select', '1024x1024', [{ value: '1024x1024' }]), steps: element('steps', 'number', '20'), apiKey: element('apiKey', 'password', 'secret'), consent: element('consent', 'checkbox', 'on') };
  fields.steps.min = '4'; fields.steps.max = '40';
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const root = { getElementById: id => fields[id] };
  const memory = LastSettings.create('test', Object.keys(fields), root, storage);
  memory.save();
  assert.deepEqual(JSON.parse(data.get('test')), { size: '1024x1024', steps: '20' });
  data.set('test', JSON.stringify({ size: 'obsolete', steps: '1000', apiKey: 'stolen', consent: 'on' }));
  fields.size.value = '1024x1024'; fields.steps.value = '20'; fields.apiKey.value = ''; fields.consent.value = '';
  memory.restore();
  assert.equal(fields.size.value, '1024x1024'); assert.equal(fields.steps.value, '20');
  assert.equal(fields.apiKey.value, ''); assert.equal(fields.consent.value, '');
  memory.clear(); assert.equal(data.has('test'), false);
});
