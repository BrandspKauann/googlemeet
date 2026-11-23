import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

let model, stopped = false, preparing = false;
async function prepare() {
  const { cachedFetch } = await import('/beauty-cache.js?v=20261118-face1');
  const fetchLocal = cachedFetch;
  self.fetch = (resource, options) => {
    const url = new URL(typeof resource === 'string' || resource instanceof URL ? String(resource) : resource.url, self.location.href);
    if (url.origin !== self.location.origin) return Promise.reject(Error('O filtro usa somente os recursos do próprio site.'));
    return fetchLocal(resource, options);
  };
  const fileset = await FilesetResolver.forVisionTasks('/openmakeup/runtime/v1/wasm');
  const response = await self.fetch('/openmakeup/assets/face_landmarker.task');
  if (!response.ok) throw Error('Não foi possível carregar os ajustes faciais.');
  const options = { baseOptions: { modelAssetBuffer: new Uint8Array(await response.arrayBuffer()), delegate: 'GPU' },
    runningMode: 'VIDEO', numFaces: 1, minFaceDetectionConfidence: .6, minFacePresenceConfidence: .6,
    minTrackingConfidence: .6, outputFaceBlendshapes: false };
  if (stopped) return;
  try { model = await FaceLandmarker.createFromOptions(fileset, options); }
  catch (error) {
    if (stopped) return;
    options.baseOptions.delegate = 'CPU';
    model = await FaceLandmarker.createFromOptions(fileset, options);
  }
  if (stopped) { model.close(); model = undefined; return; }
  self.postMessage({ type: 'ready', delegate: options.baseOptions.delegate });
}
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stopped = true; model?.close(); model = undefined; return; }
  if (data.type === 'start' && !preparing) {
    preparing = true;
    try { await prepare(); }
    catch (error) { if (!stopped) self.postMessage({ type: 'error', message: error.message || 'Ajustes faciais indisponíveis.' }); }
  } else if (data.type === 'detect') {
    const bitmap = data.bitmap;
    try {
      if (stopped || !model) return;
      const started = performance.now();
      const result = model.detectForVideo(bitmap, data.timestamp);
      const face = result.faceLandmarks?.[0];
      const points = face?.length >= 478 ? new Float32Array(face.flatMap(point => [point.x, point.y])) : null;
      self.postMessage({ type: 'result', points, timestamp: data.timestamp, inferenceMs: performance.now() - started }, points ? [points.buffer] : []);
    } catch (error) { if (!stopped) self.postMessage({ type: 'error', message: error.message || 'O rastreamento facial foi interrompido.' }); }
    finally { bitmap?.close(); }
  }
};
