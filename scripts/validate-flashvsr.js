'use strict';

const path = require('node:path');
const { QualityEnhancer } = require('../resources/h3-studio/app/quality-enhancer');

async function main() {
  const root = path.resolve(__dirname, '..');
  const input = path.resolve(process.argv[2] || path.join(root, 'output', 'FlashVSR-test-input-2frames-256x160.mp4'));
  const ffmpegRoot = process.env.LOCALFRAME_FFMPEG_ROOT || 'D:\\AI\\ComfyUI-H3\\tools\\ffmpeg\\bin';
  const enhancer = new QualityEnhancer({
    ffmpeg: path.join(ffmpegRoot, 'ffmpeg.exe'),
    ffprobe: path.join(ffmpegRoot, 'ffprobe.exe'),
    tempRoot: path.join(root, 'diagnostics'),
  });
  const output = await enhancer.enhance(input, {
    upscale: true,
    outputWidth: 1024,
    outputHeight: 640,
    generateAudio: true,
    enhancement: { mode: 'flashvsr', profile: 'balanced' },
  }, {
    onLog: (value) => process.stdout.write(value),
    onProgress: (value) => process.stdout.write(`[progress] ${JSON.stringify(value)}\n`),
  });
  const result = await enhancer.probe(output);
  process.stdout.write(`${JSON.stringify({ ok: true, input, output, result }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
