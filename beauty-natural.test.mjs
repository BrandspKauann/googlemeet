import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { OneEuroArray } from './dist/face-beautifier/onefilter.js';
import { faceGeometryIsSafe, safeWarpParameters, MAX_TRACKING_AGE_MS } from './dist/face-beautifier/tracking-safety.js';
import { P, IRIS_CENTER_L, IRIS_CENTER_R } from './dist/face-beautifier/landmarks.js';

function face() {
  const points = new Float32Array(956); points.fill(.5);
  const set = (index, x, y) => { points[index * 2] = x; points[index * 2 + 1] = y; };
  set(IRIS_CENTER_L, .6, .35); set(IRIS_CENTER_R, .4, .35);
  set(P.eyeOuterL, .64, .35); set(P.eyeInnerL, .56, .35);
  set(P.eyeOuterR, .36, .35); set(P.eyeInnerR, .44, .35);
  set(P.noseTip, .5, .48); set(P.faceLeft, .75, .45); set(P.faceRight, .25, .45);
  set(P.foreheadTop, .5, .16); set(P.chin, .5, .78);
  return points;
}

test('optional reshape rejects stale tracking, low confidence, invalid pose and asymmetric measurements', () => {
  const points = face(), params = { slim: .4, eyes: .35, nose: .2, chin: 0, lips: 0 };
  const state = { points, confidence: 1, geometrySafe: faceGeometryIsSafe(points, 4 / 3), ageMs: 30 };
  assert.equal(state.geometrySafe, true);
  assert.ok(Math.abs(safeWarpParameters(params, state).slim - .4) < 1e-10);
  for (const patch of [{ ageMs: MAX_TRACKING_AGE_MS + 1 }, { confidence: .4 }, { geometrySafe: false }, { ageMs: NaN }, { points: null }]) {
    const safe = safeWarpParameters(params, { ...state, ...patch });
    assert.equal(safe.slim, 0); assert.equal(safe.eyes, 0); assert.equal(safe.nose, 0);
  }
  const yaw = face(); yaw[P.noseTip * 2] = .68;
  const roll = face(); roll[IRIS_CENTER_L * 2 + 1] = .6;
  const asymmetry = face(); asymmetry[P.eyeInnerR * 2] = .38;
  for (const invalid of [yaw, roll, asymmetry, new Float32Array(20)]) assert.equal(faceGeometryIsSafe(invalid, 4 / 3), false);
});

function trackerSetup({ bitmapFactory } = {}) {
  const workers = [], bitmaps = [], timers = new Map(); let now = 0, timer = 0;
  class Worker {
    constructor(url) { this.url = url; this.messages = []; workers.push(this); }
    postMessage(message, transfer) { this.messages.push({ message, transfer }); }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data }); }
  }
  const source = fs.readFileSync('dist/face-beautifier/facemesh.js', 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export class FaceMesh', 'globalThis.FaceMesh = class FaceMesh');
  const context = {
    Worker, OneEuroArray, NUM_LANDMARKS: 478, faceGeometryIsSafe, MAX_TRACKING_AGE_MS, Float32Array, Number, Promise, Error,
    performance: { now: () => now },
    createImageBitmap(...args) {
      if (bitmapFactory) return bitmapFactory(...args);
      const bitmap = { close() { this.closed = true; } }; bitmaps.push(bitmap); return Promise.resolve(bitmap);
    },
    setTimeout(fn, delay) { const id = ++timer; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(source, context);
  return { model: new context.FaceMesh(), workers, bitmaps, timers, time(value) { now = value; } };
}

test('face inference is asynchronous with one owned bitmap pending and stale results discarded', async () => {
  const s = trackerSetup(), loading = s.model.load(), worker = s.workers[0];
  assert.match(worker.url, /face-tracker\.js/);
  worker.reply({ type: 'ready', delegate: 'GPU' }); await loading;
  const source = { videoWidth: 1280, videoHeight: 720, currentTime: 1 };
  s.time(100); s.model.detect(source, 100); source.currentTime = 2; s.model.detect(source, 200);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.bitmaps.length, 1);
  assert.equal(worker.messages.filter(item => item.message.type === 'detect').length, 1);
  const sent = worker.messages.at(-1); assert.equal(sent.transfer[0], s.bitmaps[0]);
  s.time(120); worker.reply({ type: 'result', points: face(), timestamp: 100, inferenceMs: 20 });
  assert.equal(s.model.snapshot(120).geometrySafe, true);
  assert.equal(s.model.snapshot(120).confidence, .2);
  assert.equal(s.model.snapshot(451).points, null);
  source.currentTime = 3; s.time(500); s.model.detect(source, 500); await new Promise(resolve => setImmediate(resolve));
  s.time(900); worker.reply({ type: 'result', points: face(), timestamp: 500, inferenceMs: 400 });
  assert.equal(s.model.snapshot(900).points, null);
  assert.equal(s.model.snapshot(900).confidence, 0);
  s.model.close(); assert.equal(worker.terminated, true); assert.equal(s.timers.size, 0);
});

test('missing faces and invalid coordinates immediately remove old geometry; hung inference keeps camera renderer independent', async () => {
  const s = trackerSetup(), loading = s.model.load(), worker = s.workers[0]; worker.reply({ type: 'ready' }); await loading;
  s.time(100); worker.reply({ type: 'result', points: face(), timestamp: 100 });
  assert.ok(s.model.snapshot(100).points);
  worker.reply({ type: 'result', points: null, timestamp: 100 }); assert.equal(s.model.snapshot(100).points, null);
  const invalid = face(); invalid[10] = NaN;
  worker.reply({ type: 'result', points: invalid, timestamp: 100 }); assert.equal(s.model.snapshot(100).points, null);
  s.model.detect({ videoWidth: 640, videoHeight: 480, currentTime: 1 }, 200);
  await new Promise(resolve => setImmediate(resolve));
  [...s.timers.values()].find(timer => timer.delay === 4000).fn();
  assert.equal(s.model.status, 'failed'); assert.equal(s.model.snapshot(200).points, null);
  assert.equal(worker.terminated, true); s.model.close();
});

test('closing during model or bitmap preparation releases late work and settles startup', async () => {
  const s = trackerSetup(), loading = s.model.load(); s.model.close();
  assert.equal(await loading, 'failed'); assert.equal(s.workers[0].terminated, true);
  let finish;
  const second = trackerSetup({ bitmapFactory: () => new Promise(resolve => { finish = resolve; }) });
  const starting = second.model.load(), worker = second.workers[0]; worker.reply({ type: 'ready' }); await starting;
  second.model.detect({ videoWidth: 640, videoHeight: 480, currentTime: 1 }, 100);
  await new Promise(resolve => setImmediate(resolve)); second.model.close();
  const bitmap = { close() { this.closed = true; } }; finish(bitmap);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bitmap.closed, true); assert.equal(worker.messages.some(item => item.message.type === 'detect'), false);
});

