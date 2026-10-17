"""Authenticated classroom ASR and translation. Audio/text are never saved here."""
import io
import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SECRET = os.environ.get('ASR_SECRET', '')
MODEL_NAME = os.environ.get('ASR_MODEL', 'base')
DEVICE = os.environ.get('ASR_DEVICE', 'cpu')
STATE = {'ready': False, 'model': MODEL_NAME, 'device': DEVICE, 'error': None}
STATE.update(punctuationReady=False, punctuationError=None)
PUNCTUATOR = None
PUNCT_LOCK = threading.Lock()
MODEL = None
LOCK = threading.Lock()
CAPACITY = threading.BoundedSemaphore(2)
TRANSLATION_CAPACITY = threading.BoundedSemaphore(2)
TRANSLATION = None
if os.environ.get('ASR_TRANSLATION', '0') == '1':
    from translation_engine import TranslationEngine
    TRANSLATION = TranslationEngine()


def load_model():
    global MODEL
    try:
        from faster_whisper import WhisperModel
        MODEL = WhisperModel(MODEL_NAME, device=DEVICE,
                             compute_type='int8' if DEVICE == 'cpu' else 'int8_float16',
                             cpu_threads=int(os.environ.get('ASR_CPU_THREADS', '4')), num_workers=1,
                             download_root=str(ROOT / 'data' / 'models'))
        STATE['ready'] = True
        print('Motor local pronto: ' + MODEL_NAME + ' / ' + DEVICE, flush=True)
    except Exception as exc:
        STATE['error'] = type(exc).__name__
        print('Falha ao iniciar motor local: ' + type(exc).__name__, flush=True)


def load_punctuation():
    global PUNCTUATOR
    try:
        from punctuation import Punctuator
        PUNCTUATOR = Punctuator()
        STATE['punctuationReady'] = True
        print('Pontuação automática local pronta.', flush=True)
    except Exception as exc:
        STATE['punctuationError'] = type(exc).__name__
        print('Pontuação indisponível: ' + str(exc), flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, body, code=200):
        payload = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self):
        if not SECRET or not secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + SECRET):
            self.respond({'error': 'Não autorizado.'}, 401)
            return False
        return True

    def do_GET(self):
        if self.authorized():
            if self.path == '/translation/health':
                return self.respond(TRANSLATION.state if TRANSLATION else {
                    'ready': False, 'error': 'Tradução não configurada.'})
            self.respond(STATE if self.path == '/health' else {'error': 'Rota inválida.'},
                         200 if self.path == '/health' else 404)

    def do_POST(self):
        if not self.authorized():
            return
        if self.path == '/translate':
            if not TRANSLATION or not TRANSLATION.state['ready']:
                return self.respond({'error': 'Tradução carregando ou indisponível.'}, 503)
            if not TRANSLATION_CAPACITY.acquire(blocking=False):
                return self.respond({'error': 'Tradução ocupada. Aguarde.'}, 429)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length < 2 or length > 16000:
                    return self.respond({'error': 'Texto inválido ou muito grande.'}, 400)
                payload = self.rfile.read(length)
                if len(payload) != length:
                    return self.respond({'error': 'Texto incompleto.'}, 400)
                data = json.loads(payload)
                if not isinstance(data, dict):
                    return self.respond({'error': 'Texto inválido.'}, 400)
                text, source, target = data.get('text'), data.get('source'), data.get('target')
                started = time.perf_counter()
                translated = TRANSLATION.translate(text, source, target)
                return self.respond({'text': translated, 'source': source, 'target': target,
                                     'model': TRANSLATION.state['model'],
                                     'processingMs': round((time.perf_counter() - started) * 1000)})
            except (ValueError, TypeError):
                return self.respond({'error': 'Texto ou idioma inválido.'}, 400)
            except Exception:
                return self.respond({'error': 'Não foi possível traduzir este trecho.'}, 503)
            finally:
                TRANSLATION_CAPACITY.release()
        if self.path == '/punctuate':
            if not STATE['punctuationReady']:
                return self.respond({'error': 'Pontuação local carregando ou indisponível.'}, 503)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length < 2 or length > 12000:
                    return self.respond({'error': 'Texto inválido.'}, 400)
                data = json.loads(self.rfile.read(length))
                text = data.get('text', '')
                language = data.get('language', 'pt')
                if not isinstance(text, str) or len(text) > 2000 or language not in ('pt','en','es','zh'):
                    return self.respond({'error': 'Texto ou idioma inválido.'}, 400)
                with PUNCT_LOCK:
                    result = PUNCTUATOR.restore(text, language)
                return self.respond({'text': result})
            except Exception:
                return self.respond({'error': 'Não foi possível restaurar a pontuação.'}, 422)
        if self.path != '/transcribe':
            return self.respond({'error': 'Rota inválida.'}, 404)
        if not STATE['ready']:
            return self.respond({'error': 'O modelo local ainda não está pronto.'}, 503)
        language = self.headers.get('X-Language', 'pt')
        if language not in ('pt', 'en', 'es', 'zh'):
            return self.respond({'error': 'Idioma não suportado.'}, 400)
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if length < 44 or length > 2_000_000:
            return self.respond({'error': 'Áudio inválido ou muito grande.'}, 413)
        if not CAPACITY.acquire(blocking=False):
            return self.respond({'error': 'Motor ocupado. Tente novamente.'}, 429)
        try:
            audio = self.rfile.read(length)
            if len(audio) != length or not audio.startswith(b'RIFF'):
                return self.respond({'error': 'Envie áudio WAV PCM.'}, 400)
            started = time.perf_counter()
            with LOCK:
                segments, info = MODEL.transcribe(io.BytesIO(audio), language=language,
                    beam_size=1, condition_on_previous_text=False, vad_filter=True,
                    vad_parameters={'min_silence_duration_ms': 400},
                    hallucination_silence_threshold=1.0)
                items = list(segments)
            parts = [s.text.strip() for s in items if s.avg_logprob >= -1.0]
            self.respond({'text': ' '.join(parts), 'language': info.language,
                          'duration': round(info.duration, 3),
                          'processingMs': round((time.perf_counter()-started)*1000),
                          'model': MODEL_NAME, 'device': DEVICE,
                          'discardedSegments': len(items)-len(parts)})
        except Exception:
            self.respond({'error': 'Não foi possível transcrever este trecho.'}, 422)
        finally:
            CAPACITY.release()


if __name__ == '__main__':
    if not SECRET:
        raise SystemExit('Inicie o motor pelo servidor Aula Global.')
    threading.Thread(target=load_model, daemon=True).start()
    if TRANSLATION:
        threading.Thread(target=TRANSLATION.prepare, daemon=True).start()
    if os.environ.get('ASR_PUNCTUATION', '1') == '1':
        threading.Thread(target=load_punctuation, daemon=True).start()
    print('Carregando motor local. Primeiro uso baixa o modelo.', flush=True)
    ThreadingHTTPServer((os.environ.get('ASR_HOST', '127.0.0.1'), int(os.environ.get('ASR_PORT', '4180'))), Handler).serve_forever()
