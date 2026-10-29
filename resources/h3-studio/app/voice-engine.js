'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const NATURAL_DELIVERY = '自然口语表达，按语义轻重和停连，避免机械腔、匀速和夸张播音腔，句尾自然收住。';

// The model ships two base speakers. Profiles vary situation, age impression,
// energy and rhythm as well as speed so they do not sound like one announcer.
const VOICE_PROFILES = Object.freeze([
  {
    id: 'female_narrator', label: '温暖女声 · 自然旁白', speaker: '中文女', description: '松弛可信，适合剧情旁白与品牌故事',
    instruction: '温暖、松弛、可信，像在安静房间里把故事讲给一个人听；情绪含蓄，重点词轻轻强调。',
    previewText: '有些故事，不需要大声讲。你只要靠近一点，就能听见它正在发生。', speed: 0.96, pauseScale: 1.08, variation: 0.018,
  },
  {
    id: 'female_bright', label: '明亮女声 · 轻快介绍', speaker: '中文女', description: '清爽亲切，适合产品、生活方式与知识分享',
    instruction: '明亮、亲切、有微笑感，像朋友面对面分享一个刚发现的好东西；轻快但不赶，不使用促销播音腔。',
    previewText: '今天想和你分享一个很简单的小方法，花一分钟，就能让创作顺手很多。', speed: 1.04, pauseScale: 0.92, variation: 0.024,
  },
  {
    id: 'female_calm', label: '冷静女声 · 科技纪录', speaker: '中文女', description: '克制理性，适合科技、纪录片与信息解说',
    instruction: '冷静、克制、理性，但保留真实人的温度；信息层次清楚，关键结论稍作强调，不故作神秘。',
    previewText: '真正改变体验的，往往不是更复杂的功能，而是那些恰到好处的细节。', speed: 0.94, pauseScale: 1.02, variation: 0.014,
  },
  {
    id: 'female_gentle', label: '治愈女声 · 轻柔陪伴', speaker: '中文女', description: '柔和松弛，适合情感、睡前故事与治愈内容',
    instruction: '轻柔、真诚、带一点呼吸感，像熟悉的朋友在近距离安慰和陪伴；音量稳定，不耳语，不拖腔。',
    previewText: '别着急，先把今天放在这里。等风慢下来，我们再一起往前走。', speed: 0.90, pauseScale: 1.18, variation: 0.016,
  },
  {
    id: 'female_story', label: '故事女声 · 情绪叙事', speaker: '中文女', description: '细腻有画面，适合短剧、悬疑与有声故事',
    instruction: '细腻、有画面感，像亲历者回忆一段故事；情绪随语义自然变化，悬念处收紧，转折后留出短暂停顿。',
    previewText: '门明明锁着，桌上的那杯茶，却还是温的。她停了一下，没有回头。', speed: 0.95, pauseScale: 1.12, variation: 0.026,
  },
  {
    id: 'female_lively', label: '元气女声 · 短视频', speaker: '中文女', description: '有活力但不吵闹，适合短视频、种草与活动内容',
    instruction: '自然活泼、反应灵动，像年轻创作者对镜头聊天；节奏利落，有真实笑意，但不尖、不喊、不连续重读。',
    previewText: '等等，这个效果也太顺了吧！不用来回折腾，灵感真的可以马上变成画面。', speed: 1.08, pauseScale: 0.86, variation: 0.032,
  },
  {
    id: 'female_mature', label: '知性女声 · 深度讲述', speaker: '中文女', description: '成熟从容，适合访谈、课程与文化内容',
    instruction: '成熟、从容、知性，像经验丰富的讲述者在认真交流；语气坚定但不端着，观点之间自然停顿。',
    previewText: '好内容从来不只是被看见，它还会在某个时刻，让人重新理解自己的选择。', speed: 0.93, pauseScale: 1.10, variation: 0.015,
  },
  {
    id: 'female_intimate', label: '闺蜜女声 · 私密聊天', speaker: '中文女', description: '近距离、生活化，适合 Vlog 与情感分享',
    instruction: '像关系很近的朋友私下聊天，距离近、语气松、偶尔轻微犹豫和转折；不要端正朗读，不卖弄情绪。',
    previewText: '我跟你说，刚开始我也没抱多大希望。可做到这里的时候，突然就觉得，真的行。', speed: 1.01, pauseScale: 0.96, variation: 0.014,
  },
  {
    id: 'female_confident', label: '自信女声 · 商务表达', speaker: '中文女', description: '笃定利落，适合方案、发布与职场内容',
    instruction: '自信、清醒、利落，像专业负责人在会议中陈述结论；不强势，不喊口号，重点信息自然落下。',
    previewText: '我们不需要增加更多步骤。把复杂的部分交给系统，团队只专注最终表达。', speed: 0.99, pauseScale: 0.94, variation: 0.010,
  },
  {
    id: 'female_emotional', label: '情感女声 · 剧情对白', speaker: '中文女', description: '克制而有情绪，适合短剧角色与独白',
    instruction: '像演员在真实剧情中说台词，情绪由内容推动，有细小呼吸与迟疑；克制、不朗诵、不把每个字都说满。',
    previewText: '我不是不想回去。只是那扇门一打开，我就不知道该怎么面对他们。', speed: 0.95, pauseScale: 1.08, variation: 0.014,
  },
  {
    id: 'female_news', label: '清朗女声 · 资讯播报', speaker: '中文女', description: '清楚紧凑，适合新闻、数据与资讯内容',
    instruction: '清朗、准确、节奏紧凑，像新媒体资讯主播自然陈述；信息有层级，不拖字，不使用传统电视播音腔。',
    previewText: '今天的更新带来三个变化，其中最重要的一项，会直接影响创作效率。', speed: 1.06, pauseScale: 0.88, variation: 0.008,
  },
  {
    id: 'male_narrator', label: '沉稳男声 · 电影旁白', speaker: '中文男', description: '低调有质感，适合电影感旁白与品牌故事',
    instruction: '沉稳、有质感、内敛，像电影中的第一人称旁白；不刻意压低嗓音，不拖长字音，转折处自然加重。',
    previewText: '那天以后，城市看起来没有任何变化。只有我知道，一切都已经不同了。', speed: 0.94, pauseScale: 1.10, variation: 0.016,
  },
  {
    id: 'male_clear', label: '清晰男声 · 自然教程', speaker: '中文男', description: '友好清楚，适合教程、课程与操作说明',
    instruction: '自然、清楚、耐心，像同事坐在旁边讲解操作；重点步骤稍作强调，语句有层次，不要客服腔。',
    previewText: '先选好画面比例，再写下你真正想表达的内容。剩下的步骤，我们慢慢来。', speed: 0.99, pauseScale: 0.98, variation: 0.018,
  },
  {
    id: 'male_energetic', label: '活力男声 · 热血宣传', speaker: '中文男', description: '干脆有推动力，适合运动、活动与节奏型内容',
    instruction: '有活力、有推动感，像真诚兴奋地邀请朋友参与；强弱有变化，短句干脆，不持续喊叫，不用传统广告腔。',
    previewText: '准备好了吗？这一次，别让灵感停在脑海里。现在就把它做出来！', speed: 1.07, pauseScale: 0.86, variation: 0.030,
  },
  {
    id: 'male_warm', label: '温柔男声 · 陪伴讲述', speaker: '中文男', description: '温和可靠，适合情感故事与生活内容',
    instruction: '温和、可靠、放松，像熟悉的朋友在夜晚聊天；语气真诚，保留细小情绪变化，不煽情。',
    previewText: '你不用每一步都走得很快。方向是对的，慢一点，也一样会到达。', speed: 0.92, pauseScale: 1.16, variation: 0.018,
  },
  {
    id: 'male_youthful', label: '青年男声 · 轻松分享', speaker: '中文男', description: '清爽随和，适合数码、游戏与日常分享',
    instruction: '年轻、清爽、随和，像朋友间自然聊天；节奏轻快，偶尔有小幅语气变化，不装酷，不用主持人口吻。',
    previewText: '我本来只想试一下，结果越用越顺手。尤其这个细节，确实有点意思。', speed: 1.05, pauseScale: 0.90, variation: 0.028,
  },
  {
    id: 'male_documentary', label: '纪实男声 · 人文纪录', speaker: '中文男', description: '客观而有人情味，适合纪录片与历史内容',
    instruction: '客观、平实、有人情味，像纪录片作者观察真实生活；陈述准确，画面转换处稍作停顿，不营造虚假宏大感。',
    previewText: '清晨六点，第一盏灯亮了起来。对这里的人来说，新的一天早已开始。', speed: 0.91, pauseScale: 1.14, variation: 0.014,
  },
  {
    id: 'male_suspense', label: '悬疑男声 · 克制叙事', speaker: '中文男', description: '冷静紧凑，适合悬疑、推理与剧情预告',
    instruction: '冷静、紧凑、带克制的悬念，像在还原一段真实事件；关键信息前稍停，句尾收紧，不压嗓，不故弄玄虚。',
    previewText: '监控里没有陌生人。可就在十二点整，走廊尽头的门，自己开了。', speed: 0.93, pauseScale: 1.08, variation: 0.022,
  },
  {
    id: 'male_relaxed', label: '松弛男声 · 日常聊天', speaker: '中文男', description: '随和生活化，适合 Vlog、测评与闲聊',
    instruction: '松弛、随和，像朋友坐在旁边随口分享体验；允许自然停顿，避免字正腔圆和刻意热情。',
    previewText: '说实话，我一开始没看懂它有什么特别。用了两天以后，倒是有点离不开了。', speed: 0.99, pauseScale: 1.00, variation: 0.014,
  },
  {
    id: 'male_business', label: '专业男声 · 商务方案', speaker: '中文男', description: '稳健明确，适合企业、方案与课程内容',
    instruction: '专业、稳健、表达明确，像项目负责人向团队解释方案；亲和但不随意，不使用会议主持腔。',
    previewText: '目标很清楚：减少重复工作，同时让每一次修改都能够被追踪和恢复。', speed: 0.97, pauseScale: 0.96, variation: 0.008,
  },
  {
    id: 'male_comedy', label: '喜剧男声 · 轻松反差', speaker: '中文男', description: '反应自然，适合轻喜剧与剧情短视频',
    instruction: '带自然的喜剧反应和轻微自嘲，像人物在真实场景中脱口而出；停顿制造反差，不挤眉弄眼式夸张。',
    previewText: '甲方说只改一个小地方。嗯，我看了一眼，一共是二十七个小地方。', speed: 1.03, pauseScale: 0.94, variation: 0.016,
  },
  {
    id: 'male_epic', label: '力量男声 · 大气叙事', speaker: '中文男', description: '有力量但不喊，适合历史、汽车与宏观题材',
    instruction: '有力量、有空间感但不喊叫，像见过风浪的人平静讲述重要时刻；句子稳，关键词有重量，不压嗓。',
    previewText: '真正的改变，并不总在聚光灯下发生。它从一次坚定的选择开始。', speed: 0.90, pauseScale: 1.14, variation: 0.008,
  },
]);

