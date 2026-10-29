'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WorkflowStore } = require('../resources/h3-studio/app/workflow-store');

test('workflow projects are sanitized, stored atomically and listed newest first', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localframe-workflow-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new WorkflowStore(root);
  const created = store.save({
    title: ` 测试项目 ${'很'.repeat(100)} `,
    currentStage: 'invalid',
    brief: { idea: ' 一只猫穿过雨夜 ', duration: 999, aspect: '4:3' },
  });
  assert.equal(created.title.length, 80);
  assert.equal(created.brief.idea, '一只猫穿过雨夜');
  assert.equal(created.brief.duration, 900);
  assert.equal(created.brief.aspect, '16:9');
  assert.equal(created.currentStage, 'brief');
  assert.deepEqual(created.characterModels, []);
  assert.deepEqual(created.generation, {
    quality: 'auto', steps: 0, shotSeconds: 5, continuity: 'cut', audioMode: 'silent',
    enhancementMode: 'none', enhancementProfile: 'balanced',
  });

  const updated = store.update(created.id, {
    currentStage: 'script', status: 'planning',
    script: { logline: '猫寻找回家的路', source: 'local-template' },
  });
  assert.equal(updated.brief.idea, '一只猫穿过雨夜');
  assert.equal(updated.script.logline, '猫寻找回家的路');
  assert.equal(updated.status, 'planning');
  assert.equal(store.load(created.id).script.source, 'local-template');
  assert.equal(store.list()[0].id, created.id);
  await assert.rejects(fs.access(path.join(root, created.id, 'project.json.tmp')));
});

test('workflow character models require safe three-view files before confirmation', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localframe-workflow-characters-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new WorkflowStore(root);
  const project = store.save({
    brief: { idea: '角色连续性测试' },
    characterModels: [{
      id: '../hero', name: ' 林夏 ', description: ' 黑色短发，橙色夹克 ', confirmed: true,
      views: { front: 'hero-front.png', side: '../escape.png', back: 'hero-back.webp' },
    }],
  });
  assert.equal(project.schemaVersion, 5);
  assert.equal(project.characterModels[0].id, 'hero');
  assert.equal(project.characterModels[0].name, '林夏');
  assert.equal(project.characterModels[0].views.side, '');
  assert.equal(project.characterModels[0].confirmed, false);
  const confirmed = store.update(project.id, { characterModels: [{
    id: 'hero', name: '林夏', confirmed: true,
    views: { front: 'hero-front.png', side: 'hero-side.jpg', back: 'hero-back.webp' },
  }] });
  assert.equal(confirmed.characterModels[0].confirmed, true);
});

test('workflow project ids cannot escape the project directory', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localframe-workflow-safe-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new WorkflowStore(root);
  assert.throws(() => store.load('../'), /项目编号无效/);
});

test('workflow timeline persists sanitized subtitle and voice-axis metadata', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localframe-workflow-timeline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new WorkflowStore(root);
  const project = store.save({
    brief: { idea: '多角色短剧', duration: 30, voiceProfileId: 'female_story' },
    timeline: { source: 'auto-script', scriptHash: 'abc', totalDuration: 30, cues: [
      { start: -2, end: 3, text: ' 你好 ', speaker: ' 小满 ', kind: 'dialogue', voiceProfileId: 'custom_test' },
      { start: 4, end: 7, text: ' 回家吧 ', speaker: '旁白', kind: 'narration', voiceProfileId: 'male_narrator' },
    ] },
  });
  assert.deepEqual(project.timeline.cues.map((cue) => ({ start: cue.start, text: cue.text, speaker: cue.speaker, kind: cue.kind, voiceProfileId: cue.voiceProfileId })), [
    { start: 0, text: '你好', speaker: '小满', kind: 'dialogue', voiceProfileId: 'custom_test' },
    { start: 4, text: '回家吧', speaker: '旁白', kind: 'narration', voiceProfileId: 'male_narrator' },
  ]);
  const updated = store.update(project.id, { timeline: { updatedAt: 'now' } });
  assert.equal(updated.timeline.cues.length, 2);
  assert.equal(updated.timeline.updatedAt, 'now');
});
