"""Small Argos models on CTranslate2. Participant text is never persisted or logged."""
import hashlib
import json
import os
import re
import shutil
import threading
import urllib.request
import zipfile
from pathlib import Path

LANGUAGES = ('pt', 'en', 'es', 'zh')
MODEL_LABEL = 'Argos Translate / CTranslate2'
ROOT = Path(__file__).resolve().parent
MODEL_ROOT = ROOT / 'data' / 'models' / 'translation'


def validate_request(text, source, target):
    if (not isinstance(text, str) or not text.strip() or len(text) > 2000
            or source not in LANGUAGES or target not in LANGUAGES):
        raise ValueError('Texto ou idioma inválido.')


def route(source, target):
    if source not in LANGUAGES or target not in LANGUAGES:
        raise ValueError('Idioma não suportado.')
    if source == target:
        return []
    if source == 'en' or target == 'en':
        return [(source, target)]
    return [(source, 'en'), ('en', target)]


def split_clauses(text):
    # Keep decimal points and quoted terms intact; no language-model correction.
    return [part.strip() for part in re.split(
        r'(?<=[。！？!?])\s*|(?<=\.)\s+(?=[A-ZÀ-ÖØ-Þ])|\n+', text) if part.strip()]


def install_package(spec, root=MODEL_ROOT):
    """Verify pinned bytes and extract only model/tokenizer/attribution, never Stanza."""
    destination = root / (spec['source'] + '-' + spec['target'])
    marker = destination / '.verified-sha256'
    if marker.is_file() and marker.read_text().strip() == spec['sha256']:
        return destination
    root.mkdir(parents=True, exist_ok=True)
    archive = root / (destination.name + '.argosmodel.part')
    # A local cache can be supplied to the host installer; not a client upload.
    cached = ROOT / 'data' / 'translation-packages' / Path(spec['url']).name
    try:
        if cached.is_file():
            shutil.copyfile(cached, archive)
        else:
            with urllib.request.urlopen(spec['url'], timeout=60) as response, archive.open('wb') as output:
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > spec['size']:
                        raise ValueError('Download fora do tamanho esperado.')
                    output.write(chunk)
        digest = hashlib.sha256()
        with archive.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        if archive.stat().st_size != spec['size'] or digest.hexdigest() != spec['sha256']:
            raise ValueError('Checksum do modelo inválido.')
        destination.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as package:
            for entry in package.infolist():
                path = Path(entry.filename)
                relative = Path(*path.parts[1:])
                if path.is_absolute() or '..' in path.parts:
                    raise ValueError('Caminho de pacote inválido.')
                if not relative.parts:
                    if entry.is_dir():
                        continue
                    raise ValueError('Caminho de pacote inválido.')
                keep = relative.parts[0] == 'model' or len(relative.parts) == 1
                if not keep or entry.is_dir():
                    continue
                if entry.file_size > 600_000_000:
                    raise ValueError('Arquivo de modelo fora do limite.')
                output = destination / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                with package.open(entry) as source, output.open('wb') as target:
                    shutil.copyfileobj(source, target)
        marker.write_text(spec['sha256'])
        return destination
    finally:
        archive.unlink(missing_ok=True)


class Pair:
    def __init__(self, directory, source, target, compute_type='int8'):
        import ctranslate2
        import sentencepiece
        metadata = json.loads((directory / 'metadata.json').read_text(encoding='utf-8'))
        if metadata['from_code'] != source or metadata['to_code'] != target:
            raise ValueError('Par de tradução incorreto.')
        self.target = target
        self.prefix = metadata.get('target_prefix', '')
        self.lock = threading.Lock()
        self.translator = ctranslate2.Translator(
            str(directory / 'model'), device='cpu', compute_type=compute_type,
            inter_threads=1, intra_threads=int(os.environ.get('TRANSLATION_CPU_THREADS', '2')))
        spm = directory / 'sentencepiece.model'
        self.spm = sentencepiece.SentencePieceProcessor(model_file=str(spm)) if spm.is_file() else None
        if not self.spm:
            from sacremoses import MosesTokenizer, MosesDetokenizer, MosesPunctNormalizer
            from subword_nmt.apply_bpe import BPE
            self.normalizer = MosesPunctNormalizer(lang=source)
            self.tokenizer = MosesTokenizer(lang=source)
            self.detokenizer = MosesDetokenizer(lang=target)
            bpe_path = directory / 'bpe.model'
            with bpe_path.open(encoding='utf-8') as codes:
                self.bpe = BPE(codes)

    def encode(self, text):
        if self.spm:
            return self.spm.encode(text, out_type=str)
        # Normalize BPE pieces to the flat sequence expected by CTranslate2.
        words = self.tokenizer.tokenize(self.normalizer.normalize(text))
        return ' '.join(self.bpe.segment_tokens(words)).split()

    def decode(self, tokens):
        if self.prefix and tokens and tokens[0] == self.prefix:
            tokens = tokens[1:]
        if self.spm:
            # These Argos joint vocabularies retain some literal space markers;
            # decode byte fallback first, then normalize the remaining markers.
            return self.spm.decode_pieces(tokens).replace('▁', ' ').strip()
        words = ' '.join(tokens).replace('@@ ', '').split()
        return self.detokenizer.detokenize(words).strip()

    def translate(self, text):
        tokens = [self.encode(clause) for clause in split_clauses(text)]
        # Classroom speech is short; bound both batch cost and every sequence.
        if sum(map(len, tokens)) > 1400:
            raise ValueError('Divida o texto em trechos menores.')
        chunks = [row[i:i + 256] for row in tokens for i in range(0, len(row), 256)]
        with self.lock:
            results = self.translator.translate_batch(
                chunks, beam_size=2, length_penalty=0.2, replace_unknowns=True,
                target_prefix=[[self.prefix]] * len(chunks) if self.prefix else None,
                max_input_length=256, max_decoding_length=512)
        parts = [self.decode(result.hypotheses[0]) for result in results]
        if any(not part for part in parts):
            raise RuntimeError('Tradução vazia.')
        return ('' if self.target == 'zh' else ' ').join(parts)