function normalizeSpeechText(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(/,/g, '，')
    .replace(/!/g, '！')
    .replace(/\?/g, '？')
    .replace(/;/g, '；')
    .replace(/([。！？；])\r?\n+/g, '$1')
    .replace(/\r?\n+/g, '。')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*([，。！？；：、])\s*/g, '$1')
    .replace(/([，。！？；：、])\1+/g, '$1')
    .trim()
    .slice(0, 2000);
}

function naturalInstruction(profile, override) {
  const direction = String(override || profile.instruction || '').trim().slice(0, 340);
  return `${direction}${direction && !/[。！？]$/.test(direction) ? '。' : ''}${NATURAL_DELIVERY}`.slice(0, 500);
}

function requestJson(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body == null ? null : Buffer.from(JSON.stringify(options.body));
    const request = http.request({
      host: '127.0.0.1', port, path: pathname, method: options.method || 'GET', timeout: options.timeout || 5000,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {},
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = raw ? JSON.parse(raw) : {}; } catch { return reject(new Error('语音服务返回了无效数据')); }
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(parsed.error || `语音服务错误 ${response.statusCode}`));
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy(new Error('语音服务响应超时')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function requestFile(port, pathname, body, target, timeout = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const request = http.request({
      host: '127.0.0.1', port, path: pathname, method: 'POST', timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try { reject(new Error(JSON.parse(Buffer.concat(chunks).toString('utf8')).error || '语音生成失败')); }
          catch { reject(new Error(`语音生成失败（${response.statusCode}）`)); }
        });
        return;
      }
      const temp = `${target}.tmp`;
      const stream = fs.createWriteStream(temp);
      response.pipe(stream);
      stream.on('finish', () => {
        stream.close();
        fs.renameSync(temp, target);
        resolve(target);
      });
      stream.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('语音生成超时')));
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

