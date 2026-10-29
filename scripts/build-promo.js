'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { VoiceEngine } = require('../resources/h3-studio/app/voice-engine');

const ROOT = path.resolve(__dirname, '..');
const PROMO = path.join(ROOT, 'promo');
const BUILD = path.join(PROMO, 'build');
const OUTPUT = path.join(PROMO, 'LocalFrame-Promo-140s.mp4');
const FFMPEG = process.env.LOCALFRAME_FFMPEG || 'D:\\AI\\ComfyUI-H3\\tools\\ffmpeg\\bin\\ffmpeg.exe';
const FFPROBE = process.env.LOCALFRAME_FFPROBE || 'D:\\AI\\ComfyUI-H3\\tools\\ffmpeg\\bin\\ffprobe.exe';
const FONT = process.env.LOCALFRAME_PROMO_FONT || 'C:\\Windows\\Fonts\\msyh.ttc';
const VOICE_ROOT = process.env.LOCALFRAME_VOICE_ROOT || 'D:\\AI\\LocalFrame-Voice';

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`[promo] ${label}\n`);
    const child = spawn(command, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-8000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${label} failed (${code})\n${tail}`)));
  });
}

function ffFilterPath(value) {
  return path.resolve(value).replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:').replace(/'/g, "\\'");
}

async function durationOf(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(Number(output.trim())) : reject(new Error(`ffprobe failed for ${file}`)));
  });
}

async function main() {
  if (!fs.existsSync(FFMPEG) || !fs.existsSync(FFPROBE)) throw new Error('FFmpeg is not installed');
  if (!fs.existsSync(FONT)) throw new Error(`Chinese font is missing: ${FONT}`);
  fs.mkdirSync(BUILD, { recursive: true });
  const scenes = JSON.parse(fs.readFileSync(path.join(PROMO, 'scenes.json'), 'utf8'));
  const voice = new VoiceEngine({
    root: VOICE_ROOT,
    resourceDir: path.join(ROOT, 'resources', 'h3-studio', 'voice-studio'),
    dataDir: path.join(BUILD, 'voice-data'),
    installer: path.join(ROOT, 'resources', 'h3-studio', 'install-cosyvoice.ps1'),
    port: 7866,
  });
  if (!voice.ready()) throw new Error('CosyVoice is not ready. Run resources/h3-studio/install-cosyvoice.ps1 first.');

  const clips = [];
  try {
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const stem = String(index + 1).padStart(2, '0');
      const image = path.join(ROOT, scene.image);
      if (!fs.existsSync(image)) throw new Error(`Promo image is missing: ${scene.image}`);
      const wav = path.join(BUILD, `${stem}-voice.wav`);
      const titleFile = path.join(BUILD, `${stem}-title.txt`);
      const subtitleFile = path.join(BUILD, `${stem}-subtitle.txt`);
      const clip = path.join(BUILD, `${stem}-scene.mp4`);
      fs.writeFileSync(titleFile, scene.title, 'utf8');
      fs.writeFileSync(subtitleFile, scene.subtitle, 'utf8');
      if (!fs.existsSync(wav)) {
        await voice.synthesize(scene.narration, 'female_narrator', wav, {
          speed: 1.02,
          instruction: '温暖、可信、富有电影感的中文产品宣传片旁白。吐字清晰，停顿自然，克制但有力量。',
          onLog: (line) => process.stdout.write(line),
        });
      }
      const voiceSeconds = await durationOf(wav);
      if (voiceSeconds > scene.seconds - 0.25) {
        throw new Error(`Scene ${stem} narration is ${voiceSeconds.toFixed(2)}s but the scene is ${scene.seconds}s. Shorten its narration.`);
      }
      const filter = [
        `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=24:6,eq=brightness=-0.18:saturation=0.72[bg]`,
        `[0:v]scale=1660:830:force_original_aspect_ratio=decrease:flags=lanczos[fg]`,
        `[bg][fg]overlay=(W-w)/2:(H-h)/2-38,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.16:t=fill,` +
          `drawbox=x=0:y=h-285:w=iw:h=285:color=0x07090D@0.86:t=fill,` +
          `drawbox=x=84:y=h-246:w=7:h=142:color=0xFF6B3D@0.95:t=fill,` +
          `drawtext=fontfile='${ffFilterPath(FONT)}':textfile='${ffFilterPath(titleFile)}':fontcolor=white:fontsize=58:x=116:y=h-242:shadowcolor=black@0.55:shadowx=2:shadowy=3,` +
          `drawtext=fontfile='${ffFilterPath(FONT)}':textfile='${ffFilterPath(subtitleFile)}':fontcolor=0xC8CED8:fontsize=29:x=118:y=h-154,` +
          `drawtext=fontfile='${ffFilterPath(FONT)}':text='LOCALFRAME':fontcolor=0xFF8B60:fontsize=22:x=w-tw-72:y=56,` +
          `zoompan=z='min(zoom+0.00016,1.018)':d=${Math.round(scene.seconds * 30)}:s=1920x1080:fps=30,format=yuv420p[v]`,
        `[1:a]aresample=48000,apad=whole_dur=${scene.seconds},atrim=duration=${scene.seconds},loudnorm=I=-16:LRA=7:TP=-1.5,aresample=48000[a]`,
      ].join(';');
      await run(FFMPEG, [
        '-y', '-hide_banner', '-loglevel', 'warning', '-loop', '1', '-framerate', '30', '-i', image, '-i', wav,
        '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', String(scene.seconds),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', clip,
      ], `rendering scene ${stem}/${scenes.length}`);
      clips.push(clip);
    }

    const concat = path.join(BUILD, 'concat.txt');
    fs.writeFileSync(concat, clips.map((file) => `file '${file.replace(/'/g, "''")}'`).join('\r\n'), 'utf8');
    const joined = path.join(BUILD, 'joined.mp4');
    await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', joined], 'joining promo scenes');
    const total = scenes.reduce((sum, scene) => sum + scene.seconds, 0);
    const music = `aevalsrc=0.055*sin(2*PI*110*t)+0.032*sin(2*PI*164.81*t)+0.02*sin(2*PI*220*t)+0.012*sin(2*PI*329.63*t):s=48000:d=${total}`;
    await run(FFMPEG, [
      '-y', '-hide_banner', '-loglevel', 'warning', '-i', joined, '-f', 'lavfi', '-i', music,
      '-filter_complex', `[0:a]volume=1[n];[1:a]lowpass=f=1800,volume=0.22,afade=t=in:st=0:d=3,afade=t=out:st=${total - 5}:d=5[m];[n][m]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-14:LRA=8:TP=-1.2,aresample=48000[a]`,
      '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '256k', '-movflags', '+faststart', OUTPUT,
    ], 'mixing narration and original music');
    const finalSeconds = await durationOf(OUTPUT);
    if (Math.abs(finalSeconds - total) > 0.5) throw new Error(`Unexpected promo duration: ${finalSeconds}s`);
    process.stdout.write(`[promo] completed: ${OUTPUT} (${finalSeconds.toFixed(2)}s)\n`);
  } finally {
    voice.shutdown();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
