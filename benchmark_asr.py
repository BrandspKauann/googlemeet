"""Same WAVs, one warm-up and three measured runs; synthetic and human cases stay labeled."""
import argparse
import gc
import json
import statistics
import sys
import time
import unicodedata
from pathlib import Path
from faster_whisper import WhisperModel
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--models', nargs='+', default=['base','small','turbo'])
parser.add_argument('--references', default=str(ROOT/'benchmarks/references.json'))
parser.add_argument('--output', default=str(ROOT/'data/qa/bench/comparison.json'))
parser.add_argument('--device', choices=['cpu','cuda'], default='cpu')
parser.add_argument('--compute-type', default='int8')
parser.add_argument('--beam-size', type=int, default=1)
parser.add_argument('--model-root', default=str(ROOT/'data/models'))
args=parser.parse_args()
manifest=Path(args.references)
cases=json.loads(manifest.read_text(encoding='utf-8-sig'))
output=Path(args.output)
def normalized(text,language):
    text=unicodedata.normalize('NFKC',text).lower()
    text=''.join(c for c in text if not unicodedata.category(c).startswith(('P','S')))
    return list(text.replace(' ','')) if language=='zh' else text.split()
def distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        nxt=[i]
        for j,y in enumerate(b,1):nxt.append(min(nxt[j-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]
results=[]
for size in args.models:
    print('Carregando '+size,flush=True)
    local_model=Path(args.model_root)/('pinned-'+size)
    if not local_model.exists(): local_model=Path(args.model_root)/('benchmark-'+size)
    required=['model.bin','config.json','tokenizer.json']+(['preprocessor_config.json'] if size in ('turbo','large-v3-turbo') else [])
    selected_model=str(local_model) if all((local_model/name).exists() for name in required) else size
    model=WhisperModel(selected_model,device=args.device,compute_type=args.compute_type,cpu_threads=4,num_workers=1,download_root=args.model_root)
    for case in cases:
        language=case.get('Language',Path(case['File']).stem.split('-')[0])
        filename=manifest.parent/case['File']
        def run():
            start=time.perf_counter()
            segments,info=model.transcribe(str(filename),language=language,beam_size=args.beam_size,vad_filter=True,condition_on_previous_text=False)
            text=' '.join(s.text.strip() for s in segments if s.avg_logprob>=-1.0)
            return text,time.perf_counter()-start,info.duration
        run()
        measured=[run() for _ in range(3)]
        ref=normalized(case['Text'],language)
        texts=[item[0] for item in measured]
        rates=[distance(ref,normalized(text,language))/max(1,len(ref)) for text in texts]
        duration=measured[0][2]
        result=dict(model=size,device=args.device,computeType=args.compute_type,beamSize=args.beam_size,language=language,duration=duration,processingSeconds=[round(item[1],3) for item in measured],medianProcessingSeconds=round(statistics.median(item[1] for item in measured),3),realTimeFactor=round(statistics.median(item[1] for item in measured)/max(.001,duration),3),metric='CER' if language=='zh' else 'WER',errorRates=rates,reference=case['Text'],texts=texts,testType=case.get('TestType','synthetic Windows TTS'),case=case['File'])
        if language=='zh':result['metricNote']='Raw CER includes traditional/simplified spelling differences.'
        results.append(result)
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False),flush=True)
    del model
    gc.collect()
