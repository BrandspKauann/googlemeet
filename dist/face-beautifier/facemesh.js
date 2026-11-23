import { OneEuroArray } from './onefilter.js';
import { NUM_LANDMARKS } from './landmarks.js';
import { faceGeometryIsSafe, MAX_TRACKING_AGE_MS } from './tracking-safety.js';

/** Face inference owns a Worker; camera rendering never waits for the model. */
export class FaceMesh {
  constructor() {
    this.status = 'idle'; this.points = null; this.presence = 0; this.error = null;
    this._filter = new OneEuroArray(NUM_LANDMARKS * 2, { minCutoff: 1.2, beta: .012 });
    this._worker = null; this._busy = false; this._closed = false; this._revision = 0;
    this._lastResult = -Infinity; this._lastRequest = -Infinity; this._lastSourceTime = -1;
    this._aspect = 1; this._geometrySafe = false; this._inferenceMs = 0; this._delegate = '';
  }
  get ready() { return this.status === 'ready'; }
  async load() {
    if (this._closed) return 'failed';
    if (this._loading) return this._loading;
    if (this.ready) return 'ready';
    this.status = 'loading';
    this._loading = new Promise(resolve => {
      this._resolveLoad = resolve;
      const settle = state => { clearTimeout(this._loadTimer); this._resolveLoad?.(state); this._resolveLoad = null; };
      try {
        if (!globalThis.Worker || !globalThis.createImageBitmap) throw Error('Este navegador não oferece rastreamento em segundo plano.');
        const worker = this._worker = new Worker('/openmakeup/runtime/v1/face-tracker.js?v=20261123-natural1');
        worker.onmessage = ({ data }) => {
          if (this._closed || this._worker !== worker) return;
          if (data.type === 'ready') { this.status = 'ready'; this._delegate = data.delegate || ''; settle('ready'); }
          else if (data.type === 'result') {
            clearTimeout(this._requestTimer); this._busy = false;
            this._inferenceMs = Math.round((data.inferenceMs || 0) * 10) / 10;
            this._ingest(data.points, data.timestamp);
          } else if (data.type === 'error') { this._fail(Error(data.message)); settle('failed'); }
        };
        worker.onerror = event => { event.preventDefault?.(); this._fail(Error(event.message || 'Rastreamento facial interrompido.')); settle('failed'); };
        worker.onmessageerror = () => { this._fail(Error('Não foi possível receber os ajustes faciais.')); settle('failed'); };
        this._loadTimer = setTimeout(() => { this._fail(Error('A preparação dos ajustes faciais demorou.')); settle('failed'); }, 30000);
        worker.postMessage({ type: 'start' });
      } catch (error) { this._fail(error); settle('failed'); }
    });
    return this._loading;
  }
  _fail(error) {
    this.error = error; this.status = 'failed'; this.points = null; this.presence = 0; this._geometrySafe = false; this._revision++;
    clearTimeout(this._requestTimer); clearTimeout(this._loadTimer); this._busy = false;
    const worker = this._worker; this._worker = null; worker?.terminate();
  }
  detect(source, timestamp) {
    if (!this.ready || this._closed || this._busy || timestamp - this._lastRequest < 80) return this.points;
    const sourceTime = source.currentTime;
    if (Number.isFinite(sourceTime) && sourceTime === this._lastSourceTime) return this.points;
    this._lastSourceTime = sourceTime; this._lastRequest = timestamp; this._busy = true;
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    this._aspect = width / height;
    const ratio = Math.min(1, 480 / width, 360 / height);
    const worker = this._worker;
    this._requestTimer = setTimeout(() => this._fail(Error('O rastreamento deixou de responder; a câmera continua sem alterar o rosto.')), 4000);
    Promise.resolve().then(() => createImageBitmap(source, { resizeWidth: Math.max(2, Math.round(width * ratio)), resizeHeight: Math.max(2, Math.round(height * ratio)), resizeQuality: 'low' }))
      .then(bitmap => {
        if (this._closed || this._worker !== worker) { bitmap.close(); return; }
        try { worker.postMessage({ type: 'detect', bitmap, timestamp }, [bitmap]); }
        catch (error) { bitmap.close(); this._fail(error); }
      }).catch(error => { if (!this._closed) this._fail(error); });
    return this.points;
  }
  async detectStill(source) {
    if (await this.load() !== 'ready') return null;
    this._lastRequest = -Infinity; this._lastSourceTime = -1;
    const revision = this._revision, started = performance.now();
    this.detect(source, started);
    while (!this._closed && this.ready && this._revision === revision && performance.now() - started < 4000) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return this.points;
  }
  _ingest(points, timestamp) {
    this._revision++;
    if (!points || points.length !== NUM_LANDMARKS * 2 || points.some(point => !Number.isFinite(point)) || performance.now() - timestamp > MAX_TRACKING_AGE_MS) {
      this.points = null; this.presence = 0; this._geometrySafe = false; this._filter.reset(); return;
    }
    // Validate raw measurements before smoothing, which must not disguise a bad pose.
    this._geometrySafe = faceGeometryIsSafe(points, this._aspect);
    this.points = this._filter.filter(points, timestamp / 1000);
    this.presence = Math.min(1, this.presence + .2); this._lastResult = timestamp;
  }
  snapshot(now = performance.now()) {
    const ageMs = Math.max(0, now - this._lastResult), fresh = this.ready && ageMs <= MAX_TRACKING_AGE_MS && !!this.points;
    return { points: fresh ? this.points : null, confidence: fresh ? this.presence : 0,
      geometrySafe: fresh && this._geometrySafe, ageMs, revision: this._revision * 2 + (fresh ? 1 : 0) };
  }
  diagnostics() {
    const state = this.snapshot();
    return { tracking: this.status, trackingDelegate: this._delegate, trackingInferenceMs: this._inferenceMs,
      trackingAgeMs: Number.isFinite(state.ageMs) ? Math.round(state.ageMs) : null,
      trackingFresh: !!state.points, reshapeSafe: state.geometrySafe, trackingPending: this._busy };
  }
  close() {
    if (this._closed) return;
    this._closed = true; clearTimeout(this._loadTimer); clearTimeout(this._requestTimer);
    this._resolveLoad?.('failed'); this._resolveLoad = null;
    const worker = this._worker; this._worker = null;
    try { worker?.postMessage({ type: 'stop' }); } catch {}
    worker?.terminate(); this.points = null; this.presence = 0; this.status = 'idle';
  }
}
