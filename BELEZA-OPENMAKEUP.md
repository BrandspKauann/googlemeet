# OpenMakeupSDK na câmera

Integração experimental de `open-makeup-sdk` **0.1.0** e Three.js **0.184.0**, versões exatas no package-lock. Origem: https://github.com/ehsanwwe/OpenMakeupSDK. Ambas as bibliotecas usam MIT; as licenças acompanham `/openmakeup/LICENSES.txt`. O build hospeda localmente o modelo, shaders e texturas do pacote.

Na sala da professora, o painel **Filtro de beleza** usa somente o processamento combinado: primeiro GPUPixel e depois OpenMakeupSDK. Não há seletor de motor nem nomes dos projetos na interface. As licenças permanecem distribuídas com os recursos.

Cada nova aula começa com o filtro habilitado no preset **Porcelana** (suavização 68, luminosidade 36, rosto 15, olhos 12, blush 35, batom 30, nariz 10). O efeito é aplicado automaticamente quando a professora liga a câmera, após preparar os recursos. Ela pode ajustar, selecionar outro preset ou desativar durante a aula. Preferências antigas não substituem o padrão Porcelana na próxima aula. O modo combinado exige mais recursos do dispositivo.

O adaptador usa o motor real do SDK e suas camadas de maquiagem. Acrescenta intensidade de alfa aos shaders de blush/batom e limita a remodelagem do nariz. Não há promessa de equivalência ao Meitu nem de origem chinesa desse SDK. Ele não fornece nesta integração a suavização do GPUPixel.

O SDK reaproveita o stream da aula, sem abrir outra câmera. MediaPipe Tasks Vision fornece pontos 3D ao motor no lugar da captura e rastreamento legados do SDK. A saída de canvas substitui a trilha WebRTC: o efeito chega ao aluno. Comparar original altera apenas a prévia. Desativar restaura a trilha original; desligar a câmera libera ambas. Sem rosto, as camadas faciais ficam ocultas. O áudio e a apresentação não passam pelo processamento.

Tudo é processado no dispositivo, sem API paga ou upload de quadros para serviço de maquiagem. O rastreamento baixa seus recursos externos ao ativar, conforme documentado em BELEZA-GPUPIXEL.md. O filtro começa habilitado em Porcelana; se a preparação falhar, informa o problema e preserva a câmera original. Exige GPU/WebGL2 e captura de canvas; falhas informam o problema e mantêm a câmera original.

Validação de 15/10/2026: Chromium com GPU, modelo facial real e retrato público transmitido por câmera sintética; duas sessões e câmera recebida via WebRTC; alteração efetiva de pixels ao ajustar a maquiagem; troca OpenMakeup/GPUPixel, comparação local, desativação, câmera desligada, indisponibilidade de WebGL e diálogo responsivo em 1366×768, 390×844 e 360×640. Não houve avaliação na câmera física da professora nem durante uma aula prolongada. Desempenho e aparência devem ser avaliados no dispositivo real.
