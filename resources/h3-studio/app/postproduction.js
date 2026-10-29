'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

const NO_TEXT_VISUAL_RULE = '【绝对无文字画面】只生成纯画面，禁止出现字幕：画面任何位置均不得出现对白文字、标题、说明、角标、Logo、水印、UI、乱码或可读字符；不要拍摄手机屏幕、显示器、书页、招牌、海报等文字载体，画面上下边缘保持纯净。所有准确文字统一由 LocalFrame 后期台加入。';
const AMBIENCE_ONLY_AUDIO_RULE = '【绝对无人声】禁止人物说话；人物嘴唇保持自然闭合，不做说话口型。仅生成与画面同步的环境声、动作声和必要的无歌词音乐，禁止人物念台词、旁白、画外音、耳语、喊叫、可辨识人声或歌词。准确台词与配音统一由 LocalFrame 后期台生成并混入。';
const DISTINCT_SHOT_RULE = '【镜头去重复】本镜头只呈现一个新的剧情动作和新的视觉信息；禁止复演、倒放、循环或改角度重复上一镜头的动作，禁止重复人物入场和重复相同构图。动作完成后自然停稳。';
const MIN_SUBTITLE_BACKGROUND_OPACITY = 0;

function ensureNoTextPrompt(value, maxLength = 4000) {
  const source = String(value || '').trim();
  if (!source || source.includes('【绝对无文字画面】')) return source.slice(0, maxLength);
  const separator = '\n\n';
  const available = Math.max(0, maxLength - NO_TEXT_VISUAL_RULE.length - separator.length);
  return `${source.slice(0, available).trim()}${separator}${NO_TEXT_VISUAL_RULE}`.trim();
}

function ensureAmbienceOnlyAudioPrompt(value, maxLength = 4000) {
  const source = String(value || '').trim();
  if (!source || source.includes('【绝对无人声】')) return source.slice(0, maxLength);
  const separator = '\n\n';
  const available = Math.max(0, maxLength - AMBIENCE_ONLY_AUDIO_RULE.length - separator.length);
  return `${source.slice(0, available).trim()}${separator}${AMBIENCE_ONLY_AUDIO_RULE}`.trim();
}

