import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const mainSource = fs.readFileSync('dist/presenter-camera.js', 'utf8');
const workerSource = fs.readFileSync('browser-beauty/presenter-worker.js', 'utf8').replace(/^import[^\n]+\n/, '');

function setup({ supported = true } = {}) {
  const workers = [], clones = [], videos = [], timers = new Map(), calls = [], statuses = [], errors = [];
  let timerId = 0;
  const context = Object.fromEntries(['setTransform', 'clearRect', 'save', 'restore', 'translate', 'scale', 'drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const canvas = { width: 0, height: 0, getContext: () => context };
  class Worker {
    constructor(url) { this.url = url; this.messages = []; workers.push(this); }
    postMessage(data, transfer) { this.messages.push({ data, transfer }); }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data }); }
  }
  class Processor { constructor(options) { this.options = options; this.readable = {}; } }
  class Stream { constructor(tracks) { this.tracks = tracks; } }
  const original = {
    stopped: false,
    stop() { this.stopped = true; },
    clone() {
      const listeners = new Map();
      const clone = { stop() { this.stopped = true; }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
      clones.push(clone);
      return clone;
    }
  };
  const stream = { getVideoTracks: () => [original] };
  const document = {
    createElement() {
      let callbackId = 0;
      const callbacks = new Map();
      const video = {
        readyState: 2, videoWidth: 1280, videoHeight: 720,
        play: () => Promise.resolve(), pause() { this.paused = true; }, remove() { this.removed = true; },
        requestVideoFrameCallback(fn) { const id = ++callbackId; callbacks.set(id, fn); return id; },
        cancelVideoFrameCallback(id) { callbacks.delete(id); },
        frame() { const [id, fn] = callbacks.entries().next().value || []; if (fn) { callbacks.delete(id); fn(); } }
      };
      videos.push(video);
      return video;
    }
  };
  const window = { Worker, MediaStreamTrackProcessor: supported ? Processor : undefined, OffscreenCanvas: {} };
  vm.runInNewContext(mainSource, {
    window, document, Worker, MediaStreamTrackProcessor: Processor, MediaStream: Stream, Error,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  const attach = (options = {}) => window.presenterCamera.attach(stream, canvas, {
    onStatus: state => statuses.push(state), onError: error => errors.push(error), ...options
  });
  const bitmap = () => ({ close() { this.closed = true; } });
  return { workers, clones, videos, timers, calls, statuses, errors, original, canvas, attach, bitmap };
}

test('presenter consumes transferable frames and releases only its own camera clone', () => {
  const s = setup();
  const controller = s.attach();
  const worker = s.workers[0];
  assert.match(worker.url, /^\/presenter-runtime\/v1\/worker\.js\?/);
  assert.equal(worker.messages[0].transfer[0], worker.messages[0].data.readable);
  assert.equal(s.statuses.at(-1).state, 'loading');
  const bitmap = s.bitmap();
  worker.reply({ type: 'frame', bitmap, width: 640, height: 360 });
  assert.equal(bitmap.closed, true);
  assert.equal(s.statuses.at(-1).state, 'ready');
  assert.equal(s.canvas.width, 640);
  assert.equal(worker.messages.at(-1).data.type, 'consumed');
  assert.equal(s.calls.filter(call => call[0] === 'scale').length, 0);
  controller.stop(); controller.stop();
  assert.equal(s.original.stopped, false);
  assert.equal(s.clones.every(clone => clone.stopped), true);
  assert.equal(worker.terminated, true);
  assert.equal(s.videos[0].srcObject, null);
  assert.equal(s.videos[0].paused, true);
  assert.equal(s.timers.size, 0);
  assert.equal(s.statuses.at(-1).state, 'stopped');
});

test('camera orientation applies exactly one requested mirror to live foreground', () => {
  const s = setup(), controller = s.attach({ mirror: true });
  s.calls.length = 0;
  s.workers[0].reply({ type: 'frame', bitmap: s.bitmap(), width: 320, height: 180 });
  assert.deepEqual(s.calls.find(call => call[0] === 'translate'), ['translate', 320, 0]);
  assert.deepEqual(s.calls.find(call => call[0] === 'scale'), ['scale', -1, 1]);
  assert.equal(s.calls.filter(call => call[0] === 'restore').length, 1);
  controller.stop();
});

test('unsupported browsers retain a moving rectangular camera with an explicit fallback state', () => {
  const s = setup({ supported: false }), controller = s.attach();
  assert.equal(s.workers.length, 0);
  assert.equal(s.statuses.at(-1).state, 'fallback');
  assert.match(s.statuses.at(-1).message, /com fundo/);
  s.calls.length = 0;
  s.videos[0].frame();
  assert.equal(s.calls.find(call => call[0] === 'drawImage')[1], s.videos[0]);
  assert.equal(s.original.stopped, false);
  controller.stop();
});

test('worker errors and stalled processing resume the rectangle instead of freezing the camera', () => {
  for (const failure of ['error', 'stalled', 'timeout']) {
    const s = setup(), controller = s.attach(), worker = s.workers[0];
    if (failure === 'stalled') {
      worker.reply({ type: 'frame', bitmap: s.bitmap(), width: 320, height: 180 });
      [...s.timers.values()].find(timer => timer.delay === 5000).fn();
    } else if (failure === 'timeout') [...s.timers.values()].find(timer => timer.delay === 60000).fn();
    else worker.reply({ type: 'error', message: 'Test segmentation failure' });
    assert.equal(s.statuses.at(-1).state, 'fallback', failure);
    assert.equal(worker.terminated, true, failure);
    assert.equal(s.clones[1].stopped, true, failure);
    assert.equal(s.clones[0].stopped, undefined, failure);
    assert.equal(s.errors.length, 1, failure);
    s.calls.length = 0;
    s.videos[0].frame();
    assert.equal(s.calls.find(call => call[0] === 'drawImage')[1], s.videos[0], failure);
    const late = s.bitmap();
    worker.reply({ type: 'frame', bitmap: late, width: 320, height: 180 });
    assert.equal(late.closed, true);
    assert.equal(s.statuses.at(-1).state, 'fallback');
    controller.stop();
  }
});

test('aborting preparation releases the clone and closes any late transferred bitmap', () => {
  const s = setup(), signal = new AbortController();
  s.attach({ signal: signal.signal });
  signal.abort();
  const late = s.bitmap();
  s.workers[0].reply({ type: 'frame', bitmap: late, width: 320, height: 180 });
  assert.equal(late.closed, true);
  assert.equal(s.clones[0].stopped, true);
  assert.equal(s.original.stopped, false);
  assert.equal(s.statuses.at(-1).state, 'stopped');
  const already = new AbortController(); already.abort();
  const second = setup(); second.attach({ signal: already.signal });
  assert.equal(second.clones.length, 0);
  assert.equal(second.workers.length, 0);
});

async function workerSetup({ count = 3, fail = false, create } = {}) {
  const canvases = [], messages = [], frames = [], results = [], delegates = [];
  let closed = 0, cancelled = false, time = 0, next = 0;
  class OffscreenCanvas {
    constructor(width, height) { this.width = width; this.height = height; this.calls = []; canvases.push(this); }
    getContext(kind, options) {
      this.options = options;
      const canvas = this;
      return {
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: image => { this.pixels = image.data; },
        clearRect: (...args) => this.calls.push(['clearRect', ...args]),
        drawImage: (...args) => this.calls.push(['drawImage', ...args]),
        set globalCompositeOperation(value) { canvas.calls.push(['composite', value]); },
        set filter(value) { this.currentFilter = value; }
      };
    }
    transferToImageBitmap() { return { width: this.width, height: this.height, close() { this.closed = true; } }; }
  }
  const model = {
    getLabels: () => ['background', 'person'],
    close() { closed++; },
    segmentForVideo(input, timestamp, callback) {
      const result = {
        confidenceMasks: [null, { width: 3, height: 1, getAsFloat32Array() { if (fail) throw new Error('inference failed'); return new Float32Array([0, .5, 1]); } }],
        close() { this.closed = true; }
      };
      results.push(result); callback(result);
    }
  };
  for (let i = 0; i < count; i++) frames.push({ displayWidth: 1920, displayHeight: 1080, close() { this.closed = true; } });
  const reader = { async read() { return next < frames.length ? { value: frames[next++], done: false } : { done: true }; }, async cancel() { cancelled = true; } };
  const self = { postMessage(message) { messages.push(message); } };
  vm.runInNewContext(workerSource, {
    self, OffscreenCanvas, Float32Array, performance: { now: () => time += 101 }, Error,
    FilesetResolver: { forVisionTasks: async () => ({}) },
    ImageSegmenter: { async createFromOptions(vision, options) { delegates.push(options.baseOptions.delegate); return create ? create(model, options) : model; } }
  });
  self.onmessage({ data: { type: 'start', readable: { getReader: () => reader } } });
  await new Promise(resolve => setImmediate(resolve));
  return { self, canvases, messages, frames, results, delegates, model, get closed() { return closed; }, get cancelled() { return cancelled; } };
}

test('segmentation keeps transparent alpha, smooth edges, and one bitmap in transit', async () => {
  const s = await workerSetup();
  assert.equal(s.messages.filter(message => message.type === 'frame').length, 1);
  assert.equal(s.frames.every(frame => frame.closed), true);
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].closed, true);
  const output = s.canvases[1];
  assert.equal(output.options.alpha, true);
  assert.equal(output.width, 640);
  assert.equal(output.height, 360);
  assert.equal(output.calls.some(call => call[0] === 'composite' && call[1] === 'destination-in'), true);
  const small = s.canvases.find(canvas => canvas.width === 3);
  assert.deepEqual([small.pixels[3], small.pixels[7], small.pixels[11]], [0, 128, 255]);
  assert.equal(s.closed, 1);
  assert.equal(s.cancelled, true);
});

