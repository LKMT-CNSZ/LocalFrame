'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { QualityEnhancer } = require('../resources/h3-studio/app/quality-enhancer');

async function main() {
  const input = path.resolve(process.argv[2] || '');
  const width = Number(process.argv[3] || 2560);
  const height = Number(process.argv[4] || 1440);
  const mode = process.argv[5] || 'realesrgan';
  if (!fs.existsSync(input)) throw new Error(`输入视频不存在：${input}`);
  const tools = 'D:\\AI\\ComfyUI-H3\\tools\\ffmpeg\\bin';
  const enhancer = new QualityEnhancer({
    ffmpeg: path.join(tools, 'ffmpeg.exe'),
    ffprobe: path.join(tools, 'ffprobe.exe'),
    tempRoot: path.resolve('output', '.enhancer-temp'),
  });
  fs.mkdirSync(path.resolve('output', '.enhancer-temp'), { recursive: true });
  const status = enhancer.status();
  if (!status.modes[mode]?.ready) throw new Error(`${mode} 后端尚未就绪`);
  const output = await enhancer.enhance(input, {
    upscale: true, outputWidth: width, outputHeight: height, generateAudio: true,
    enhancement: { mode, profile: 'balanced' },
  }, {
    onLog: (text) => process.stdout.write(text),
    onProgress: (value) => process.stdout.write(`\n[${Math.round(value.progress)}%] ${value.phase}\n`),
  });
  const verification = await enhancer.probe(output);
  process.stdout.write(`${JSON.stringify({ ok: true, input, output, verification }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