class VoiceEngine {
  constructor(options = {}) {
    this.root = options.root;
    this.resourceDir = options.resourceDir;
    this.dataDir = options.dataDir;
    this.port = Number(options.port || 7865);
    this.installer = options.installer;
    this.process = null;
    this.serviceStartedAt = 0;
    this.startupLogs = [];
    this.installProcess = null;
    this.installState = { status: 'idle', progress: 0, phase: '等待安装', logs: [] };
    this.settingsFile = path.join(this.dataDir, 'voice-settings.json');
    this.customVoiceDir = path.join(this.dataDir, 'custom-voices');
    this.customVoiceFile = path.join(this.customVoiceDir, 'voices.json');
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.customVoiceDir, { recursive: true });
  }

  pythonPath() { return path.join(this.root, 'python', 'python.exe'); }
  modelPath() { return path.join(this.root, 'models', 'CosyVoice-300M-Instruct'); }
  sourcePath() { return path.join(this.root, 'CosyVoice'); }
  ready() {
    return fs.existsSync(this.pythonPath()) && fs.existsSync(path.join(this.modelPath(), 'cosyvoice.yaml')) && fs.existsSync(path.join(this.sourcePath(), 'cosyvoice', 'cli', 'cosyvoice.py'));
  }

  loadSettings() {
    try { return this.sanitizeSettings(JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'))); }
    catch { return this.sanitizeSettings({}); }
  }

  loadCustomVoices() {
    let items = [];
    try { items = JSON.parse(fs.readFileSync(this.customVoiceFile, 'utf8')); } catch {}
    if (!Array.isArray(items)) return [];
    return items.slice(0, 40).map((item) => ({
      id: String(item?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
      label: String(item?.label || '我的声音').trim().slice(0, 60),
      speaker: '自定义复刻',
      description: String(item?.description || '本地参考音频复刻').trim().slice(0, 120),
      instruction: String(item?.instruction || '自然、生活化地表达，保留真实呼吸和语义重音。').trim().slice(0, 340),
      previewText: String(item?.previewText || item?.promptText || '这是一段由本地参考音频复刻的声音。').trim().slice(0, 200),
      promptText: String(item?.promptText || '').trim().slice(0, 1000),
      referenceFile: path.basename(String(item?.referenceFile || '')),
      speed: Math.min(1.3, Math.max(0.75, Number(item?.speed) || 1)),
      pauseScale: Math.min(1.4, Math.max(0.7, Number(item?.pauseScale) || 1)),
      variation: Math.min(0.02, Math.max(0, Number(item?.variation) || 0.012)),
      custom: true,
    })).filter((item) => item.id && item.promptText && item.referenceFile && fs.existsSync(path.join(this.customVoiceDir, item.referenceFile)));
  }

  profiles() { return [...VOICE_PROFILES, ...this.loadCustomVoices()]; }
  findProfile(profileId) { return this.profiles().find((item) => item.id === profileId) || VOICE_PROFILES[0]; }

  saveCustomVoice(input = {}) {
    const name = String(input.name || '').trim().slice(0, 48);
    const promptText = normalizeSpeechText(input.promptText).slice(0, 1000);
    const match = /^data:(audio\/(?:wav|wave|x-wav|mpeg|mp4|x-m4a|flac));base64,([A-Za-z0-9+/=]+)$/.exec(String(input.audioData || ''));
    if (!name) throw new Error('请填写自定义声音名称');
    if (promptText.length < 4) throw new Error('请填写参考音频中实际说出的文字');
    if (!match) throw new Error('请上传 WAV、MP3、M4A 或 FLAC 参考音频');
    const audio = Buffer.from(match[2], 'base64');
    if (audio.length < 1024) throw new Error('参考音频内容过短或文件无效');
    if (audio.length > 20 * 1024 * 1024) throw new Error('参考音频不能超过 20MB');
    const extension = match[1].includes('wav') ? '.wav' : match[1].includes('mpeg') ? '.mp3' : match[1].includes('flac') ? '.flac' : '.m4a';
    const id = `custom_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const referenceFile = `${id}${extension}`;
    fs.writeFileSync(path.join(this.customVoiceDir, referenceFile), audio);
    const items = this.loadCustomVoices();
    items.push({
      id, label: `${name} · 我的声音`, description: '用户参考音频 · 完全本地零样本复刻', promptText,
      previewText: promptText, referenceFile, custom: true, speed: 1, pauseScale: 1, variation: 0.012,
    });
    const temp = `${this.customVoiceFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(items, null, 2), 'utf8');
    fs.renameSync(temp, this.customVoiceFile);
    return this.findProfile(id);
  }

  sanitizeSettings(input = {}) {
    const profile = this.findProfile(input.profileId);
    return {
      enabled: input.enabled !== false,
      profileId: profile.id,
      replaceNativeSpeech: input.replaceNativeSpeech !== false,
      nativeAudioVolume: Math.min(1, Math.max(0, Number(input.nativeAudioVolume ?? 0.12))),
      speechVolume: Math.min(2, Math.max(0.1, Number(input.speechVolume ?? 1))),
      speed: Math.min(1.3, Math.max(0.75, Number(input.speed ?? profile.speed))),
      pauseScale: Math.min(1.4, Math.max(0.7, Number(input.pauseScale ?? profile.pauseScale ?? 1))),
      variation: Math.min(0.02, Math.max(0, Number(input.variation ?? profile.variation ?? 0.008))),
      instruction: String(input.instruction || '').trim().slice(0, 340),
    };
  }

  saveSettings(input) {
    const value = this.sanitizeSettings(input);
    const temp = `${this.settingsFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temp, this.settingsFile);
    return value;
  }

  async ping() {
    try { const value = await requestJson(this.port, '/health', { timeout: 2000 }); return value.ready === true; }
    catch { return false; }
  }

  async status() {
    const running = await this.ping();
    const loading = !running && Boolean(this.process && this.process.exitCode == null);
    return {
      ready: this.ready(), running, root: this.root,
      model: 'CosyVoice 300M Instruct', license: 'Apache-2.0', prosody: 'Natural Prosody 2.0',
      voices: this.profiles().map(({ referenceFile, promptText, ...profile }) => profile), settings: this.loadSettings(), install: this.installState,
      service: {
        status: running ? 'running' : loading ? 'loading' : 'stopped',
        startedAt: this.serviceStartedAt || 0,
        elapsedSeconds: this.serviceStartedAt ? Math.max(0, Math.round((Date.now() - this.serviceStartedAt) / 1000)) : 0,
        logs: (this.startupLogs || []).slice(-12),
      },
      customVoiceCount: this.loadCustomVoices().length,
    };
  }

  startInstall() {
    if (this.installProcess && this.installProcess.exitCode == null) return this.installState;
    this.installState = { status: 'running', progress: 1, phase: '准备语音环境', logs: [] };
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.installer, '-InstallRoot', this.root], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.installProcess = child;
    const onData = (chunk) => {
      const lines = String(chunk).replace(/\r/g, '').split('\n').filter(Boolean);
      for (const line of lines) {
        const match = /^##progress\s+(\d+)\s+(.+)$/.exec(line);
        if (match) { this.installState.progress = Number(match[1]); this.installState.phase = match[2]; }
        this.installState.logs.push(line);
        if (this.installState.logs.length > 120) this.installState.logs.shift();
      }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('error', (error) => { this.installState.status = 'failed'; this.installState.phase = error.message; });
    child.on('close', (code) => {
      this.installProcess = null;
      this.installState.status = code === 0 && this.ready() ? 'completed' : 'failed';
      this.installState.progress = this.installState.status === 'completed' ? 100 : this.installState.progress;
      this.installState.phase = this.installState.status === 'completed' ? 'CosyVoice 已就绪' : `语音环境安装失败（退出码 ${code}）`;
    });
    return this.installState;
  }

  async ensureServer(onLog) {
    if (await this.ping()) return true;
    if (!this.ready()) throw new Error('CosyVoice 尚未安装，请先在语音面板点击“一键安装”');
    if (!this.process || this.process.exitCode != null) {
      const script = path.join(this.resourceDir, 'voice-service.py');
      const cacheRoot = path.join(this.root, 'cache');
      fs.mkdirSync(path.join(cacheRoot, 'huggingface'), { recursive: true });
      fs.mkdirSync(path.join(cacheRoot, 'modelscope'), { recursive: true });
      this.startupLogs = [];
      this.serviceStartedAt = Date.now();
      this.process = spawn(this.pythonPath(), [script, '--port', String(this.port), '--source', this.sourcePath(), '--model', this.modelPath()], {
        cwd: this.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: '-1',
          OMP_NUM_THREADS: String(Math.max(2, Math.min(12, require('node:os').cpus().length - 2))),
          PYTHONUNBUFFERED: '1',
          HF_HOME: path.join(cacheRoot, 'huggingface'),
          MODELSCOPE_CACHE: path.join(cacheRoot, 'modelscope'),
        },
      });
      const record = (chunk) => {
        const line = String(chunk).trim();
        if (!line) return;
        this.startupLogs.push(line);
        if (this.startupLogs.length > 40) this.startupLogs.shift();
        onLog?.(`[CosyVoice] ${line}\n`);
      };
      this.process.stdout.on('data', record);
      this.process.stderr.on('data', record);
    }
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      if (await this.ping()) return true;
      if (!this.process || this.process.exitCode != null) {
        const detail = (this.startupLogs || []).slice(-8).join('\n');
        throw new Error(`CosyVoice 启动失败${detail ? `：\n${detail}` : ''}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('CosyVoice 首次 CPU 载入超过 10 分钟，模型仍会在后台继续载入；稍后再试，或在语音状态中查看启动日志');
  }

  async synthesize(text, profileId, target, options = {}) {
    const profile = this.findProfile(profileId);
    const clean = normalizeSpeechText(text);
    if (!clean) throw new Error('没有可生成的语音文字');
    await this.ensureServer(options.onLog);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    return requestFile(this.port, '/synthesize', {
      text: clean, speaker: profile.speaker,
      instruction: naturalInstruction(profile, options.instruction),
      speed: Number(options.speed || profile.speed),
      pauseScale: Number(options.pauseScale || profile.pauseScale || 1),
      variation: Number(options.variation ?? profile.variation ?? 0.015),
      customVoice: profile.custom ? {
        referencePath: path.join(this.customVoiceDir, profile.referenceFile), promptText: profile.promptText,
      } : null,
    }, target);
  }

  shutdown() {
    try { this.process?.kill(); } catch {}
    this.process = null;
  }
}

module.exports = { VoiceEngine, VOICE_PROFILES, normalizeSpeechText, naturalInstruction };
