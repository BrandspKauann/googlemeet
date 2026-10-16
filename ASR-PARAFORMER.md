# Paraformer disponível no site publicado

O site oferece **Mandarim e inglês — Paraformer (experimental)**. Funciona no navegador que acessa a Vercel: não requer instalar Python ou hospedar um servidor ASR no computador da professora. O processamento consome CPU e memória do dispositivo de quem fala; não é inferência em GPU na nuvem.

Uso: configure o idioma do participante como mandarim ou inglês; na sala abra **Conversa → Usar reconhecimento de mandarim → Preparar reconhecimento**. Depois ligue o microfone. O reconhecimento do navegador e Whisper continuam como alternativas selecionáveis; não há troca silenciosa durante a aula. Português e espanhol exigem outro motor. A tradução do texto continua separada do reconhecimento.

## Modelo e distribuição

- Modelo bilíngue `csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en`, revisão `8e40c43232a1c5c66c82111efc5820d3accca11b`, pesos int8 com licença Apache-2.0.
- Runtime oficial WebAssembly SIMD de sherpa-onnx **1.12.33**, obtido do release `sherpa-onnx-wasm-simd-v1.12.33-zh-en-asr-paraformer.tar.bz2` (SHA-256 `7b7783ca94b6921d9327c467b51eeb9aae6704d09c49c67f60054225056982c9`). Arquivos originais e avisos em `dist/paraformer-runtime/`.
- Primeiro uso: aproximadamente 249 MB incluindo runtime e pesos. O encoder e decoder são baixados diretamente da revisão pública do modelo; os arquivos têm tamanho e SHA-256 verificados antes de carregar. O cache armazena somente recursos do modelo. Sem espaço para cache, o carregamento continua, mas poderá baixar novamente em outro acesso.
- CPU em Worker separado, sem exigir WebGPU, SharedArrayBuffer ou alterar o isolamento da página. Memória e desempenho podem limitar o uso em dispositivos mais modestos, especialmente junto com os efeitos de beleza.

## Captura e privacidade

Reutiliza o AudioWorklet existente: mono a 16 kHz, trechos nas pausas de 2 a 10 segundos, fila limitada a dois trabalhos, com aviso e registro de trechos omitidos por sobrecarga. Cada trecho usa um stream do reconhecedor e conclui a entrada antes de liberar seus buffers. Não há promessa de legendas parciais em tempo subsegundo: embora o modelo seja streaming, esta integração publica resultados por trecho.

O áudio é transferido ao Worker e não enviado a uma API de transcrição. A rede baixa o runtime/modelo; as falas reconhecidas seguem o fluxo existente de tradução, criptografia no navegador e IndexedDB. Parar o microfone conclui os trechos pendentes. Cancelar a preparação ou encerrar a sala termina o Worker. Uma falha não muda automaticamente de motor.

## Verificação e limites

Em 16/10/2026, o modelo real reconheceu a amostra sintética chinesa `benchmarks/zh.wav`: `老师你好今天我们一起学习中文请问你能听到我的声音吗` (CER 0% após normalização). O processamento desse trecho de 8,02 segundos levou aproximadamente 3,13 segundos no Chromium de testes. Isso é um teste funcional, não uma comparação de qualidade com Whisper nem garantia de precisão em fala humana, sotaques brasileiros ou palavras isoladas.

O teste do fluxo com microfone sintético e trechos separados apresentou uma omissão (`文`), CER de 4% naquela execução. Os 21 testes automatizados passaram. A verificação entre duas sessões confirmou o recebimento das falas pelo aluno, conclusão da última fala ao desligar o microfone, silêncio sem texto, rejeição de idioma não suportado, cache após abortar/preparar novamente, transcrições criptografadas e ausência de envio de áudio à API. Resultados de transcrição não são avaliação de pronúncia ou de tons. Hotwords, pinyin, Qwen3-ASR e FireRedASR2 não foram adicionados nesta entrega.

Referências: [WASM oficial](https://k2-fsa.github.io/sherpa/onnx/wasm/hf-spaces.html), [modelo e licença](https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en), [sherpa-onnx 1.12.33](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.12.33).
