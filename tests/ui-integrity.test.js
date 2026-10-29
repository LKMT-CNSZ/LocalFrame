'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every front-end id binding exists once in the studio document', () => {
  const root = path.join(__dirname, '..', 'resources', 'h3-studio', 'app', 'public');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const bindings = [...script.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missing = [...new Set(bindings.filter((id) => !ids.includes(id)))];
  assert.deepEqual([...new Set(duplicates)], []);
  assert.deepEqual(missing, []);
  assert.match(html, /data-app-mode="workflow"/);
  assert.match(html, /data-app-mode="white-model"/);
  assert.match(html, /id="whiteModelWorkspace"/);
  assert.match(html, /data-src="\/white-model\.html"/);
  assert.match(script, /white-model/);
  assert.match(script, /startWorkflowProduction/);
  assert.match(html, /id="workflowCharacterModels"/);
  assert.match(html, /角色三视图与定妆模型/);
  assert.match(script, /confirmWorkflowCharacter/);
  assert.match(html, /id="workflowGenerationQuality"/);
  assert.match(html, /id="workflowGenerationSteps"/);
  assert.match(html, /id="workflowShotSeconds"/);
  assert.match(html, /id="workflowContinuity"/);
  assert.match(html, /id="workflowAudioMode"/);
  assert.match(script, /独立短分镜/);
  assert.match(script, /recoverLocalBackend/);
  assert.match(preload, /restartBackend/);
  assert.match(main, /scheduleBackendRestart/);
  assert.match(main, /startTaskNotificationMonitor/);
  assert.match(main, /视频生成完成/);
  assert.match(main, /视频生成失败/);
  assert.match(html, /H3 本地部署中心/);
  assert.match(html, /id="deploymentCheckGrid"/);
  assert.match(script, /chooseInstallRoot/);
  assert.match(preload, /deployment:choose-root/);
  assert.match(html, /data-engine="kling-platform"/);
  assert.match(html, /id="platformHandoffBar"/);
  assert.match(script, /preparePlatformHandoff/);
  assert.match(preload, /platform:prepare/);
  assert.match(main, /beginPlatformWatch/);
});

test('every desktop workspace remains vertically scrollable when its content grows', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'resources', 'h3-studio', 'app', 'public', 'app.css'), 'utf8');
  const desktopRules = css.match(/@media \(min-width: 901px\) \{([\s\S]*?)\n\}/)?.[1] || '';
  for (const workspace of ['professional-workspace', 'workflow-workspace', 'post-workspace']) {
    assert.match(desktopRules, new RegExp(`\\.${workspace}[^{}]*\\{[^{}]*overflow-y:\\s*auto`), `${workspace} must scroll on desktop`);
    assert.match(desktopRules, new RegExp(`\\.${workspace}::\\-webkit-scrollbar`), `${workspace} must expose a desktop scrollbar`);
  }
  assert.match(css, /#whiteModelWorkspace[^{}]*\{[^{}]*height:\s*100%/);
  assert.match(css, /#whiteModelFrame[^{}]*\{[^{}]*height:\s*100%/);
});

test('white model studio ships an isolated local renderer and explicit AI consent', () => {
  const root = path.join(__dirname, '..', 'resources', 'h3-studio', 'app', 'public');
  const html = fs.readFileSync(path.join(root, 'white-model.html'), 'utf8');
  const bundle = fs.readFileSync(path.join(root, 'white-model.bundle.js'));
  assert.match(html, /accept="\.glb,\.gltf,\.obj,\.stl/);
  assert.match(html, /id="consent"/);
  assert.match(html, /可能产生费用/);
  assert.match(html, /标准渲染为本地 WebGL\/PBR 实时渲染/);
  assert.ok(bundle.length > 100000, 'Three.js renderer bundle should be built');
  assert.ok(fs.existsSync(path.join(root, 'three-LICENSE.txt')));
});
