"""Local ONNX punctuation restoration; never substitutes recognized words."""
import json
import re
from pathlib import Path
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parent
MODEL_ID = 'Horizon-Labs/punctuation-restoration-small'
FILES = ('onnx/model_quantized.onnx', 'tokenizer.json', 'config.json')
CJK = re.compile(r'[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]')
MARKS = '.,;:!?。，、；：！？…'

class Punctuator:
    def __init__(self):
        from huggingface_hub import hf_hub_download
        directory = ROOT / 'data' / 'models' / 'punctuation'
        for filename in FILES:
            if not (directory / filename).exists():
                hf_hub_download(MODEL_ID, filename, local_dir=str(directory))
        self.tokenizer = Tokenizer.from_file(str(directory / 'tokenizer.json'))
        self.labels = json.loads((directory / 'config.json').read_text('utf-8'))['id2label']
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        self.session = ort.InferenceSession(str(directory / FILES[0]), options, providers=['CPUExecutionProvider'])

    def restore(self, text, language='pt'):
        text = re.sub(r'\s+', ' ', text).strip()
        if not text or re.search(r'[.!?。！？]["\u201d\u2019\)]?$', text):
            return text
        # Keep native punctuation (especially Whisper questions) and numbers intact.
        encoding = self.tokenizer.encode(text, add_special_tokens=False)
        predicted = {}
        ids, offsets = encoding.ids, encoding.offsets
        start = 0
        while start < len(ids):
            end = min(len(ids), start + 350)
            tokens = np.array([[1] + ids[start:end] + [1]], dtype=np.int64)
            available = {'input_ids': tokens, 'attention_mask': np.ones_like(tokens),
                         'token_type_ids': np.zeros_like(tokens),
                         'position_ids': np.arange(tokens.shape[1], dtype=np.int64)[None, :]}
            feed = {i.name: available[i.name] for i in self.session.get_inputs()}
            logits = self.session.run(None, feed)[0][0, 1:-1]
            keep_end = end if end == len(ids) else end - 40
            for k in range(start, keep_end):
                a, b = offsets[k]
                if b > a:
                    predicted[b] = self.labels[str(int(np.argmax(logits[k-start])))]
            if end == len(ids):
                break
            start = keep_end
        result, previous = [], 0
        for end in sorted(predicted):
            label = predicted[end]
            if label == '0' or text[end-1] in MARKS:
                continue
            if end < len(text) and text[end] in MARKS:
                continue
            if not (end == len(text) or text[end].isspace() or CJK.match(text[end-1])):
                continue
            # Never place marks inside decimal values or numeral groups.
            if end < len(text) and text[end-1].isdigit() and text[end].isdigit():
                continue
            mark = ({'.':'。', ',':'，', '?':'？', ':':'：', '-':'——'}.get(label, label)
                    if CJK.match(text[end-1]) else ' -' if label == '-' else label)
            result.append(text[previous:end] + mark)
            previous = end
        restored = ''.join(result) + text[previous:]
        if language != 'zh':
            restored = re.sub(r'(^|[.!?]\s+)([a-zà-ÿ])', lambda m:m.group(1)+m.group(2).upper(), restored)
        return restored