class TranslationEngine:
    def __init__(self):
        self.hy_url = os.environ.get('TRANSLATION_HY_URL', '').rstrip('/')
        self.hy_secret = os.environ.get('ASR_SECRET', '')
        self.state = dict(ready=False, model=('Hy-MT2-1.8B / Argos' if self.hy_url else MODEL_LABEL), languages=list(LANGUAGES), error=None)
        self.pairs = {}

    def prepare(self):
        try:
            manifest = json.loads((ROOT / 'translation-models.json').read_text(encoding='utf-8'))
            for spec in manifest['models']:
                directory = install_package(spec)
                pair = Pair(directory, spec['source'], spec['target'], spec.get('computeType', 'int8'))
                examples = {'pt': 'Olá. Você consegue ouvir minha voz?',
                            'en': 'Hello. Can you hear my voice?',
                            'es': 'Hola. ¿Puedes oír mi voz?',
                            'zh': '你好。你能听到我的声音吗？'}
                sample = pair.translate(examples[spec['source']])
                if not sample or len(sample) > 300 or '▁' in sample:
                    raise RuntimeError('A validação do modelo falhou.')
                self.pairs[(spec['source'], spec['target'])] = pair
                print('Tradução preparada: ' + spec['source'] + ' → ' + spec['target'], flush=True)
            if self.hy_url:
                import time
                for attempt in range(120):
                    try:
                        self.hy_translate('你好。', 'pt')
                        break
                    except Exception:
                        if attempt == 119: raise
                        time.sleep(1)
            self.state['ready'] = True
        except Exception as error:
            self.state['error'] = type(error).__name__
            print('Falha ao preparar tradução: ' + type(error).__name__, flush=True)

    def health(self):
        if self.hy_url and self.state['ready']:
            try:
                req=urllib.request.Request(self.hy_url+'/health',headers={'Authorization':'Bearer '+self.hy_secret})
                with urllib.request.urlopen(req,timeout=2) as response:
                    if json.load(response).get('status')!='ok': raise RuntimeError()
            except Exception:
                return dict(self.state,ready=False,error='Tradutor de chinês indisponível.')
        return self.state

    def hy_translate(self, text, target):
        names = {'pt':'Portuguese','zh':'Chinese','en':'English','es':'Spanish'}
        prompt = 'Translate the following text into '+names[target]+'. Only output the translated result without explanation:\n\n'+text
        body = json.dumps({'messages':[{'role':'user','content':prompt}], 'max_tokens':768, 'temperature':0}).encode()
        request = urllib.request.Request(self.hy_url+'/v1/chat/completions',data=body,headers={'Content-Type':'application/json','Authorization':'Bearer '+self.hy_secret})
        with urllib.request.urlopen(request,timeout=18) as response:
            result=json.load(response)
        choice=result['choices'][0]
        if choice.get('finish_reason')!='stop': raise RuntimeError('Tradução incompleta.')
        translated=choice['message']['content'].strip()
        if not translated or len(translated)>8000: raise RuntimeError('Tradução inválida.')
        return translated

    def translate(self, text, source, target):
        validate_request(text, source, target)
        if not self.state['ready']:
            raise RuntimeError('Tradução indisponível.')
        if self.hy_url and source!=target and 'zh' in (source,target):
            return self.hy_translate(text,target)
        result = text
        for pair in route(source, target):
            result = self.pairs[pair].translate(result)
        return result
