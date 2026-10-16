# Beleza gratuita com GPUPixel

## Escolha e origem

O motor de efeitos é uma adaptação para WebGL2 dos filtros originais do [PixPark/GPUPixel](https://github.com/pixpark/gpupixel), projeto com documentação chinesa e licença Apache-2.0. Commit fixado: `ef552bf8ce2d0d41fa9b979bfb5c7cf79374ca88`.

Foram adaptados os shaders de `BeautyFaceUnitFilter` e `FaceReshapeFilter`, o box blur de raio 4, a diferença quadrática com delta 7,07 e as quatro tabelas de cor originais. O controlador WebGL é próprio. Não se trata de renomear um filtro genérico nem de usar uma licença de demonstração comercial. O arquivo `dist/gpupixel/NOTICE.txt` registra fontes e alterações; a licença integral acompanha os arquivos distribuídos.

O detector nativo do GPUPixel não foi incluído. O rastreamento auxiliar usa Google MediaPipe Tasks Vision **1.0.1** e o modelo `face_landmarker/float16/1`, carregados apenas ao ativar o efeito. Um adaptador converte os pontos necessários para a interface de 106 pontos dos shaders originais. O wrapper e a estabilização temporal vêm de `ctbot000/face-beautifier`, commit `ca5ad40b58e2d0133de6b22282b29000d3667046`, sob MIT; nenhum algoritmo de embelezamento desse outro motor foi integrado. Não é uma versão oficial completa do SDK GPUPixel.

## Uso

Na sala, a professora abre **✧ Beleza**, liga a câmera e ativa o efeito. Há suavização da pele (磨皮), luminosidade (提亮), contorno do rosto (瘦脸) e realce dos olhos (大眼), cada um com intensidade independente. Os presets são ajustes do Aula Global sobre esses filtros, não presets licenciados de aplicativos comerciais.

O filtro combinado começa habilitado em Porcelana a cada nova aula. Os ajustes durante a aula não substituem esse padrão na aula seguinte. **Ver original** altera apenas a prévia da professora: o aluno continua recebendo o efeito ativo. Desativar o efeito devolve a trilha original à chamada; desligar a câmera encerra tanto a trilha original quanto a processada. O compartilhamento de tela e o áudio não passam pelo filtro.

Os quadros são processados no dispositivo e enviados ao outro participante apenas pela chamada WebRTC. Não há upload para API de beleza, gravação de vídeo, chave comercial, licença com prazo ou cobrança por uso do filtro. O primeiro uso requer internet para baixar o runtime/modelo de rastreamento. A transmissão da aula continua dependendo da rede e da infraestrutura já usada pelo site.

## Falhas e limites

Exige WebGL2 e captura de canvas. Se a preparação ou a GPU falhar, a interface informa o problema e mantém a câmera original. Sem rosto detectado, a saída permanece neutra. O processamento é limitado a 960 pixels de largura e 720 de altura, com captura pretendida de até 24 fps; desempenho real varia com dispositivo, abas em segundo plano e uso simultâneo de Whisper/WebGPU.

Esta adaptação usa pontos faciais diferentes do detector nativo e não promete resultado idêntico ao GPUPixel nativo, Meitu, Douyin ou Tencent. A professora deve ajustar o efeito na própria iluminação. Não houve avaliação com sua câmera pessoal nesta etapa.

## Verificação em 15/10/2026

- Compilação real dos shaders GLSL em Chromium; quadro neutro conferido pixel a pixel nas cores de referência, incluindo orientação vertical.
- Rastreamento facial real com o modelo MediaPipe e uma imagem pública de referência de seus exemplos; não foi acionada a câmera pessoal do usuário.
- Duas sessões locais: controle exclusivo da professora, câmera recebida pelo aluno via WebRTC, troca da trilha de saída para o efeito, comparação local com original, ativação/desativação repetida e liberação da câmera.
- Diálogo em 1366×768, 390×844 e 360×640, sem transbordamento horizontal. A sala, compartilhamento, zoom e balões à esquerda também foram verificados no fluxo de oito tamanhos.
- Os 19 testes existentes e o build passaram. Capturas e scripts de QA ficam em `data/qa/`, ignorado pelo Git.

Os testes de vídeo usam uma imagem transmitida por uma câmera sintética, não uma aula real. Compatibilidade com câmera física, uso prolongado e abas em segundo plano continua exigindo avaliação no dispositivo da professora.
