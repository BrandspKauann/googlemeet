# Comparação local de transcrição

Amostras sintéticas Windows TTS; uma execução de aquecimento e três medições por caso. CPU int8, quatro threads. Não há avaliação de voz humana ou espanhol neste conjunto.

| Modelo | Amostra | Erro bruto médio | Processamento mediano | RTF |
|---|---|---:|---:|---:|
| base | pt.wav | WER 0.0% | 0.809s | 0.071 |
| base | zh.wav | CER 36.0% | 0.776s | 0.097 |
| base | en.wav | WER 0.0% | 0.754s | 0.125 |
| base | pt-question.wav | WER 0.0% | 0.790s | 0.106 |
| base | pt-numbers.wav | WER 31.6% | 0.850s | 0.084 |
| base | pt-terms.wav | WER 0.0% | 0.802s | 0.083 |
| base | pt-silence.wav | WER 0.0% | 0.030s | 0.010 |
| small | pt.wav | WER 0.0% | 2.601s | 0.228 |
| small | zh.wav | CER 36.0% | 2.286s | 0.285 |
| small | en.wav | WER 0.0% | 2.206s | 0.365 |
| small | pt-question.wav | WER 0.0% | 2.228s | 0.300 |
| small | pt-numbers.wav | WER 36.8% | 2.444s | 0.240 |
| small | pt-terms.wav | WER 0.0% | 2.373s | 0.245 |
| small | pt-silence.wav | WER 0.0% | 0.027s | 0.009 |
| turbo | pt.wav | WER 0.0% | 9.150s | 0.801 |
| turbo | zh.wav | CER 0.0% | 9.071s | 1.131 |
| turbo | en.wav | WER 0.0% | 8.961s | 1.482 |
| turbo | pt-question.wav | WER 0.0% | 9.376s | 1.264 |
| turbo | pt-numbers.wav | WER 36.8% | 9.170s | 0.902 |
| turbo | pt-terms.wav | WER 0.0% | 9.425s | 0.974 |
| turbo | pt-silence.wav | WER 0.0% | 0.021s | 0.007 |

RTF abaixo de 1 significa processamento mais rápido que a duração do arquivo neste teste; não inclui espera pela pausa, tradução, rede ou concorrência com videochamada.

WER/CER removem pontuação e maiúsculas, mas contam números por extenso versus dígitos e escrita chinesa tradicional versus simplificada. Essas diferenças não demonstram necessariamente erro de significado.

Modelos ainda sem medições: nenhum.

Whisper no navegador/WebGPU: o build e o fluxo foram testados por código, mas a execução real não foi confirmada aqui. A primeira abertura direta foi bloqueada; a navegação pelo link da sala funcionou e mostrou download em andamento. O primeiro download falhou com erro de rede; a versão com recuperação de partes voltou a mostrar progresso. O perfil fp16/q4 permanece experimental e exige validação sintética durante a preparação no dispositivo.

Não há evidência suficiente para declarar superioridade geral ou trocar o padrão do serviço local. Use WHISPER-NAVEGADOR.md para comparar sua voz.
