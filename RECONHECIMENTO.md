# Próxima avaliação de reconhecimento local

O reconhecimento do navegador continua disponível e padrão. Foi adicionado faster-whisper 1.2.1 como alternativa local experimental, modelo `base`, CPU int8. A tradução atual foi preservada.

Hardware detectado: AMD Ryzen 5 5500, NVIDIA GeForce RTX 3050 com 6 GB de VRAM, 16 GB de RAM. As bibliotecas cuBLAS/cuDNN não estavam configuradas; esta versão usa CPU.

Candidatos:

- https://github.com/ggml-org/whisper.cpp — transcrição local CPU/GPU, Windows, VAD e exemplo whisper-stream.
- https://github.com/SYSTRAN/faster-whisper — transcrição com CTranslate2, CPU/GPU, int8 e VAD. Precisa de uma camada de processamento contínuo para legendas.
- https://github.com/k2-fsa/sherpa-onnx — modelos com streaming, incluindo chinês/inglês. Cobertura de português e licenças devem ser avaliadas por modelo.
- https://github.com/argosopentech/argos-translate — tradução offline separada do reconhecimento. Qualidade deve ser comparada com a tradução atual.

Plano de comparação: usar os mesmos trechos em português e mandarim (fala espontânea, explicações de aula, termos próprios e silêncio), medir atraso até primeira legenda/final, CPU/GPU/RAM e erros de palavras/caracteres. Começar com modelos multilíngues; variantes .en só reconhecem inglês. Os áudios de teste precisam ser fornecidos ou obtidos de fontes com permissão de uso. Manter um motor só se a precisão e o atraso forem melhores para a aula; não inferir superioridade a partir de benchmarks de outros computadores.

## Medições realizadas

Foram geradas amostras sintéticas pelas vozes Windows Maria (português), Huihui (mandarim) e Zira (inglês). Comparados tiny/base, ambos em CPU int8, com clipe completo e segmentação por pausas. Resultado detalhado em `data/qa/bench/results.json`. Nas amostras em português e inglês, a segmentação por pausas preservou as palavras de referência; blocos fixos de 4 segundos haviam cortado a palavra “tela”, motivando a mudança. Trata-se de uma amostra por idioma, não uma estimativa geral de precisão.

Na integração HTTP da sala, `base` processou português (11,4s de áudio) em 1,2s e mandarim (8s) em 1,2s. Este tempo não inclui acumular o áudio até uma pausa. Mandarim foi retornado em caracteres tradicionais. O CER bruto dos relatórios inclui diferenças de escrita tradicional/simplificada, portanto não mede sozinho a fidelidade semântica.

Ainda não foram comparados: Whisper.cpp, vozes espontâneas, ruído de aula, microfone físico ponta a ponta, muitas pessoas simultâneas e GPU. Não há evidência para declarar a opção local superior ao navegador que o usuário já validou.

Separar áudio transitório para processamento da gravação persistente: o produto deve continuar preservando apenas texto, salvo autorização explícita para guardar áudio. Código aberto local evita tarifa de API por minuto, mas exige recursos computacionais e manutenção.

## Palavras citadas em aula

A fala final em português recebe aspas em referências explícitas de uma palavra, como `A palavra carro tem quantas letras?` → `A palavra “carro” tem quantas letras?`. O tratamento ocorre no navegador antes da tradução e da criptografia, preservando a fala recebida em `rawText`. Texto digitado não é reformulado. Termos já entre aspas permanecem iguais. A regra trata palavras isoladas após “a/essa/esta palavra” com verbos conhecidos; não infere expressões completas, outros idiomas nem referências ambíguas. Nenhum código ou modelo do Transync AI foi incorporado.


## Whisper no navegador e comparação ampliada

Veja WHISPER-NAVEGADOR.md para preparação, validação, modelos fixados e benchmark base/small/turbo. A alternativa experimental roda no dispositivo com WebGPU, sem enviar áudio à plataforma. O serviço Python continua base por padrão.
