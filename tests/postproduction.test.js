'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NO_TEXT_VISUAL_RULE, AMBIENCE_ONLY_AUDIO_RULE, MIN_SUBTITLE_BACKGROUND_OPACITY,
  ensureNoTextPrompt, stripSpokenContent, visualOnlyPrompt,
  extractDialogue, buildSubtitleCues, selectScriptCuesForShot,
  screenplayHash, splitSubtitleText, buildScriptTimeline, sanitizeTimelineCues, timelineSubtitleCues,
  sanitizeCues, buildSrt, buildAss, subtitleBackgroundOpacity, subtitleOutputName, escapeSubtitleFilterPath,
} = require('../resources/h3-studio/app/postproduction');

test('adds an idempotent subtitle-free visual rule without exceeding prompt limits', () => {
  const result = ensureNoTextPrompt('电影感人物近景');
  assert.match(result, /禁止出现字幕/);
  assert.match(result, /LocalFrame 后期台加入/);
  assert.equal(ensureNoTextPrompt(result), result);
  assert.ok(ensureNoTextPrompt('画'.repeat(5000)).length <= 4000);
  assert.ok(NO_TEXT_VISUAL_RULE.length > 40);
});

test('extracts real quoted dialogue but ignores screenplay directions', () => {
  const lines = extractDialogue('场 1\n画面：人物走进房间\n旁白：雨还在下。\n苏小满：“还来得及，我们现在开始。”\n对白：使用一句短对白');
  assert.deepEqual(lines, [
    { speaker: '旁白', text: '雨还在下。' },
    { speaker: '苏小满', text: '还来得及，我们现在开始。' },
  ]);
});

test('removes spoken copy but preserves ambience before a prompt reaches the video model', () => {
  const screenplay = '场 1\n画面：小满推门进入。\n小满：“你终于来了。”\n旁白：雨还在下。\n声音：雷声渐近。';
  assert.equal(stripSpokenContent(screenplay), '场 1\n画面：小满推门进入。\n\n声音：雷声渐近。');
  const prompt = visualOnlyPrompt(screenplay);
  assert.match(prompt, /小满推门进入/);
  assert.doesNotMatch(prompt, /你终于来了|雨还在下/);
  assert.match(prompt, /雷声渐近/);
  assert.match(prompt, /禁止出现字幕/);
  assert.match(prompt, /仅生成与画面同步的环境声/);
  assert.match(prompt, /禁止人物说话/);
  assert.match(prompt, /嘴唇保持自然闭合/);
  assert.match(prompt, /镜头去重复/);
  assert.match(prompt, /禁止复演、倒放、循环/);
  assert.ok(AMBIENCE_ONLY_AUDIO_RULE.length > 40);
  assert.ok(visualOnlyPrompt('画'.repeat(5000)).length <= 4000);
});

test('builds subtitles only from screenplay and assigns them once across shots', () => {
  const cues = buildSubtitleCues({
    screenplay: '小满：“第一句话。”\n旁白：第二句话。',
    duration: 10,
    storyboard: [
      { seconds: 4, prompt: '错误来源：“不得变成字幕。”' },
      { seconds: 6, prompt: '纯画面' },
    ],
  });
  assert.equal(cues.length, 2);
  assert.deepEqual(cues.map((cue) => cue.text), ['小满：第一句话。', '第二句话。']);
  assert.equal(buildSrt(cues).includes('不得变成字幕'), false);
  const screenplay = '小满：“第一句话。”\n旁白：第二句话。';
  const first = selectScriptCuesForShot({ screenplay, duration: 10, storyboard: [{ seconds: 5 }, { seconds: 5 }], shotNumber: 1 });
  const second = selectScriptCuesForShot({ screenplay, duration: 10, storyboard: [{ seconds: 5 }, { seconds: 5 }], shotNumber: 2 });
  assert.deepEqual([...first, ...second].map((cue) => cue.text), ['第一句话。', '第二句话。']);
  assert.match(buildSrt(cues), /00:00:00,350 -->/);
  assert.match(buildAss(cues, { size: 60 }), /Style: Default,Microsoft YaHei,60/);
  assert.match(buildAss(cues), /Dialogue: 0/);
});

