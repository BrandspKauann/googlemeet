import { build } from 'esbuild';
import fs from 'node:fs';

const shared = 'dist/background-runtime/v1';
for (const asset of ['selfie-segmenter.tflite', 'wasm', 'LICENSE.txt']) {
  if (!fs.existsSync(`${shared}/${asset}`)) {
    throw new Error('Prepare o modelo compartilhado com scripts/build-background.mjs antes do recorte da câmera.');
  }
}
await build({
  entryPoints: ['browser-beauty/presenter-worker.js'],
  outfile: 'dist/presenter-runtime/v1/worker.js',
  bundle: true, format: 'iife', platform: 'browser', minify: true
});
console.log('Câmera da apresentação: worker preparado; modelo e WASM compartilhados com o desfoque.');
