# Restauração do renderizador anterior — 31/10/2026

O usuário confirmou que as tentativas com processamento de vídeo em Worker
continuavam congelando a câmera. O caminho ativo foi revertido para a integração
DOM anterior ao commit 6830757: vídeo da câmera → canvas GPUPixel → vídeo
intermediário → canvas OpenMakeupSDK → WebRTC. Não há transporte de imagens em
Worker, TrackProcessor ou TrackGenerator no filtro de beleza. O pequeno Worker
beauty-clock.js só agenda chamadas de desenho quando a página está oculta.

Preservados: efeitos combinados, Porcelana automático, intensidades ajustáveis,
reinstalação de recursos com hash e cache, controles do fundo borrado e câmera
original durante a preparação. Não foi reintroduzido o antigo teto de 24 fps.
Transcrição, tradução e Docker não foram alterados.

## Debug e correções adicionais

A versão publicada c874eb8 não concluía a preparação em um teste que mantinha
HTMLMediaElement.currentTime constante enquanto a câmera seguia entregando
imagens. Esse bloqueio foi reproduzido antes da alteração. Isso demonstra uma
falha no controle de avanço; não prova que o dispositivo do usuário apresente
exatamente a mesma condição.

O renderer restaurado não descarta imagens por igualdade de currentTime.
Os callbacks de vídeo acionam cada desenho; o repaint recupera callbacks
interrompidos, e um relógio leve com confirmação mantém o agendamento oculto.
A textura do SDK é atualizada explicitamente a cada desenho. Os contextos
WebGL preservam o buffer destinado à captura e solicitam a captura após renderizar.

Diagnóstico local em **Copiar diagnóstico**: versão, GPU, resolução, FPS
informado pela câmera, contagens de desenhos e de imagens decodificadas em cada
etapa, horários de atualização e mensagem de erro. Não contém imagens, áudio,
conta, transcrição, deviceId ou groupId; não é enviado automaticamente ao servidor.

## Verificações

- 63 testes Node passaram, incluindo fonte com relógio em zero, callback nativo
  sem resposta, agendamento oculto, cancelamento e etapa de renderização parada.
- Chrome descartável, câmera sintética de 24 fps, relógio currentTime fixo:
  oito imagens distintas em oito amostras e aproximadamente 23,9 fps.
- Sala local, professora/aluno por WebRTC: oito imagens distintas em oito amostras
  com painel aberto, fechado, troca de aba, reativação e fundo borrado combinado.
- Botão de diagnóstico validado com clipboard simulado, sem alterar o clipboard real.
- Reinstalação e reutilização do cache verificadas com a integração restaurada.

O Chrome headless manteve visibilityState como visible mesmo após trocar de
alvo e solicitar minimização; portanto isso não valida uma janela realmente
minimizada. O caminho de agendamento oculto foi coberto por teste unitário. A câmera
real do usuário não foi acessada, e ainda é preciso confirmar o resultado nela.