test('sanitizes edited cues and creates safe output and filter paths', () => {
  const cues = sanitizeCues([{ start: -2, end: 3, text: '<b>你好</b>' }, { start: 9, end: 20, text: '结尾' }], 10);
  assert.deepEqual(cues, [{ start: 0, end: 3, text: '你好' }, { start: 9, end: 10, text: '结尾' }]);
  assert.equal(subtitleOutputName('../成片 final.mov'), '成片-final-subtitled.mp4');
  assert.equal(escapeSubtitleFilterPath('D:\\AI\\字幕.ass'), 'D\\:/AI/字幕.ass');
});

test('subtitle background can be fully transparent', () => {
  assert.equal(MIN_SUBTITLE_BACKGROUND_OPACITY, 0);
  assert.equal(subtitleBackgroundOpacity(0), 0);
  assert.equal(subtitleBackgroundOpacity(0.1), 0.1);
  assert.equal(subtitleBackgroundOpacity(0.42), 0.42);
  assert.equal(subtitleBackgroundOpacity(1), 0.9);
  assert.equal(subtitleBackgroundOpacity(undefined), 0);
  assert.match(buildAss([{ start: 0, end: 2, text: '你好' }], { backgroundOpacity: 0 }), /&HFF000000/);
});

test('splits long screenplay lines into one shared subtitle and multi-role voice timeline', () => {
  const screenplay = '旁白：雨越下越大，但街角那盏灯一直亮着，像是在等一个很久没有回家的人。\n苏小满：“别怕，我已经看到你了，我们慢慢走回去。”\n林川：“好，我就在这里等你。”';
  const timeline = buildScriptTimeline({
    screenplay, duration: 18, defaultVoiceProfileId: 'female_narrator',
    voiceProfileBySpeaker: { 苏小满: 'female_emotional', 林川: 'male_warm' }, maxSubtitleChars: 16,
  });
  assert.equal(timeline.scriptHash, screenplayHash(screenplay));
  assert.ok(timeline.cues.length > 3);
  assert.ok(timeline.cues.every((cue) => cue.id && cue.end > cue.start && cue.text.length <= 16));
  assert.ok(timeline.cues.filter((cue) => cue.speaker === '苏小满').every((cue) => cue.voiceProfileId === 'female_emotional'));
  assert.ok(timeline.cues.filter((cue) => cue.speaker === '林川').every((cue) => cue.voiceProfileId === 'male_warm'));
  assert.ok(timeline.cues.filter((cue) => cue.speaker === '旁白').every((cue) => cue.kind === 'narration'));
  assert.deepEqual(timelineSubtitleCues(timeline.cues, true, 18).map((cue) => cue.text), timeline.cues.map((cue) => cue.speaker === '旁白' ? cue.text : `${cue.speaker}：${cue.text}`));
  assert.ok(splitSubtitleText('这是一句很长很长，需要自动拆开的字幕内容。', 10).length > 1);
});

test('sanitizes AI dialogue timeline against actual video duration without losing role voices', () => {
  const cues = sanitizeTimelineCues([
    { start: 8.8, end: 15, speaker: '林川', kind: 'dialogue', text: '最后一句。', voiceProfileId: 'male_warm' },
    { start: -1, end: 2.4, speaker: '旁白', kind: 'narration', text: '开场。', voiceProfileId: 'female_narrator' },
    { start: 2.2, end: 5, speaker: '苏小满', kind: 'dialogue', text: '时间发生重叠。', voiceProfileId: 'female_emotional' },
  ], 10, 'female_narrator', 0.1);
  assert.deepEqual(cues.map((cue) => cue.speaker), ['旁白', '苏小满', '林川']);
  assert.equal(cues[0].start, 0);
  assert.ok(cues[1].start >= cues[0].end + 0.1);
  assert.ok(cues[2].start >= cues[1].end + 0.1);
  assert.equal(cues.at(-1).end, 10);
  assert.equal(cues[1].voiceProfileId, 'female_emotional');
  assert.equal(cues[2].voiceProfileId, 'male_warm');
  assert.ok(cues.every((cue, index) => cue.id === index + 1 && cue.end <= 10));
});

test('normalizes missing AI cue metadata for editable postproduction rows', () => {
  const [cue] = sanitizeTimelineCues([{ start: 0.35, end: 2.4, text: '<b>夜色降临。</b>', kind: 'narration' }], 6, 'female_story');
  assert.deepEqual(cue, {
    id: 1, start: 0.35, end: 2.4, text: '夜色降临。', speaker: '旁白', kind: 'narration', voiceProfileId: 'female_story',
  });
});
