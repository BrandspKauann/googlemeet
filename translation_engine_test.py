import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import translation_engine as engine


class TranslationTests(unittest.TestCase):
    def test_chinese_uses_authenticated_direct_translation(self):
        import io
        with patch.dict('os.environ', {'TRANSLATION_HY_URL':'http://translator:8080','ASR_SECRET':'unit-secret'}):
            model=engine.TranslationEngine()
        model.state['ready']=True
        response={'choices':[{'finish_reason':'stop','message':{'content':'Seis meses.'}}]}
        with patch.object(engine.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(response).encode())) as request:
            self.assertEqual(model.translate('半年。','zh','pt'),'Seis meses.')
            self.assertEqual(request.call_args[0][0].get_header('Authorization'),'Bearer unit-secret')
        response['choices'][0]['finish_reason']='length'
        with patch.object(engine.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(response).encode())):
            with self.assertRaises(RuntimeError):model.translate('半年。','zh','pt')

    def test_routes_cover_supported_languages_and_reject_unknowns(self):
        self.assertEqual(engine.route('zh', 'pt'), [('zh', 'en'), ('en', 'pt')])
        self.assertEqual(engine.route('es', 'en'), [('es', 'en')])
        self.assertEqual(engine.route('pt', 'pt'), [])
        for args in [('', 'pt', 'en'), ('x' * 2001, 'pt', 'en'), ('x', 'xx', 'en'), ([], 'pt', 'en')]:
            with self.assertRaises(ValueError):
                engine.validate_request(*args)

    def test_sentence_boundaries_preserve_numbers_and_quoted_terms(self):
        self.assertEqual(engine.split_clauses('O valor é 3.14. A palavra "carro" tem quantas letras?'),
                         ['O valor é 3.14.', 'A palavra "carro" tem quantas letras?'])
        self.assertEqual(engine.split_clauses('老师你好。你能听到吗？'), ['老师你好。', '你能听到吗？'])

    def test_joint_tokenizer_decodes_literal_space_markers(self):
        pair = engine.Pair.__new__(engine.Pair)
        pair.prefix = ''
        class Processor:
            def decode_pieces(self, tokens):
                return '▁Olá,▁professora.'
        pair.spm = Processor()
        self.assertEqual(pair.decode(['fixture']), 'Olá, professora.')

    def test_verified_installer_omits_stanza_and_retains_attribution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'source.zip'
            with zipfile.ZipFile(archive, 'w') as zipped:
                for name in ['pkg/model/model.bin', 'pkg/metadata.json', 'pkg/README.md', 'pkg/sentencepiece.model', 'pkg/stanza/large.pt']:
                    zipped.writestr(name, b'fixture')
            spec = dict(source='pt', target='en', url='https://official.example/package.zip', size=archive.stat().st_size,
                        sha256=hashlib.sha256(archive.read_bytes()).hexdigest())
            with patch.object(engine.urllib.request, 'urlopen', side_effect=lambda *_args, **_kw: archive.open('rb')):
                destination = engine.install_package(spec, root / 'installed')
            self.assertTrue((destination / 'model/model.bin').is_file())
            self.assertTrue((destination / 'README.md').is_file())
            self.assertFalse((destination / 'stanza').exists())
            with patch.object(engine.urllib.request, 'urlopen', side_effect=AssertionError('must use cache')):
                self.assertEqual(engine.install_package(spec, root / 'installed'), destination)

    def test_installer_rejects_changed_bytes_before_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'source.zip'
            archive.write_bytes(b'changed')
            spec = dict(source='pt', target='en', url='https://official.example/package.zip', size=7, sha256='0' * 64)
            with patch.object(engine.urllib.request, 'urlopen', side_effect=lambda *_args, **_kw: archive.open('rb')):
                with self.assertRaises(ValueError):
                    engine.install_package(spec, root / 'installed')
            self.assertFalse((root / 'installed/pt-en/.verified-sha256').exists())


if __name__ == '__main__':
    unittest.main()
