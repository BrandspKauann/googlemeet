# Saída nativa da câmera com filtro — 31/10/2026

O usuário confirmou congelamento completo com o filtro ligado e recuperação ao
desligá-lo. A alteração anterior, que melhorava a fluidez em testes sintéticos,
não resolveu esse relato. O congelamento completo no dispositivo do usuário
ainda não foi reproduzido no ambiente de teste.

## Alteração atual

- Removido o limite de 20 fps e excluído o agendador de descarte de quadros.
- Removidos os limites fixos de FPS dos caminhos compatíveis e do desfoque.
- A saída principal usa `HTMLCanvasElement.captureStream()` sem argumento de
 taxa de quadros, com captura solicitada a cada imagem concluída.
- O Worker devolve buffers RGBA próprios. Não há `MediaStreamTrackGenerator`
 nem timestamps sintéticos na saída do filtro de beleza.
- O navegador administra a captura e o relógio do vídeo enviado ao WebRTC.
- O monitor observa tanto novas imagens renderizadas quanto quadros realmente
 capturados no track de saída. Se qualquer etapa parar, restaura a câmera
 original e informa a interrupção do efeito.
- Os efeitos combinados, Porcelana automático, rastreamento facial separado e
 download/cache do modelo no navegador permanecem ativos.

A taxa efetiva depende da câmera, do navegador e do tempo de processamento.
Não existe mais um teto fixo de FPS definido pelo filtro. A resolução de
processamento ainda se ajusta em caso de sobrecarga; isso não é um limite de FPS.
Nenhum vídeo da câmera é enviado ao servidor de transcrição/tradução.

## Verificações

Chrome com NVIDIA D3D11 e câmera sintética móvel de 24 fps: saída acompanhando
aproximadamente 24 fps. Sala local com professora e aluno, vídeo recebido por
WebRTC: oito imagens distintas em oito amostras com ajustes abertos, fechados,
a aba do aluno ativa e após desligar/religar o filtro. O teste também forçou
timestamps repetidos na entrada da câmera.

Ao interromper deliberadamente o Worker, a câmera original voltou em 2.537 ms
e manteve movimento. O aviso de VideoFrame no console nessa interrupção forçada
é esperado; o encerramento normal libera os quadros antes de terminar o Worker.

65 testes Node passaram. Os testes novos verificam captura sem argumento de
FPS, entrega de todos os quadros de saída, acompanhamento de todos os callbacks
de vídeo no modo compatível e recuperação se a captura parar mesmo com o Worker
continuando a produzir pixels. Essas verificações não substituem a confirmação
no equipamento em que o usuário observou o congelamento.

Câmera e filtro executam no navegador do participante. Whisper e tradução
executam no servidor Docker, sem alteração nesta entrega.
