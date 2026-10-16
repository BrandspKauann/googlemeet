# Som no compartilhamento de tela

Professora e aluno podem enviar o áudio que o navegador fornecer no compartilhamento. Ao selecionar a fonte, é necessário habilitar **Compartilhar áudio**. Para um PowerPoint no computador, selecione a tela inteira com áudio do sistema quando essa opção estiver disponível. Uma janela isolada não garante captura de som em todos os navegadores/sistemas.

O site solicita `audio`, `systemAudio: include` e `windowAudio: system`. Esses parâmetros oferecem opções ao usuário; não concedem permissões nem garantem disponibilidade. `selfBrowserSurface: exclude` evita sugerir a própria aba da chamada; `restrictOwnAudio: true` solicita a exclusão do áudio produzido pela chamada quando suportado, reduzindo recaptura. A prévia local permanece sem reprodução de áudio para evitar duplicação. Microfone e compartilhamento usam trilhas independentes, sem filtros de supressão de ruído na trilha de mídia compartilhada.

A conexão reserva quatro transceptores: microfone, câmera, vídeo de tela e áudio de tela. O receptor reproduz o áudio compartilhado em elemento separado. Se o navegador bloquear a reprodução, aparece **Ouvir som compartilhado** nos controles da apresentação. Sem trilha de áudio capturada, o apresentador recebe aviso persistente para compartilhar novamente com som. Parar o compartilhamento encerra vídeo e áudio de tela, preservando o microfone.

Após esta atualização, ambos os participantes devem recarregar o site para usar a mesma configuração de conexão.

Validação em 16/10/2026: duas sessões Chromium, WebRTC real, tela sintética e tom de teste; medição de sinal de áudio não silencioso no receptor nos dois sentidos; funcionamento com microfone desligado; ligar/desligar microfone sem encerrar o som da tela; bloquear/desbloquear reprodução; parar/reiniciar compartilhamento; aviso para captura sem áudio. Os 19 testes existentes e o build passaram. Não foi usada a tela pessoal do usuário e não houve captura física de PowerPoint, áudio do sistema ou seletor de fontes do sistema operacional. Esses caminhos ainda dependem da disponibilidade do navegador e de validação no dispositivo real.

Referências: [Screen Capture API / getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [Chrome: controles de compartilhamento](https://developer.chrome.com/docs/web-platform/screen-sharing-controls), [W3C: Screen Capture](https://w3c.github.io/mediacapture-screen-share/).
