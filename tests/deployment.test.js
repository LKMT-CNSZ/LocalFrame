'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeploymentAssessment, assertInstallAllowed } = require('../resources/h3-studio/app/deployment');

function readyComponents() {
  return [
    { label: 'ComfyUI', required: true, ready: true },
    { label: 'H3 主模型', required: true, ready: true },
  ];
}

test('approves a capable Windows NVIDIA computer for one-click H3 deployment', () => {
  const assessment = buildDeploymentAssessment({
    platform: 'win32', memoryGb: 32,
    gpus: [{ name: 'NVIDIA RTX 4070', vendor: 'nvidia', vramGb: 12, computeCapability: '8.9', driver: '555.1' }],
    storage: { drive: 'D:', freeGb: 120, fast: true },
  }, [], { arch: 'x64' });
  assert.equal(assessment.compatible, true);
  assert.equal(assessment.plan.id, 'h3_int8');
  assert.equal(assessment.requirements.minFreeGb, 55);
  assert.doesNotThrow(() => assertInstallAllowed(assessment));
});

test('returns concrete blockers instead of starting an incompatible deployment', () => {
  const assessment = buildDeploymentAssessment({
    platform: 'win32', memoryGb: 8, gpus: [], storage: { drive: 'C:', freeGb: 20, fast: false },
  }, [], { arch: 'x64' });
  assert.equal(assessment.compatible, false);
  assert.ok(assessment.blockers.some((item) => item.includes('NVIDIA')));
  assert.ok(assessment.blockers.some((item) => item.includes('剩余 20 GB')));
  assert.throws(() => assertInstallAllowed(assessment), /暂时无法开始一键部署/);
});

test('allows verification and repair when the environment is already complete', () => {
  const assessment = buildDeploymentAssessment({
    platform: 'win32', memoryGb: 16, gpus: [], storage: { drive: 'D:', freeGb: 2, fast: true },
  }, readyComponents(), { arch: 'x64' });
  assert.equal(assessment.alreadyReady, true);
  assert.match(assessment.summary, /完整就绪/);
  assert.doesNotThrow(() => assertInstallAllowed(assessment));
});
