# Desfoque de fundo da câmera

O botão **Borrar fundo** fica no cabeçalho da sala para professora e aluno.
É opcional e independente do filtro de beleza. A primeira ativação carrega os
recursos visuais automaticamente; não há assinatura nem API paga.

## Implementação

- MediaPipe Tasks Vision **1.0.1**, com modelo Selfie Segmenter Landscape float16,
  versão 1. O modelo tem **250.177 bytes**, com SHA256 fixado no build.
- Runtime, Worker e modelo são servidos pela própria Vercel. O navegador não
  depende de consultar um CDN externo para ativar o desfoque.
- `MediaStreamTrackProcessor` e `MediaStreamTrackGenerator` conectam a câmera
  a um Worker com `OffscreenCanvas`; não usamos `requestAnimationFrame` nem
  temporizadores da interface para gerar os quadros da câmera.
- Segmentação a até 10 Hz, vídeo a até 24 fps e tamanho máximo de 960×720.
  A máscara tem suavização temporal e nas bordas; somente o fundo é borrado.
- A sequência é câmera → beleza, quando ativa → desfoque → WebRTC. A tela
  compartilhada e o microfone mantêm suas próprias faixas, sem passar pelo efeito.
- O modelo tenta GPU e, se a inicialização falhar, tenta CPU no mesmo Worker.
  O controle só é habilitado quando o navegador oferece as APIs necessárias.
  O alvo validado é Chrome recente no Windows; Edge usa as mesmas APIs.

Ao preparar o efeito, a faixa enviada é pausada. Uma falha não troca
silenciosamente para a câmera sem desfoque: o usuário pode desativar o botão
para retomar a câmera original ou o vídeo com beleza. Desligar a câmera cancela
a preparação e libera Worker, faixa clonada, máscara e saída. Os quadros não
são enviados ao servidor de transcrição nem armazenados pelo efeito.

O desfoque é visual e a separação pode variar com iluminação, cabelo e movimento.
Desempenho e qualidade precisam ser observados em diferentes dispositivos.

## Referências e licenças

- [Documentação oficial do Image Segmenter para Web](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js),
  que recomenda Worker para não bloquear a interface.
- [Modelos e visão geral](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter).
- [Modelo oficial usado](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite).
- [MediaPipe, Apache 2.0](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).
  A licença é preservada em `browser-beauty/BACKGROUND-LICENSE.txt` e no build.
- A alternativa nativa do sistema foi consultada, mas não é a dependência do
  aplicativo por sua disponibilidade variável entre sistemas/câmeras:
  [Background Blur API, Chrome](https://developer.chrome.com/blog/background-blur).

## Validação de 17/10/2026

54 testes Node passaram, incluindo cancelamento da preparação, liberação de
faixas e ausência de envio do fundo original após falha. O build verifica o
checksum do modelo antes de publicar.

Dois participantes Chrome com câmera nativa simulada e um retrato de teste
validaram a segmentação real, beleza combinada com desfoque, recepção por WebRTC,
ativação pelo aluno, desligamento da beleza sem perder o desfoque e desligamento
do desfoque restaurando a faixa original. Capturas foram inspecionadas para
confirmar fundo suavizado e pessoa preservada. Não é avaliação com webcam humana
nem teste de todos os navegadores/dispositivos.

O teste de continuidade usou compartilhamento simulado e mediu somente a faixa
WebRTC da câmera: 83 quadros em cinco segundos ao abrir outra aba e 84 após
comando de minimizar. O Chrome automático manteve `visibilityState=visible`
nessas operações; ocultação real da aba/janela não foi validada nesse ambiente.
O processamento usa fluxo de quadros em Worker para evitar dependência da
animação da página, mas o comportamento final depende também do navegador.

Os recursos são publicados em `/background-runtime/v1/` com cache longo.
Ao mudar runtime ou modelo, incremente essa versão de diretório para invalidar
arquivos antigos. O Worker também tem versão no URL. Isso permite reutilizar os
arquivos sem repetir o download ao ativar novamente.
