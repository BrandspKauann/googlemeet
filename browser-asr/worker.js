import { pipeline, env } from '@huggingface/transformers';
import { createRangeFetch } from './range-fetch.js';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = {
 mjs:'/asr-runtime/ort-wasm-simd-threaded.asyncify.mjs',
 wasm:'/asr-runtime/ort-wasm-simd-threaded.asyncify.wasm',
};
const MODEL = 'onnx-community/whisper-large-v3-turbo';
const REVISION = '360ebcde2559d60bb474678be3c1de9ef347d01a';
const prefix=`https://huggingface.co/${MODEL}/resolve/${REVISION}/onnx/`;
env.fetch=createRangeFetch(env.fetch,{
 [prefix+'encoder_model_fp16.onnx']:1274342603,
 [prefix+'decoder_model_merged_q4.onnx']:334147222,
},progress=>self.postMessage({type:'progress',progress}));
let recognizer;
let chain = Promise.resolve();
const languages = {pt:'portuguese',en:'english',es:'spanish',zh:'chinese'};
self.onmessage = ({data}) => {
 chain = chain.then(async () => {
  const {id,type} = data;
  try {
   if(type === 'prepare') {
    if(!self.navigator.gpu || !await self.navigator.gpu.requestAdapter()) throw Error('WebGPU indisponível. Escolha Reconhecimento do navegador.');
    recognizer ||= await pipeline('automatic-speech-recognition', MODEL, {
     revision:REVISION,device:'webgpu',dtype:{encoder_model:'fp16',decoder_model_merged:'q4'},
     progress_callback:progress=>self.postMessage({type:'progress',progress}),
    });
    self.postMessage({id,type:'result',result:{model:MODEL,revision:REVISION}});
   } else if(type === 'transcribe') {
    if(!recognizer) throw Error('Prepare o reconhecimento antes de ligar o microfone.');
    if(!languages[data.language]) throw Error('Idioma não suportado.');
    const started=performance.now();
    const result=await recognizer(new Float32Array(data.audio), {language:languages[data.language],task:'transcribe',return_timestamps:false,chunk_length_s:30});
    self.postMessage({id,type:'result',result:{text:result.text.trim(),model:MODEL,processingMs:performance.now()-started}});
   } else throw Error('Operação de reconhecimento inválida.');
  } catch(error) { const message=String(error.message||error);self.postMessage({id,type:'error',error:/network error|failed to fetch/i.test(message)?'Falha ao baixar o modelo. Confira a conexão e tente preparar novamente, ou escolha Reconhecimento do navegador.':message}); }
 }).catch(error=>self.postMessage({type:'error',error:error.message}));
};
