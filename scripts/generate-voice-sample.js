'use strict';

const path = require('node:path');
const { VoiceEngine } = require('../resources/h3-studio/app/voice-engine');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'promo', 'LocalFrame-Voice-Sample.wav');
const voice = new VoiceEngine({
  root: process.env.LOCALFRAME_VOICE_ROOT || 'D:\\AI\\LocalFrame-Voice',
  resourceDir: path.join(root, 'resources', 'h3-studio', 'voice-studio'),
  dataDir: path.join(root, 'promo', 'build', 'voice-sample-data'),
  installer: path.join(root, 'resources', 'h3-studio', 'install-cosyvoice.ps1'),
  port: 7867,
});

voice.synthesize(
  '从一个想法，到一部完整作品。LocalFrame，让本地创作真正发生。',
  'female_narrator',
  output,
  {
    speed: 1.02,
    instruction: '温暖、可信、富有电影感的中文产品宣传片旁白。吐字清晰，停顿自然，克制但有力量。',
    onLog: (line) => process.stdout.write(line),
  },
).then(() => {
  process.stdout.write(`Voice sample completed: ${output}\n`);
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(() => voice.shutdown());
