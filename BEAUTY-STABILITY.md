# Reinstalação e reconstrução do filtro — 31/10/2026

O usuário relatou que a câmera congela ao ativar o filtro e volta ao desativá-lo.
As correções anteriores não resolveram esse relato. A câmera real do usuário
não foi acessada; os testes abaixo usam câmera sintética em Chrome descartável.

## Integração atual

`Vídeo nativo da câmera → cópia RGBA própria → Worker de efeitos → canvas nativo → WebRTC`

O módulo anterior `worker-beauty.js` foi removido. A nova captura está em
`dist/beauty-runtime.js`. Não usa TrackProcessor, TrackGenerator nem VideoFrame,
nem envia buffers físicos da câmera entre threads. O vídeo nativo fornece cópias
de pixels; há no máximo uma entrada pendente, sem teto fixo de FPS. O mesmo
rastreador facial continua compartilhado pelos dois efeitos combinados.

OpenMakeupSDK, GPUPixel, Porcelana automático e controles foram preservados.
As dependências foram reinstaladas com `npm ci --ignore-scripts --prefer-online`
e os arquivos do navegador foram reconstruídos. Transcrição e tradução no
Docker não foram alteradas.

## Limpeza e instalação no navegador

- Cache novo: `aula-beauty-resources-20261031-reinstall1`.
- Na primeira preparação, apaga apenas caches antigos `aula-beauty-resources-*`.
- Baixa novamente os arquivos com `cache: reload` e verifica tamanho e SHA-256.
- Reutiliza a instalação verificada; repara arquivos ausentes ou corrompidos.
- O botão **Reinstalar filtro** encerra o efeito, mantém a câmera original,
  limpa os recursos do filtro, baixa novamente e reaplica as intensidades atuais.
- Não apaga contas, IndexedDB, transcrições, chaves de acesso ou outros caches.

A instalação nova ocorre ao abrir a câmera na página atualizada. Não pode
alterar o código de uma aba antiga que o usuário ainda não recarregou.

## Evidências

65 testes Node passaram, incluindo migração de cache, hash, corrupção,
reinstalação, transporte de pixels próprios e encerramento sem parar a câmera
original. Teste real de navegador com cache antigo semeado:

- 120 requisições de recursos pesados na instalação nova.
- 120 novamente ao clicar em Reinstalar filtro.
- Zero downloads repetidos após recarregar e reutilizar a instalação verificada.
- Cache privado não relacionado preservado; intensidade personalizada preservada.
- Imagem em movimento antes e depois da reinstalação.

Sala local com professora e aluno: oito imagens distintas em oito amostras com
ajustes abertos, fechados, aba do aluno ativa e após desligar/religar o filtro.
Ao interromper deliberadamente o Worker, voltou à câmera original em 2.965 ms,
com movimento. Não houve aviso de VideoFrame retido nessa versão.

Essas medições não confirmam o resultado em todos os drivers. É necessário
retestar no equipamento em que o congelamento foi relatado.
