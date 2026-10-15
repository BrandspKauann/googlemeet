# OpenMakeupSDK na câmera

Integração experimental de `open-makeup-sdk` **0.1.0** e Three.js **0.184.0**, versões exatas no package-lock. Origem: https://github.com/ehsanwwe/OpenMakeupSDK. Ambas as bibliotecas usam MIT; as licenças acompanham `/openmakeup/LICENSES.txt`. O build hospeda localmente o modelo, shaders e texturas do pacote.

Na sala da professora: ligue a câmera → **✧ Beleza** → selecione **OpenMakeupSDK** → ative o efeito. Há tom rosado, batom suave e contorno sutil do nariz. Natural começa com intensidades baixas e sem remodelagem. GPUPixel continua disponível no mesmo seletor para suavização, luminosidade, contorno do rosto e olhos. A opção **Combinar os dois · pele + maquiagem** aplica primeiro GPUPixel e depois OpenMakeupSDK, enviando a saída final ao aluno. Todos os sete ajustes ficam disponíveis. Os motores também continuam disponíveis separadamente. O modo combinado exige mais recursos do dispositivo.

O adaptador usa o motor real do SDK e suas camadas de maquiagem. Acrescenta intensidade de alfa aos shaders de blush/batom e limita a remodelagem do nariz. Não há promessa de equivalência ao Meitu nem de origem chinesa desse SDK. Ele não fornece nesta integração a suavização do GPUPixel.

O SDK reaproveita o stream da aula, sem abrir outra câmera. MediaPipe Tasks Vision fornece pontos 3D ao motor no lugar da captura e rastreamento legados do SDK. A saída de canvas substitui a trilha WebRTC: o efeito chega ao aluno. Comparar original altera apenas a prévia. Desativar restaura a trilha original; desligar a câmera libera ambas. Sem rosto, as camadas faciais ficam ocultas. O áudio e a apresentação não passam pelo processamento.

Tudo é processado no dispositivo, sem API paga ou upload de quadros para serviço de maquiagem. O rastreamento baixa seus recursos externos ao ativar, conforme documentado em BELEZA-GPUPIXEL.md. Os efeitos começam desligados a cada carregamento. Exige GPU/WebGL2 e captura de canvas; falhas informam o problema e mantêm a câmera original.

Validação de 15/10/2026: Chromium com GPU, modelo facial real e retrato público transmitido por câmera sintética; duas sessões e câmera recebida via WebRTC; alteração efetiva de pixels ao ajustar a maquiagem; troca OpenMakeup/GPUPixel, comparação local, desativação, câmera desligada, indisponibilidade de WebGL e diálogo responsivo em 1366×768, 390×844 e 360×640. Não houve avaliação na câmera física da professora nem durante uma aula prolongada. Desempenho e aparência devem ser avaliados no dispositivo real.
