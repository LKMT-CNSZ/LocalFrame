'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function cleanText(value, max = 12000) {
  return String(value || '').trim().slice(0, max);
}

function cleanFileName(value) {
  const name = path.basename(String(value || ''));
  return /^[a-zA-Z0-9-]+-(front|side|back)\.(png|jpg|webp)$/.test(name) ? name : '';
}

function cleanCharacterModels(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, 24).map((item, index) => {
    const candidate = cleanText(item?.id, 64).replace(/[^a-zA-Z0-9-]/g, '');
    const id = candidate && !seen.has(candidate) ? candidate : `character-${index + 1}`;
    seen.add(id);
    const views = {
      front: cleanFileName(item?.views?.front),
      side: cleanFileName(item?.views?.side),
      back: cleanFileName(item?.views?.back),
    };
    const complete = Boolean(views.front && views.side && views.back);
    return {
      id,
      name: cleanText(item?.name || `角色 ${index + 1}`, 80),
      description: cleanText(item?.description, 1200),
      views,
      confirmed: complete && item?.confirmed === true,
      updatedAt: cleanText(item?.updatedAt, 80),
    };
  });
}

function defaultProject(input = {}) {
  const now = new Date().toISOString();
  const stages = ['brief', 'script', 'bible', 'storyboard', 'plan', 'production', 'completed'];
  const statuses = ['draft', 'planning', 'ready', 'producing', 'completed', 'failed', 'cancelled', 'paused'];
  return {
    schemaVersion: 5,
    id: input.id || `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    title: cleanText(input.title || '未命名视频项目', 80),
    status: statuses.includes(input.status) ? input.status : 'draft',
    currentStage: stages.includes(input.currentStage) ? input.currentStage : 'brief',
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    brief: {
      idea: cleanText(input.brief?.idea, 8000),
      duration: Math.min(900, Math.max(2, Number(input.brief?.duration) || 120)),
      aspect: ['16:9', '9:16', '1:1'].includes(input.brief?.aspect) ? input.brief.aspect : '16:9',
      style: cleanText(input.brief?.style || '电影感写实', 500),
      audience: cleanText(input.brief?.audience, 500),
      dialogue: input.brief?.dialogue !== false,
      voiceEnabled: input.brief?.voiceEnabled !== false,
      voiceProfileId: cleanText(input.brief?.voiceProfileId || 'female_narrator', 40),
      delivery: ['2k', '1080p', 'native'].includes(input.brief?.delivery) ? input.brief.delivery : '1080p',
    },
    script: {
      logline: cleanText(input.script?.logline, 1200),
      outline: cleanText(input.script?.outline, 12000),
      screenplay: cleanText(input.script?.screenplay, 24000),
      source: cleanText(input.script?.source, 40),
    },
    bible: {
      characters: cleanText(input.bible?.characters, 12000),
      locations: cleanText(input.bible?.locations, 12000),
      visualRules: cleanText(input.bible?.visualRules, 8000),
      audioRules: cleanText(input.bible?.audioRules, 8000),
    },
    characterModels: cleanCharacterModels(input.characterModels),
    generation: {
      quality: ['auto', 'draft', 'balanced', 'quality', 'ultra'].includes(input.generation?.quality) ? input.generation.quality : 'auto',
      steps: [0, 4, 6, 8, 10, 12].includes(Number(input.generation?.steps)) ? Number(input.generation.steps) : 0,
      shotSeconds: Math.min(10, Math.max(3, Number(input.generation?.shotSeconds) || 5)),
      continuity: ['cut', 'carry'].includes(input.generation?.continuity) ? input.generation.continuity : 'cut',
      audioMode: ['silent', 'ambience'].includes(input.generation?.audioMode) ? input.generation.audioMode : 'silent',
      enhancementMode: ['none', 'lanczos', 'realesrgan', 'flashvsr'].includes(input.generation?.enhancementMode) ? input.generation.enhancementMode : 'none',
      enhancementProfile: ['fast', 'balanced', 'quality'].includes(input.generation?.enhancementProfile) ? input.generation.enhancementProfile : 'balanced',
    },
    timeline: {
      source: cleanText(input.timeline?.source, 40),
      scriptHash: cleanText(input.timeline?.scriptHash, 80),
      updatedAt: cleanText(input.timeline?.updatedAt, 80),
      totalDuration: Math.min(4 * 60 * 60, Math.max(0, Number(input.timeline?.totalDuration) || 0)),
      cues: Array.isArray(input.timeline?.cues) ? input.timeline.cues.slice(0, 500).map((cue, index) => {
        const start = Math.max(0, Math.min(4 * 60 * 60, Number(cue?.start) || 0));
        const end = Math.max(start + 0.2, Math.min(4 * 60 * 60, Number(cue?.end) || start + 2));
        return {
          id: index + 1,
          start: Math.round(start * 1000) / 1000,
          end: Math.round(end * 1000) / 1000,
          text: cleanText(cue?.text, 160),
          speaker: cleanText(cue?.speaker, 40),
          kind: cue?.kind === 'narration' ? 'narration' : 'dialogue',
          voiceProfileId: cleanText(cue?.voiceProfileId || input.brief?.voiceProfileId || 'female_narrator', 40),
        };
      }).filter((cue) => cue.text && cue.end > cue.start) : [],
    },
    storyboard: Array.isArray(input.storyboard) ? input.storyboard.slice(0, 120).map((shot, index) => ({
      id: index + 1,
      title: cleanText(shot.title || `镜头 ${index + 1}`, 80),
      seconds: Math.min(10, Math.max(1, Number(shot.seconds) || 5)),
      prompt: cleanText(shot.prompt, 4000),
      approved: shot.approved === true,
    })) : [],
    storyboardSource: cleanText(input.storyboardSource, 40),
    production: {
      plan: input.production?.plan && typeof input.production.plan === 'object' ? input.production.plan : null,
      mode: ['local', 'cloud', 'platform-handoff'].includes(input.production?.mode) ? input.production.mode : '',
      providerId: cleanText(input.production?.providerId, 80),
      jobId: cleanText(input.production?.jobId, 80),
      jobStatus: cleanText(input.production?.jobStatus, 40),
      outputName: cleanText(input.production?.outputName, 260),
      lastError: cleanText(input.production?.lastError, 4000),
      handoff: input.production?.handoff && typeof input.production.handoff === 'object' ? {
        status: cleanText(input.production.handoff.status, 40),
        activeShotId: Math.max(0, Number(input.production.handoff.activeShotId) || 0),
        totalShots: Math.max(0, Number(input.production.handoff.totalShots) || 0),
        importedShots: Math.max(0, Number(input.production.handoff.importedShots) || 0),
        providerId: cleanText(input.production.handoff.providerId, 80),
        actionId: cleanText(input.production.handoff.actionId, 160),
      } : null,
    },
  };
}

class WorkflowStore {
  constructor(root) {
    this.root = root;
    fs.mkdirSync(root, { recursive: true });
  }

  file(id) {
    const safe = String(id || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!safe) throw new Error('项目编号无效');
    return path.join(this.root, safe, 'project.json');
  }

  load(id) {
    const file = this.file(id);
    if (!fs.existsSync(file)) throw new Error('项目不存在或已移动');
    return defaultProject(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  save(input = {}) {
    const previous = input.id && fs.existsSync(this.file(input.id))
      ? JSON.parse(fs.readFileSync(this.file(input.id), 'utf8'))
      : {};
    const project = defaultProject({
      ...previous,
      ...input,
      brief: { ...(previous.brief || {}), ...(input.brief || {}) },
      script: { ...(previous.script || {}), ...(input.script || {}) },
      bible: { ...(previous.bible || {}), ...(input.bible || {}) },
      characterModels: input.characterModels === undefined ? previous.characterModels : input.characterModels,
      generation: { ...(previous.generation || {}), ...(input.generation || {}) },
      timeline: { ...(previous.timeline || {}), ...(input.timeline || {}) },
      production: { ...(previous.production || {}), ...(input.production || {}) },
      createdAt: previous.createdAt || input.createdAt,
      updatedAt: new Date().toISOString(),
    });
    if (!project.brief.idea && project.currentStage !== 'brief') throw new Error('请先填写创意简报');
    const file = this.file(project.id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(project, null, 2), 'utf8');
    fs.renameSync(temp, file);
    return project;
  }

  update(id, patch = {}) {
    const project = this.load(id);
    const merged = {
      ...project,
      ...patch,
      brief: { ...project.brief, ...(patch.brief || {}) },
      script: { ...project.script, ...(patch.script || {}) },
      bible: { ...project.bible, ...(patch.bible || {}) },
      characterModels: patch.characterModels === undefined ? project.characterModels : patch.characterModels,
      generation: { ...project.generation, ...(patch.generation || {}) },
      timeline: { ...project.timeline, ...(patch.timeline || {}) },
      production: { ...project.production, ...(patch.production || {}) },
    };
    return this.save(merged);
  }

  list() {
    const projects = [];
    for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const project = this.load(entry.name);
        projects.push({
          id: project.id, title: project.title, status: project.status, currentStage: project.currentStage,
          duration: project.brief.duration, aspect: project.brief.aspect, updatedAt: project.updatedAt,
          jobStatus: project.production.jobStatus, outputName: project.production.outputName,
        });
      } catch {}
    }
    return projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 100);
  }
}

module.exports = { WorkflowStore, defaultProject, cleanCharacterModels };
