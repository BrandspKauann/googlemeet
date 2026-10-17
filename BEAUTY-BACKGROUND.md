# Câmera com beleza em segundo plano

O fluxo combinado usa `MediaStreamTrackProcessor` (buffer de um quadro), streams
transferidos para um Worker clássico, OffscreenCanvas/WebGL e
`MediaStreamTrackGenerator`. A câmera enviada não depende de vídeo HTML,
`requestAnimationFrame`, `setInterval` ou visibilidade da página. Não há troca
para o vídeo original ao mudar de aba. GPUPixel e OpenMakeup continuam combinados,
com dois rastreadores faciais e os mesmos controles/padrão Porcelana.

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
