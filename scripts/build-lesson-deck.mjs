import {build} from 'esbuild';
import fs from 'node:fs';

const output = 'dist/lesson-runtime/v1';
fs.mkdirSync(output, {recursive: true});
await build({entryPoints: ['browser-presentation/runtime.js'], outfile: output + '/runtime.js', bundle: true, format: 'esm', platform: 'browser', minify: true, target: ['chrome120', 'edge120', 'firefox120', 'safari17']});
fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', output + '/pdf.worker.min.mjs');
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) fs.cpSync('node_modules/pdfjs-dist/' + folder, output + '/' + folder, {recursive: true});
const licenses = [
  ['@office-kit/pptx 0.30.0', 'node_modules/@office-kit/pptx/LICENSE'],
  ['@office-kit/pptx — avisos de terceiros', 'node_modules/@office-kit/pptx/THIRD_PARTY_NOTICES.md'],
  ['@office-kit/pptx-preview 0.23.0', 'node_modules/@office-kit/pptx-preview/LICENSE'],
  ['fflate', 'node_modules/fflate/LICENSE'],
  ['pdfjs-dist 6.5.438', 'node_modules/pdfjs-dist/LICENSE'],
];
fs.writeFileSync(output + '/LICENSES.txt', licenses.map(([name, file]) => name + '\n\n' + fs.readFileSync(file, 'utf8')).join('\n\n--------------------\n\n'));
console.log('Apresentações locais: renderizador PPTX/PDF e licenças preparados.');
