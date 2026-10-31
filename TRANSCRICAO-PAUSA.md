# Transcrição após uma pausa — 31/10/2026

Para reconhecimento no servidor, uma fala só é enviada automaticamente depois
de **3 segundos consecutivos de silêncio detectado**. Se a pessoa retoma a fala,
a contagem recomeça. Isso substitui o envio anterior em blocos a cada 4 segundos.
O microfone da chamada e o áudio recebido pelo outro participante continuam ativos.

Enquanto a pessoa fala, os buffers permanecem apenas em memória no navegador.
Blocos longos são reamostrados para mono 16 kHz e divididos em até 10 segundos
para respeitar os limites da API, mas não são enviados antes da pausa.
Os resultados desses blocos são unidos antes de apresentar a fala/tradução,
em ordem. A espera de 3 segundos é somada ao processamento, rede e tradução;
as medições anteriores de baixa latência não são a latência deste modo.

Desligar o microfone ou encerrar a aula conclui a fala pendente imediatamente,
sem exigir uma espera adicional de três segundos. Abortar descarta os buffers.
A fila continua limitada a dois trabalhos; uma interrupção/sobrecarga é informada.
O buffer tem proteção contra falas contínuas extremas (mais de 120 blocos).
Áudio não é persistido. Reconhecimento experimental no dispositivo não mudou.

Validação: testes de pausa menor que 3 segundos, retomada da fala, fala contínua
com 12 segundos sem envio precoce, divisão de WAV, união dos textos, descarte
no abortar e conclusão ao desligar o microfone. 63 testes Node passaram.

Chrome com microfone sintético e voz chinesa conhecida seguido de silêncio:
a primeira requisição ocorreu a 13,498s desde ligar o microfone, após os cerca
de 8s do WAV de origem; áudio mono 16 kHz, 320.044 bytes. Whisper large-v3 CUDA
real no Docker, túnel HTTPS, sala cloud local e tradução recebida pelo aluno.
Uma segunda requisição ao desligar o microfone concluiu a fala pendente.
É uma execução de integração, não garantia de prazo para todos os microfones/redes.

Resultados do servidor já agrupados por fala seguem diretamente para tradução,
sem acrescentar os 500 ms de espera usados anteriormente pelo agrupador de texto.