function uiSetup(storage = new Map()) {
  const elements = new Map(), pipelines = [], presets = ['natural', 'douyin', 'porcelain'].map(name => ({ dataset: { beautyPreset: name }, setAttribute(key, value) { this[key] = value; } }));
  const element = () => ({ style: {}, dataset: {}, hidden: false, append() {}, after() {}, play: async () => {}, setAttribute(key, value) { this[key] = value; }, showModal() { this.open = true; }, close() { this.open = false; }, querySelectorAll: () => presets,
    set id(value) { this._id = value; elements.set(value, this); }, get id() { return this._id; } });
  const get = id => { if (!elements.has(id)) { const next = element(); next.id = id; } return elements.get(id); };
  const document = { body: { append() {} }, createElement: element, getElementById: get, querySelector: () => ({ prepend() {} }) };
  const window = { async createBeauty(input, values) { const pipeline = { input, values, stream: {}, setValues(next) { this.values = next; }, stop() { this.stopped = true; } }; pipelines.push(pipeline); return pipeline; } };
  vm.runInNewContext(fs.readFileSync('dist/beauty-camera.js', 'utf8'), { document, window, AbortController, console, setTimeout, sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  const state = (id = 'room') => ({ id, you: { id: 'member', status: 'accepted', role: 'teacher' } });
  return { window, get, state, pipelines, storage };
}

test('Porcelana stays automatic while every preset preserves the natural face and more texture', async () => {
  const s = uiSetup(); s.window.beautyCamera.configure(s.state()); await s.window.beautyCamera.attach({}, async () => {});
  assert.equal(s.get('beautyEnabled').checked, true);
  assert.equal(s.pipelines[0].values.smooth, 36); assert.equal(s.pipelines[0].values.bright, 10);
  assert.ok(s.pipelines[0].values.texture >= 70);
  for (const preset of s.get('beautyDialog').querySelectorAll()) {
    preset.onclick();
    for (const key of ['slim', 'eyes', 'nose', 'chin', 'lips']) assert.equal(s.pipelines[0].values[key], 0);
  }
});

test('per-room preferences preserve skin adjustments but never restore old reshape automatically', async () => {
  const s = uiSetup(); s.window.beautyCamera.configure(s.state()); const source = {};
  await s.window.beautyCamera.attach(source, async () => {});
  s.get('beauty-smooth').value = '25'; s.get('beauty-smooth').oninput();
  s.get('beauty-slim').value = '70'; s.get('beauty-slim').oninput();
  assert.equal(s.pipelines[0].values.slim, 70);
  await s.window.beautyCamera.attach(source, async () => {}); assert.equal(s.pipelines.length, 1);
  assert.notEqual(s.pipelines[0].stopped, true);
  const reloaded = uiSetup(s.storage); reloaded.window.beautyCamera.configure(reloaded.state());
  await reloaded.window.beautyCamera.attach({}, async () => {});
  assert.equal(reloaded.pipelines[0].values.smooth, 25); assert.equal(reloaded.pipelines[0].values.slim, 0);
  const next = {}; await s.window.beautyCamera.attach(next, async () => {});
  assert.equal(s.pipelines[0].stopped, true); assert.equal(s.pipelines[1].input, next);
});
