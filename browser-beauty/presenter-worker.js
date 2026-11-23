import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

// This worker needs only our hosted model/WASM. Also suppress the SDK's optional usage logging.
const fetchResource = self.fetch?.bind(self);
if (fetchResource) self.fetch = (resource, options) => {
  const url = new URL(typeof resource === 'string' || resource instanceof URL ? String(resource) : resource.url, self.location.href);
  if (url.origin !== self.location.origin) return Promise.reject(new Error('O recorte usa somente recursos do próprio site.'));
  return fetchResource(resource, options);
};

let stopped = false, started = false, reader, segmenter, bitmapInFlight = false;

function dispose() {
  if (stopped) return;
  stopped = true;
  reader?.cancel().catch(() => {});
  segmenter?.close();
  segmenter = undefined;
}

self.onmessage = ({ data }) => {
  if (data.type === 'stop') { dispose(); return; }
  if (data.type === 'consumed') { bitmapInFlight = false; return; }
  if (data.type !== 'start' || started || stopped) return;
  started = true;
  run(data.readable).catch(error => {
    if (!stopped) self.postMessage({ type: 'error', message: error.message || 'Não foi possível remover o fundo.' });
    dispose();
  });
};

async function run(readable) {
  reader = readable.getReader();
  const vision = await FilesetResolver.forVisionTasks('/background-runtime/v1/wasm');
  if (stopped) return;
  const options = {
    baseOptions: { modelAssetPath: '/background-runtime/v1/selfie-segmenter.tflite', delegate: 'GPU' },
    runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true
  };
  try { segmenter = await ImageSegmenter.createFromOptions(vision, options); }
  catch (error) {
    if (stopped) return;
    options.baseOptions.delegate = 'CPU';
    segmenter = await ImageSegmenter.createFromOptions(vision, options);
  }
  if (stopped) { segmenter.close(); segmenter = undefined; return; }
  const personIndex = segmenter.getLabels().findIndex(label => /person|selfie|foreground/i.test(label));
  let input, source, output, outputContext, mask, maskContext;
  let smallMask, smallContext, pixels, previous, width, height, lastDetection = -Infinity;

  while (!stopped) {
    const { done, value: frame } = await reader.read();
    if (done) break;
    try {
      if (stopped || bitmapInFlight) continue;
      const ratio = Math.min(1, 640 / frame.displayWidth, 480 / frame.displayHeight);
      const nextWidth = Math.max(2, Math.round(frame.displayWidth * ratio));
      const nextHeight = Math.max(2, Math.round(frame.displayHeight * ratio));
      if (!input || nextWidth !== width || nextHeight !== height) {
        width = nextWidth; height = nextHeight;
        input = new OffscreenCanvas(width, height); source = input.getContext('2d', { alpha: false });
        output = new OffscreenCanvas(width, height); outputContext = output.getContext('2d', { alpha: true });
        mask = new OffscreenCanvas(width, height); maskContext = mask.getContext('2d', { alpha: true });
        smallMask = undefined; previous = undefined; lastDetection = -Infinity;
        if (!source || !outputContext || !maskContext) throw new Error('Canvas de recorte indisponível.');
      }
      source.drawImage(frame, 0, 0, width, height);
      const now = performance.now();
      // Reuse the latest mask between detections; camera frames have no fixed frame-rate cap.
      if (now - lastDetection >= 100) {
        segmenter.segmentForVideo(input, now, result => {
          try {
            const confidence = result.confidenceMasks?.[personIndex >= 0 ? personIndex : 0];
            if (!confidence || (personIndex < 0 && result.confidenceMasks.length !== 1)) {
              throw new Error('O modelo não retornou uma máscara de pessoa reconhecida.');
            }
            const probabilities = confidence.getAsFloat32Array();
            if (!smallMask || smallMask.width !== confidence.width || smallMask.height !== confidence.height) {
              smallMask = new OffscreenCanvas(confidence.width, confidence.height);
              smallContext = smallMask.getContext('2d', { alpha: true });
              pixels = smallContext.createImageData(confidence.width, confidence.height);
              previous = new Float32Array(probabilities.length); previous.fill(-1);
            }
            for (let i = 0; i < probabilities.length; i++) {
              const value = Math.max(0, Math.min(1, (probabilities[i] - .25) / .5));
              const alpha = value * value * (3 - 2 * value);
              const smooth = previous[i] < 0 ? alpha : alpha * .8 + previous[i] * .2;
              previous[i] = smooth;
              const at = i * 4;
              pixels.data[at] = pixels.data[at + 1] = pixels.data[at + 2] = 255;
              pixels.data[at + 3] = Math.round(smooth * 255);
            }
            smallContext.putImageData(pixels, 0, 0);
            maskContext.clearRect(0, 0, width, height);
            maskContext.filter = 'blur(1.5px)';
            maskContext.drawImage(smallMask, 0, 0, width, height);
            maskContext.filter = 'none';
          } finally { result.close(); }
        });
        lastDetection = now;
      }
      if (!smallMask) throw new Error('Não foi possível separar a pessoa do fundo.');
      outputContext.globalCompositeOperation = 'source-over';
      outputContext.clearRect(0, 0, width, height);
      outputContext.drawImage(input, 0, 0);
      outputContext.globalCompositeOperation = 'destination-in';
      outputContext.drawImage(mask, 0, 0);
      outputContext.globalCompositeOperation = 'source-over';
      const bitmap = output.transferToImageBitmap();
      try {
        bitmapInFlight = true;
        self.postMessage({ type: 'frame', bitmap, width, height }, [bitmap]);
      } catch (error) { bitmap.close(); throw error; }
    } finally { frame.close(); }
  }
  if (!stopped) self.postMessage({ type: 'error', message: 'A câmera da apresentação foi interrompida.' });
  dispose();
}
