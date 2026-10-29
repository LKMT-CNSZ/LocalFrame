import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
let renderer, scene, camera, controls, model, ground, keyLight, busy = false;
let activeUrls = [], loadSerial = 0;
const material = new THREE.MeshStandardMaterial({ color: '#e5e5e0', roughness: 0.8, side: THREE.DoubleSide });
const originals = new Map();
function render() { if (renderer) renderer.render(scene, camera); }
function resize() {
  if (!renderer) return;
  const box = $('viewport').getBoundingClientRect();
  if (!box.width || !box.height) return;
  renderer.setSize(box.width, box.height);
  camera.aspect = box.width / box.height; camera.updateProjectionMatrix(); render();
}
function initialize() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  $('viewport').append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); status('显卡上下文丢失，请重新打开白模渲染页面。'); });
  scene = new THREE.Scene(); scene.background = new THREE.Color($('background').value);
  camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  controls = new OrbitControls(camera, renderer.domElement); controls.addEventListener('change', render);
  scene.add(new THREE.HemisphereLight(0xe7f1ff, 0x3d3025, 2));
  keyLight = new THREE.DirectionalLight(0xffeed6, Number($("light").value)); keyLight.position.set(3, 5, 4);
  keyLight.castShadow = true; keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -3; keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 3; keyLight.shadow.camera.bottom = -3;
  keyLight.shadow.normalBias = 0.02; scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0xb8d4ff, 1.5); fill.position.set(-3, 2, -2); scene.add(fill);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x454950, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  new ResizeObserver(resize).observe($('viewport'));
  setView('iso'); resize();
}
function disposeObject(object) {
  const seen = new Set();
  object.traverse(node => {
    if (node.geometry && !seen.has(node.geometry)) { node.geometry.dispose(); seen.add(node.geometry); }
    const mats = originals.get(node) || node.material;
    for (const mat of [].concat(mats || [])) {
      if (mat === material || seen.has(mat)) continue;
      for (const item of Object.values(mat)) if (item?.isTexture && !seen.has(item)) { item.dispose(); seen.add(item); }
      mat.dispose(); seen.add(mat);
    }
  });
}
function useModel(object, name) {
  let triangles = 0, meshes = 0;
  object.traverse(node => {
    if (node.isMesh) { meshes++; triangles += (node.geometry.index?.count || node.geometry.attributes.position?.count || 0) / 3; }
  });
  if (!meshes || !triangles) { disposeObject(object); throw new Error('文件没有可渲染的三角网格。'); }
  if (triangles > 2000000) { disposeObject(object); throw new Error('模型超过 200 万三角面，请先减面后导入。'); }
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(max) || max < 1e-8) { disposeObject(object); throw new Error('模型尺寸为空或无效。'); }
  if (model) { scene.remove(model); disposeObject(model); originals.clear(); }
  // A parent wrapper preserves all original node transforms and shared geometry.
  model = new THREE.Group(); model.add(object);
  const scale = 2 / max; model.scale.setScalar(scale);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  // Put the centered object in a pivot so rotating it stays above the ground.
  const pivot = new THREE.Group(); pivot.add(model); model = pivot;
  model.traverse(node => { if (node.isMesh) { originals.set(node, node.material); node.castShadow = true; node.receiveShadow = true; } });
  scene.add(model); $('rotation').value = '0'; updateMaterial(); setView('iso');
  $('stats').textContent = `${name} · ${meshes} 个网格 · ${Math.round(triangles).toLocaleString()} 个三角面 · 已归一化预览，原文件未修改`;
  $('export').disabled = false; $('ai').disabled = busy;
  status('模型已载入。左键旋转、右键平移、滚轮缩放；可导出当前视角或生成 AI 效果图。');
}
function updateMaterial() {
  material.color.set($('color').value); material.roughness = Number($('roughness').value);
  material.metalness = $('material').value === 'metal' ? 0.85 : 0;
  if (model) model.traverse(node => { if (node.isMesh) node.material = $('material').value === 'original' ? originals.get(node) : material; });
  render();
}
function setView(view) {
  const locations = { iso: [3.4, 2.7, 3.4], front: [0, 1, 5], side: [5, 1, 0], top: [0, 5.5, 0.001] };
  camera.position.set(...(locations[view] || locations.iso)); controls.target.set(0, 0.8, 0); controls.update(); render();
}
async function importFiles(files) {
  const serial = ++loadSerial;
  const entries = [...files];
  const main = entries.filter(file => /\.(glb|gltf|obj|stl)$/i.test(file.name));
  if (main.length !== 1) throw new Error('每次请选择一个模型；GLTF 可以同时选择其 .bin 与贴图。');
  if (main[0].size > 100 * 1024 ** 2 || entries.reduce((sum, f) => sum + f.size, 0) > 200 * 1024 ** 2) throw new Error('文件过大：模型上限 100MB，附件总计上限 200MB。');
  initialize(); status('正在解析模型，请稍候…');
  const urls = [];
  try {
    const map = new Map();
    for (const file of entries) {
      const key = file.name.toLowerCase();
      if (map.has(key)) throw new Error('附件存在同名文件，请改名并更新 GLTF 引用后重试。');
      const url = URL.createObjectURL(file); urls.push(url); map.set(key, url);
    }
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => {
      if (/^data:(image\/(png|jpeg|webp)|application\/octet-stream);base64,/i.test(url)) return url;
      if (url.startsWith(`blob:${location.origin}/`)) return url;
      if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(url)) throw new Error('模型引用了远程或外部路径，已阻止。请导出为自包含 GLB。');
      const name = decodeURIComponent(url.replace(/\\/g, '/').split('/').pop()).toLowerCase();
      if (!map.has(name)) throw new Error(`缺少配套文件：${name}。请与模型一起选择。`);
      return map.get(name);
    });
    const file = main[0], extension = file.name.split('.').pop().toLowerCase();
    let object;
    if (extension === 'obj') object = new OBJLoader(manager).parse(await file.text());
    else if (extension === 'stl') object = new THREE.Mesh(new STLLoader(manager).parse(await file.arrayBuffer()), new THREE.MeshStandardMaterial());
    else object = (await new GLTFLoader(manager).parseAsync(extension === 'gltf' ? await file.text() : await file.arrayBuffer(), '')).scene;
    if (serial !== loadSerial) { disposeObject(object); return; }
    useModel(object, file.name);
  } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
}
function snapshot(width, height) {
  if (!model) throw new Error('请先导入模型。');
  const size = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio(), aspect = camera.aspect;
  try {
    renderer.setPixelRatio(1); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
    return renderer.domElement.toDataURL('image/png');
  } finally { renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y, false); camera.aspect = aspect; camera.updateProjectionMatrix(); render(); }
}
function selectedSnapshot() { return snapshot(...$('size').value.split('x').map(Number)); }
function download(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
function demo() {
  ++loadSerial; initialize();
  const group = new THREE.Group();
  function box(w,h,d,x,y,z) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial()); mesh.position.set(x,y,z); group.add(mesh); }
  box(3,0.15,2.2,0,0.075,0); box(2.7,1.6,0.1,0,0.95,-1); box(0.1,1.6,2, -1.3,0.95,0);
  box(2.8,0.15,2.1,0,1.8,0); box(0.12,1.7,0.12,1.2,0.95,0.9); box(1.2,0.5,0.55,-0.55,0.4,-0.4);
  box(0.7,0.38,0.55,0.5,0.34,0.35); useModel(group, '示例 · 建筑空间白模');
}
async function aiRender() {
  if (busy) return;
  if (!$('consent').checked) throw new Error('请先确认上传当前画面与可能产生的 API 费用。');
  if (!$('apiUrl').value || !$('apiModel').value || !$('prompt').value.trim()) throw new Error('请填写图像编辑 API 地址、模型和效果描述。');
  // Letterbox a full-resolution camera render, never stretch its geometry.
  const image = new Image(); image.src = selectedSnapshot(); await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = $('background').value; ctx.fillRect(0,0,1024,1024);
  const scale = Math.min(1024/image.width,1024/image.height), w=image.width*scale,h=image.height*scale;
  ctx.drawImage(image,(1024-w)/2,(1024-h)/2,w,h);
  const payload = { baseUrl: $('apiUrl').value, model: $('apiModel').value, apiKey: $('apiKey').value,
    prompt: $('prompt').value, image: canvas.toDataURL('image/png'), confirmed: true };
  busy = true; $('ai').disabled = true; status('AI 服务处理中；耗时由服务商决定，不显示虚构进度。');
  try {
    const response = await fetch('/api/white-model/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'AI 渲染失败');
    $('resultImage').src = result.image; $('download').href = result.image; $('result').hidden = false;
    $('resultInfo').textContent = `模型 ${payload.model} · 原生输出 ${result.width} × ${result.height} · 基于点击生成时的视角，后续修改白模不会自动更新此图`;
    status('AI 效果图已返回。请检查结构与细节；原始白模未修改。');
  } finally { busy = false; $('ai').disabled = !model; }
}
const modelMemory = LastSettings.create('localframe.last.whiteModel.v1', ['material', 'color', 'roughness', 'light', 'background', 'size', 'apiUrl', 'apiModel', 'prompt']);
modelMemory.restore();
modelMemory.listen();
modelMemory.notice(document.querySelector('.settings .muted'));
function guarded(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(error => status(`未完成：${error.message}`)); }
$('files').addEventListener('change', guarded(e => importFiles(e.target.files)));
$('demo').addEventListener('click', guarded(demo));
$('material').addEventListener('change', () => { const presets = { white:['#e5e5e0',0.8], concrete:['#aaa59b',1], metal:['#a8b5be',0.25], clay:['#b47d64',0.9] }; const preset=presets[$('material').value]; if (preset) { $('color').value=preset[0]; $('roughness').value=preset[1]; } updateMaterial(); });
for (const id of ['color','roughness']) $(id).addEventListener('input', updateMaterial);
$('light').addEventListener('input', () => { if (keyLight) { keyLight.intensity=Number($('light').value); render(); } });
$('rotation').addEventListener('input', () => { if (model) { model.rotation.y=THREE.MathUtils.degToRad(Number($('rotation').value)); render(); } });
$('background').addEventListener('input', () => { if (scene) { scene.background.set($('background').value); render(); } });
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', guarded(() => { initialize(); setView(button.dataset.view); })));
$('export').addEventListener('click', guarded(() => { download(selectedSnapshot(), `LocalFrame-standard-${Date.now()}.png`); status('标准渲染 PNG 已提交保存。'); }));
$('ai').addEventListener('click', guarded(aiRender));
// No perpetual animation loop: rendering only occurs when the user changes the view.
window.addEventListener('pagehide', () => { $('apiKey').value=''; activeUrls.forEach(URL.revokeObjectURL); });