test('inference failure frees both the input frame and MediaPipe mask before reporting', async () => {
  const s = await workerSetup({ count: 1, fail: true });
  assert.equal(s.frames[0].closed, true);
  assert.equal(s.results[0].closed, true);
  assert.equal(s.messages.some(message => message.type === 'frame'), false);
  assert.match(s.messages.find(message => message.type === 'error').message, /inference failed/);
  assert.equal(s.closed, 1);
  assert.equal(s.cancelled, true);
});

test('GPU initialization failure can use worker CPU segmentation without altering the source camera', async () => {
  const s = await workerSetup({ count: 1, create(model, options) {
    if (options.baseOptions.delegate === 'GPU') throw new Error('GPU unavailable');
    return model;
  } });
  assert.deepEqual(s.delegates, ['GPU', 'CPU']);
  assert.equal(s.messages.some(message => message.type === 'frame'), true);
  assert.equal(s.frames[0].closed, true);
});

test('stopping during asynchronous model preparation closes the late model without emitting a frame', async () => {
  let finish;
  const s = await workerSetup({ count: 0, create: model => new Promise(resolve => { finish = () => resolve(model); }) });
  s.self.onmessage({ data: { type: 'stop' } });
  assert.equal(s.cancelled, true);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.closed, 1);
  assert.equal(s.messages.length, 0);
});
