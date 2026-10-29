'use strict';
const fs = require('node:fs');
const path = require('node:path');
const localImage = require('../resources/h3-studio/app/local-image');
const comfyDir = 'D:\\AI\\ComfyUI-H3\\ComfyUI_windows_portable\\ComfyUI';
const comfy = { baseUrl: 'http://127.0.0.1:8188', outputDir: path.join(comfyDir, 'output'), isBusy: () => false, ensureServer: async () => {} };
(async () => {
  const width = Number(process.env.QWEN_TEST_WIDTH || 512), steps = Number(process.env.QWEN_TEST_STEPS || 4);
  const result = await localImage.generate({ engine: 'qwen-image-2.1', variant: 'Q6_K', prompt: 'A small orange lantern on a wooden table, soft daylight, no text.', negative: '', width, height: width, steps, seed: 42 }, comfy, comfyDir);
  const file = path.join(__dirname, '..', 'output', `qwen-image-2.1-q6k-${width}-${steps}-validation.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(result.image.split(',')[1], 'base64'));
  console.log(JSON.stringify({ file, model: result.model, seed: result.seed, bytes: fs.statSync(file).size }));
})().catch(error => { console.error(error); process.exitCode = 1; });
