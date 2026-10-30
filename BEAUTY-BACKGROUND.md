# Câmera com beleza em segundo plano

O fluxo combinado usa `MediaStreamTrackProcessor` (buffer de um quadro),
transferência explícita de `VideoFrame` para um Worker clássico,
OffscreenCanvas/WebGL e `MediaStreamTrackGenerator`. Cada quadro de entrada
é liberado depois de usado, e cada saída recebe confirmação de escrita.
Há no máximo uma entrada e uma saída em trânsito. A geração dos quadros não
usa timers de animação; a suspensão da página/processo ainda pode interromper
as mensagens. GPUPixel e OpenMakeup continuam combinados, com os mesmos
controles e padrão Porcelana. O filtro executa no dispositivo da câmera;
Whisper e tradução executam no servidor Docker, em fluxos independentes.

O Worker é gerado por `npm run build` em `dist/openmakeup/worker.js`.
É clássico porque o carregador WASM do MediaPipe usa `importScripts`.
As texturas usam ImageBitmap e o shader de remodelagem recebe conversão de cor
igual à do fundo, evitando uma faixa de cor diferente no rosto.

Chrome/Edge recentes são necessários para este caminho. Se faltarem APIs ou o Worker não iniciar, o filtro tenta o pipeline combinado de compatibilidade. A interface avisa para manter a aba aberta nesse modo, sem garantir continuidade em segundo plano.
Falhas reais de GPU/Worker são informadas e preservam a chamada sem efeito.
Desligar a câmera cancela a preparação, encerra o Worker e libera a cópia da
câmera e a saída gerada. O Worker não envia nem persiste imagens.

## Verificação em 16/10/2026

- 27 testes automatizados passaram, incluindo transferência dos streams,
  cancelamento durante preparação, falha inicial e falha após prontidão.
- Chrome, perfil descartável, câmera sintética nativa Y4M com retrato público e
  marcador animado, transmissão WebRTC para outra página. Sem flags que desligam
  a limitação de processamento em segundo plano.
- Ao congelar a página emissora via CDP `Page.setWebLifecycleState`, o receptor
  decodificou mais 90 quadros em cinco segundos. A track enviada continuou sendo
  a track filtrada; ajustes do efeito alteraram os pixels do retrato recebido.
- Sala com professora/aluno: Porcelana automático, câmera processada recebida,
  edição, desligar/religar efeito e restauração do preset passaram.

O teste CDP não representa todos os sistemas operacionais. Suspensão do
computador, encerramento do navegador ou revogação da câmera interrompem captura.


## Preparação opcional (17/10/2026)

“Baixar recursos do filtro” guarda os assets e o modelo facial no cache
`aula-beauty-resources-v1`, com progresso e retomada por arquivo. Não guarda vídeo.
“Tentar ativar novamente” aparece após falha. O rastreador tenta CPU caso a
inicialização de seu delegado GPU falhe; a renderização continua exigindo WebGL.
Um teste com a API de geração de vídeo removida confirmou a câmera combinada
recebida pelo aluno. O download guardou 108 recursos. O fluxo com Worker também
continuou passando o teste de quadros recebidos em segundo plano.


## Recuperação de câmera travada (28/10/2026)

No caminho principal com Worker, rastreamento facial na CPU (5 Hz por rastreador),
saída de até 640x480 e 20 fps. A renderização de pele e maquiagem continua em
WebGL. Isso reduz a disputa com o Whisper CUDA no computador que hospeda a aula.
Os dois estágios continuam combinados, com os mesmos ajustes Porcelana.

Cada quadro efetivamente escrito pode emitir um sinal de progresso (até 1/s).
Após a prontidão, um monitor na interface detecta mais de 8 segundos sem progresso,
com verificação a cada 2 segundos. Uma falha retorna a câmera ao vídeo original,
informa o problema nos ajustes e permite reativar o efeito. Nenhum código encerra
a câmera original nessa recuperação. A frequência de timers depende do navegador;
não é garantia de prazo quando o sistema ou a página estão suspensos.

58 testes passaram. Em Chrome isolado com câmera sintética nativa e receptor
WebRTC, interromper silenciosamente o Worker restaurou quadros originais no aluno.
Reativar o efeito, combinar com desfoque e desligar/religar a câmera passaram.
Outro teste com microfone sintético confirmou câmera com beleza, Whisper large-v3
CUDA no Docker e tradução recebida no aluno. O teste usou renderização gráfica
por software no Chrome headless, não reproduz todos os drivers/dispositivos reais.
A causa específica do travamento relatado pelo usuário não foi capturada em logs;
a correção reduz a carga e cobre a falta de recuperação quando os quadros param.


## Transferência explícita e validação de movimento (30/10/2026)

O transporte anterior transferia os streams do processador/gerador. O novo
protocolo transfere cada `VideoFrame` com lista de transferência e confirma
consumo antes de avançar. Isso evita depender da clonagem/otimização de streams
na implementação do navegador e evita reter buffers da câmera. A saída usa
pixels RGBA próprios, sem compartilhar uma superfície WebGL mutável com o envio.
O relógio de saída é monotônico e independente dos timestamps da câmera.

Teste com `MediaStreamTrackProcessor` instrumentado para produzir frames com
timestamp constante: antes, o receptor mostrava somente uma imagem diferente
em oito amostras; agora mostra oito, com o efeito ainda ativo, tanto com o
painel aberto como fechado. O mesmo teste sem alteração de timestamps também
passou. Chrome headless foi configurado com ANGLE Direct3D11 e reportou a
RTX 3050 como renderizador; não foi só contagem de pacotes/quadros.

Não houve captura de logs da câmera real do usuário; isso comprova a regressão
simulada e sua correção, não todos os drivers possíveis. O teste CDP de 16/10
acima descreve a arquitetura antiga e não valida suspensão do novo transporte.