function stripSpokenContent(value, maxLength = 4000) {
  const source = String(value || '').replace(/\r/g, '');
  const cleaned = source
    .split('\n')
    .map((line) => {
      if (/^\s*(?:旁白|画外音|内心|解说|对白|台词)(?:规则)?\s*[：:]/.test(line)) return '';
      if (/^\s*[㐀-鿿A-Za-z0-9·]{1,16}(?:\s*[（(][^）)\n]{0,20}[）)])?\s*[：:]\s*[“"]/.test(line)) return '';
      return line;
    })
    .join('\n')
    .replace(/[㐀-鿿A-Za-z0-9·]{1,16}(?:\s*[（(][^）)\n]{0,20}[）)])?\s*[：:]\s*[“"][^”"\n]{1,300}[”"]/g, '')
    .replace(/(?:旁白|画外音|内心|解说|对白|台词)(?:规则)?\s*[：:][^\n。！？]{0,300}[。！？]?/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
  return cleaned.slice(0, maxLength);
}

function visualOnlyPrompt(value, maxLength = 4000) {
  const visual = stripSpokenContent(value, maxLength);
  const source = visual || '只呈现剧本对应的可见人物、动作、场景和镜头调度。';
  if (source.includes('【绝对无文字画面】') && source.includes('【绝对无人声】') && source.includes('【镜头去重复】')) return source.slice(0, maxLength);
  const rules = `${NO_TEXT_VISUAL_RULE}\n\n${AMBIENCE_ONLY_AUDIO_RULE}\n\n${DISTINCT_SHOT_RULE}`;
  const separator = '\n\n';
  const available = Math.max(0, maxLength - rules.length - separator.length);
  return `${source.slice(0, available).trim()}${separator}${rules}`.trim();
}

function cleanSubtitleText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[“"]|[”"]$/g, '')
    .trim()
    .slice(0, 160);
}

function extractDialogue(text) {
  const source = String(text || '').replace(/\r/g, '');
  const matches = [];
  const quoted = /(?:^|\n)\s*([\u3400-\u9fffA-Za-z0-9·]{1,16})(?:\s*[（(][^）)\n]{0,20}[）)])?\s*[：:]\s*[“"]([^”"\n]{1,300})[”"]/g;
  for (const match of source.matchAll(quoted)) {
    const speaker = cleanSubtitleText(match[1]);
    const content = cleanSubtitleText(match[2]);
    if (content) matches.push({ index: match.index || 0, speaker, text: content });
  }
  const narration = /(?:^|\n)\s*(旁白|画外音|内心|解说)\s*[：:]\s*(?![“"])([^\n]{1,300})/g;
  for (const match of source.matchAll(narration)) {
    const content = cleanSubtitleText(match[2]);
    if (content) matches.push({ index: match.index || 0, speaker: match[1], text: content });
  }
  const results = [];
  for (const item of matches.sort((left, right) => left.index - right.index)) {
    if (!results.some((existing) => existing.text === item.text)) results.push({ speaker: item.speaker, text: item.text });
  }
  return results.slice(0, 240);
}

function screenplayHash(screenplay) {
  return crypto.createHash('sha256').update(String(screenplay || '').replace(/\r/g, '').trim(), 'utf8').digest('hex');
}

function splitSubtitleText(value, maxChars = 22) {
  const text = cleanSubtitleText(value);
  const limit = Math.max(8, Math.min(40, Number(maxChars) || 22));
  if (!text) return [];
  const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [text];
  const chunks = [];
  const push = (part) => {
    let remaining = cleanSubtitleText(part);
    while (Array.from(remaining).length > limit) {
      const chars = Array.from(remaining);
      const window = chars.slice(0, limit).join('');
      const breakAt = Math.max(window.lastIndexOf('，'), window.lastIndexOf('、'), window.lastIndexOf(','), window.lastIndexOf(' '));
      const take = breakAt >= Math.floor(limit * 0.55) ? breakAt + 1 : limit;
      chunks.push(chars.slice(0, take).join('').trim());
      remaining = chars.slice(take).join('').trim();
    }
    if (remaining) chunks.push(remaining);
  };
  let pending = '';
  for (const sentence of sentences) {
    const candidate = `${pending}${sentence}`.trim();
    if (Array.from(candidate).length <= limit) pending = candidate;
    else {
      if (pending) push(pending);
      if (Array.from(sentence.trim()).length <= limit) pending = sentence.trim();
      else { push(sentence); pending = ''; }
    }
  }
  if (pending) push(pending);
  return chunks.filter(Boolean).slice(0, 500);
}

function cueText(line, includeSpeaker = true) {
  if (!includeSpeaker || !line.speaker || ['旁白', '画外音', '解说'].includes(line.speaker)) return line.text;
  return `${line.speaker}：${line.text}`;
}

function distributeLines(lines, start, duration, includeSpeaker) {
  if (!lines.length || duration <= 0) return [];
  const gap = lines.length > 1 ? Math.min(0.18, duration * 0.04) : 0;
  const usable = Math.max(0.6, duration - gap * (lines.length - 1));
  const weights = lines.map((line) => Math.max(6, Array.from(line.text).length));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  let cursor = start;
  return lines.map((line, index) => {
    const remaining = start + duration - cursor - gap * (lines.length - index - 1);
    const proportional = usable * (weights[index] / weightTotal);
    const cueDuration = index === lines.length - 1 ? remaining : Math.max(0.7, Math.min(5.8, proportional));
    const cue = { start: Math.round(cursor * 1000) / 1000, end: Math.round(Math.min(start + duration, cursor + cueDuration) * 1000) / 1000, text: cueText(line, includeSpeaker) };
    cursor = cue.end + gap;
    return cue;
  });
}

function buildScriptTimeline({ screenplay = '', duration = 60, defaultVoiceProfileId = 'female_narrator', voiceProfileBySpeaker = {}, maxSubtitleChars = 22 } = {}) {
  const safeDuration = Math.max(1, Math.min(4 * 60 * 60, Number(duration) || 60));
  const lines = extractDialogue(screenplay).flatMap((line) => splitSubtitleText(line.text, maxSubtitleChars).map((text) => ({ ...line, text })));
  if (!lines.length) return { scriptHash: screenplayHash(screenplay), totalDuration: safeDuration, cues: [] };
  const distributed = distributeLines(lines, 0.35, Math.max(0.8, safeDuration - 0.7), false);
  const cues = distributed.map((cue, index) => {
    const line = lines[index];
    const kind = ['旁白', '画外音', '内心', '解说'].includes(line.speaker) ? 'narration' : 'dialogue';
    return {
      id: index + 1,
      start: cue.start,
      end: cue.end,
      text: cue.text,
      speaker: line.speaker,
      kind,
      voiceProfileId: String(voiceProfileBySpeaker?.[line.speaker] || defaultVoiceProfileId || 'female_narrator').slice(0, 40),
    };
  });
  return { scriptHash: screenplayHash(screenplay), totalDuration: safeDuration, cues };
}

function sanitizeTimelineCues(value, duration = 4 * 60 * 60, defaultVoiceProfileId = 'female_narrator', minGap = 0.1) {
  if (!Array.isArray(value)) return [];
  const limit = Math.max(1, Math.min(4 * 60 * 60, Number(duration) || 4 * 60 * 60));
  const gap = Math.max(0, Math.min(1, Number(minGap) || 0));
  const prepared = value.slice(0, 500).map((cue, sourceIndex) => {
    const rawStart = Number(cue?.start);
    const rawEnd = Number(cue?.end);
    const start = Math.max(0, Math.min(limit, Number.isFinite(rawStart) ? rawStart : 0));
    const end = Math.max(start + 0.2, Number.isFinite(rawEnd) ? rawEnd : start + 2);
    const text = cleanSubtitleText(cue?.text);
    const inferredKind = cue?.kind === 'narration' || ['旁白', '画外音', '内心', '解说'].includes(String(cue?.speaker || '').trim())
      ? 'narration'
      : 'dialogue';
    const speaker = cleanSubtitleText(cue?.speaker || (inferredKind === 'narration' ? '旁白' : '角色')).slice(0, 40);
    return {
      sourceIndex,
      start,
      end,
      text,
      speaker,
      kind: inferredKind,
      voiceProfileId: String(cue?.voiceProfileId || defaultVoiceProfileId || 'female_narrator').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'female_narrator',
    };
  }).filter((cue) => cue.text && cue.start < limit);

  prepared.sort((left, right) => left.start - right.start || left.sourceIndex - right.sourceIndex);
  const cues = [];
  let cursor = 0;
  for (const cue of prepared) {
    const originalDuration = Math.max(0.2, cue.end - cue.start);
    const start = Math.max(cue.start, cues.length ? cursor + gap : 0);
    if (start >= limit - 0.19) continue;
    const end = Math.min(limit, Math.max(start + 0.2, start + originalDuration));
    if (end <= start) continue;
    cues.push({
      id: cues.length + 1,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      text: cue.text,
      speaker: cue.speaker,
      kind: cue.kind,
      voiceProfileId: cue.voiceProfileId,
    });
    cursor = end;
  }
  return cues;
}

function timelineSubtitleCues(cues, includeSpeaker = true, duration = 4 * 60 * 60) {
  if (!Array.isArray(cues)) return [];
  return sanitizeCues(cues.map((cue) => ({
    start: cue?.start,
    end: cue?.end,
    text: cueText({ speaker: cue?.speaker, text: cleanSubtitleText(cue?.text) }, includeSpeaker),
  })), duration);
}

function buildSubtitleCues({ screenplay = '', duration = 60, includeSpeaker = true } = {}) {
  const timeline = buildScriptTimeline({ screenplay, duration });
  return timelineSubtitleCues(timeline.cues, includeSpeaker, timeline.totalDuration);
}

function selectScriptCuesForShot({ screenplay = '', storyboard = [], shotNumber = 1, duration = 60 } = {}) {
  if (!Array.isArray(storyboard) || !storyboard.length) return shotNumber === 1
    ? buildSubtitleCues({ screenplay, duration, includeSpeaker: false })
    : [];
  const index = Math.max(0, Math.min(storyboard.length - 1, Number(shotNumber || 1) - 1));
  const start = storyboard.slice(0, index).reduce((sum, shot) => sum + Math.max(0, Number(shot?.seconds) || 0), 0);
  const end = start + Math.max(0.5, Number(storyboard[index]?.seconds) || 5);
  const last = index === storyboard.length - 1;
  return buildSubtitleCues({ screenplay, duration, includeSpeaker: false }).filter((cue) => {
    const midpoint = (cue.start + cue.end) / 2;
    return midpoint >= start && (last ? midpoint <= end : midpoint < end);
  });
}

function sanitizeCues(value, duration = 4 * 60 * 60) {
  if (!Array.isArray(value)) return [];
  const limit = Math.max(1, Number(duration) || 4 * 60 * 60);
  return value.slice(0, 500).map((cue) => {
    const start = Math.max(0, Math.min(limit, Number(cue?.start) || 0));
    const end = Math.min(limit, Math.max(start + 0.2, Number(cue?.end) || start + 2));
    return { start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000, text: cleanSubtitleText(cue?.text) };
  }).filter((cue) => cue.text && cue.start < limit && cue.end > cue.start);
}

function srtTime(seconds) {
  const millis = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor((millis % 3600000) / 60000);
  const secs = Math.floor((millis % 60000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function buildSrt(cues) {
  return sanitizeCues(cues).map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join('\n');
}

function assTime(seconds) {
  const centis = Math.max(0, Math.round(Number(seconds || 0) * 100));
  const hours = Math.floor(centis / 360000);
  const minutes = Math.floor((centis % 360000) / 6000);
  const secs = Math.floor((centis % 6000) / 100);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis % 100).padStart(2, '0')}`;
}

function assColor(hex, opacity = 1) {
  const clean = String(hex || '#FFFFFF').replace('#', '').padEnd(6, 'F').slice(0, 6);
  const [red, green, blue] = [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 6)];
  const alpha = Math.round((1 - Math.max(0, Math.min(1, Number(opacity)))) * 255).toString(16).padStart(2, '0');
  return `&H${alpha}${blue}${green}${red}`.toUpperCase();
}

function subtitleBackgroundOpacity(value) {
  const opacity = Number(value ?? 0);
  return Math.max(MIN_SUBTITLE_BACKGROUND_OPACITY, Math.min(0.9, Number.isFinite(opacity) ? opacity : 0));
}

function buildAss(cues, style = {}) {
  const font = String(style.font || 'Microsoft YaHei').replace(/[,\r\n]/g, '').slice(0, 80);
  const size = Math.round(Math.max(24, Math.min(96, Number(style.size) || 52)));
  const marginV = Math.round(Math.max(30, Math.min(360, Number(style.marginV) || 78)));
  const primary = assColor(style.color || '#FFFFFF');
  const outline = assColor(style.outlineColor || '#000000');
  const background = assColor(style.backgroundColor || '#000000', subtitleBackgroundOpacity(style.backgroundOpacity));
  const playResX = Math.round(Math.max(320, Math.min(7680, Number(style.playResX) || 1920)));
  const playResY = Math.round(Math.max(240, Math.min(4320, Number(style.playResY) || 1080)));
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${playResX}\nPlayResY: ${playResY}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${font},${size},${primary},${primary},${outline},${background},-1,0,0,0,100,100,0,0,3,1.5,0,2,90,90,${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const events = sanitizeCues(cues).map((cue) => {
    const text = cue.text.replace(/[{}]/g, '').replace(/\n/g, '\\N');
    return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${text}`;
  });
  return header + events.join('\n') + '\n';
}

function subtitleOutputName(videoName) {
  const parsed = path.parse(path.basename(String(videoName || 'video.mp4')));
  return `${parsed.name.replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'video'}-subtitled.mp4`;
}

function escapeSubtitleFilterPath(file) {
  return String(file).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

module.exports = {
  NO_TEXT_VISUAL_RULE, AMBIENCE_ONLY_AUDIO_RULE, MIN_SUBTITLE_BACKGROUND_OPACITY,
  ensureNoTextPrompt, ensureAmbienceOnlyAudioPrompt, stripSpokenContent, visualOnlyPrompt,
  extractDialogue, screenplayHash, splitSubtitleText, buildScriptTimeline, sanitizeTimelineCues, timelineSubtitleCues,
  buildSubtitleCues, selectScriptCuesForShot, sanitizeCues,
  buildSrt, buildAss, subtitleBackgroundOpacity, subtitleOutputName, escapeSubtitleFilterPath,
};
