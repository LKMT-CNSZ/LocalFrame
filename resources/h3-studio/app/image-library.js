'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SAVED_NAME = /^image-[a-f0-9-]{36}\.png$/;
const LEGACY_NAME = /^LocalFrame-(?:image|Qwen-Image-2\.1)_[a-zA-Z0-9_-]+\.png$/;
const PNG_SIGNATURE = '89504e470d0a1a0a';

function dimensions(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) throw new Error('作品不是有效 PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

class ImageLibrary {
  constructor(outputDir, comfyOutputDir) {
    this.dir = path.join(outputDir, 'images');
    this.comfyOutputDir = comfyOutputDir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  save(buffer, details = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length > 20 * 1024 * 1024) throw new Error('图片文件过大');
    const size = dimensions(buffer);
    const name = `image-${crypto.randomUUID()}.png`;
    const file = path.join(this.dir, name);
    const record = {
      name, engine: ['local', 'qwen-image-2.1', 'api'].includes(details.engine) ? details.engine : 'local',
      model: String(details.model || '').slice(0, 200), prompt: String(details.prompt || '').slice(0, 2000),
      seed: Number.isSafeInteger(details.seed) ? details.seed : null,
      sourceName: LEGACY_NAME.test(String(details.sourceName || '')) ? details.sourceName : '',
      createdAt: new Date().toISOString(), ...size,
    };
    fs.writeFileSync(file, buffer, { flag: 'wx' });
    try { fs.writeFileSync(`${file}.json`, JSON.stringify(record), { flag: 'wx' }); }
    catch (error) { fs.rmSync(file, { force: true }); throw error; }
    return this.describe(file, record);
  }

  describe(file, record = {}) {
    const stat = fs.statSync(file);
    return {
      id: path.basename(file), name: path.basename(file), engine: record.engine || 'local',
      model: record.model || '', prompt: record.prompt || '', seed: record.seed ?? null,
      width: record.width || null, height: record.height || null,
      modifiedAt: stat.mtimeMs, size: stat.size,
      url: `/api/local-image/works/${encodeURIComponent(path.basename(file))}/file`,
    };
  }

  list() {
    const items = [];
    const imported = new Set();
    for (const entry of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isFile() || !SAVED_NAME.test(entry.name)) continue;
      const file = path.join(this.dir, entry.name);
      let record = {};
      try { record = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8')); } catch {}
      if (record.sourceName) imported.add(record.sourceName);
      items.push(this.describe(file, record));
    }
    try {
      for (const entry of fs.readdirSync(this.comfyOutputDir, { withFileTypes: true })) {
        if (!entry.isFile() || !LEGACY_NAME.test(entry.name) || imported.has(entry.name)) continue;
        const file = path.join(this.comfyOutputDir, entry.name);
        items.push(this.describe(file, { engine: entry.name.startsWith('LocalFrame-Qwen-') ? 'qwen-image-2.1' : 'local' }));
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return items.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 200);
  }

  file(id) {
    const name = String(id || '');
    const directory = SAVED_NAME.test(name) ? this.dir : LEGACY_NAME.test(name) ? this.comfyOutputDir : null;
    if (!directory) throw new Error('图片作品路径无效');
    return path.join(directory, name);
  }

  delete(id) {
    const file = this.file(id);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('图片作品不存在或已移动');
    if (SAVED_NAME.test(path.basename(file))) {
      let record = {};
      try { record = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8')); } catch {}
      fs.unlinkSync(file);
      try { fs.unlinkSync(`${file}.json`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (LEGACY_NAME.test(record.sourceName || '')) {
        const source = path.join(this.comfyOutputDir, record.sourceName);
        try { fs.unlinkSync(source); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    } else fs.unlinkSync(file);
  }
}

module.exports = { ImageLibrary, dimensions };
