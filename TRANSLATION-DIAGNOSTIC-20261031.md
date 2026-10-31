# Diagnóstico de tradução e pausa — 31/10/2026

## Atualização implementada

O servidor recebe a fala apenas depois de três segundos consecutivos de silêncio
detectado no microfone. Retomar a fala zera a contagem. O tempo é calculado pelas
amostras de áudio, não por um temporizador de interface. Foram testadas as
fronteiras exatas em 16 kHz, 44,1 kHz e 48 kHz: até uma amostra antes dos três
segundos, não há envio. Fala contínua não é enviada em blocos antecipados.

Depois de reconhecidos, os resultados completos do servidor seguem diretamente
para tradução, removendo os 500 ms adicionais do agrupador de texto. O original,
a tradução e a criptografia seguem o fluxo existente. Desligar o microfone ou
encerrar a aula conclui explicitamente a última fala, sem espera adicional.

Três segundos é a espera mínima de silêncio detectado antes de iniciar o envio;
não é a latência total da legenda. Rede, fila, Whisper e tradução vêm depois.
O detector atual usa energia de áudio; ruído constante pode prolongar a espera.
Os motores experimentais alternativos não foram alterados: esta política é do
reconhecimento no servidor, selecionado por padrão na versão online.

## Modelos e evidência

Reconhecimento: Whisper large-v3 CUDA. Tradução pt↔zh: Tencent Hy-MT2-1.8B Q8_0,
diretamente entre os dois idiomas, em CPU. Outros pares continuam no Argos.

Oito textos sintéticos de aula foram enviados ao serviço real. Saídas completas
em [benchmarks/TRANSLATION-20261031.json](benchmarks/TRANSLATION-20261031.json).
A rodada concluída mediu 2,464 a 5,511 segundos por tradução, sem contar áudio,
pausa ou Whisper. Uma tentativa anterior retornou 503 durante a execução dos
testes; a causa desse erro isolado não foi determinada.

Números, meses versus anos, negação, terceiro versus quarto tom e a palavra
portuguesa “carro” foram preservados nos exemplos correspondentes. Há uma falha
pedagógica clara: “请把‘你好’这两个字再读一遍” perdeu o número dois e traduziu
caracteres como palavras. O resultado foi “Por favor, leia as palavras ‘你好’
mais uma vez”, em vez de pedir para ler novamente os dois caracteres.

Isso não é uma medição de precisão estatística nem uma comparação com modelos
maiores ou com voz humana. Não há base para afirmar que este é o melhor modelo
absoluto para a aula.

## Melhorias avaliadas e prioridades

Foram testados glossário, instrução contextual, instrução em chinês e parâmetros
de amostragem recomendados pelo fabricante nesse exemplo. Não corrigiram a falha
de maneira consistente; uma variante passou a traduzir “duas vezes”, agravando
o erro. Essas alterações não foram publicadas.

Prioridade de qualidade: comparar Hy-MT2-7B com o atual em um conjunto revisado
pela professora, separando transcrição de tradução. Os modelos maiores existem,
mas não foram instalados nem medidos neste computador; não há garantia de atraso
aceitável junto ao Whisper e à chamada. Não se deve substituir o modelo ativo
apenas pelo tamanho ou por resultados agregados do fabricante.

Incluir na avaliação: caracteres versus palavras, tons, pinyin, números, negações,
termos citados, frases longas e gravações consentidas de vozes reais. Só adotar
uma configuração nova após comparar os mesmos exemplos e sua latência.

Fonte primária: [Tencent Hy-MT2 model card](https://huggingface.co/tencent/Hy-MT2-1.8B/blob/main/README.md),
com modelos 1.8B, 7B e 30B-A3B, exemplos de glossário e parâmetros de inferência.

64 testes Node passaram, incluindo silêncio, retomada de fala, ordem de resultados,
limites de trecho e conclusão da última fala ao desligar o microfone.
