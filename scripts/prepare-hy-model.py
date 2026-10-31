from pathlib import Path
import urllib.request,hashlib,time
import os
os.chdir(Path(__file__).resolve().parent.parent)
p=Path('data/models/hy-mt2-1.8b-q8.gguf');p.parent.mkdir(exist_ok=True,parents=True)
url='https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/a0c709d9fac510f2c807aa3af52872340dc37a4a/Hy-MT2-1.8B-Q8_0.gguf'
if not p.exists():
 print('Downloading translation model on server only',flush=True)
 with urllib.request.urlopen(url,timeout=60) as r,p.with_suffix('.part').open('wb') as out:
  while chunk:=r.read(4*1024*1024):out.write(chunk)
 p.with_suffix('.part').rename(p)
h=hashlib.sha256()
with p.open('rb') as f:
 while chunk:=f.read(4*1024*1024):h.update(chunk)
assert h.hexdigest()=='5c3fe0b1408a5ceb0143184ef247b11b579c525f4b02b060e6c851bb76fef1a4'
print('Translation model ready; SHA256 verified',flush=True)
