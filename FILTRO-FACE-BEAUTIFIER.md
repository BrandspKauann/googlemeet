# Filtro Face Beautifier — 18/11/2026

O filtro de câmera agora usa o renderizador WebGL2 do projeto https://github.com/ctbot000/face-beautifier. Revisão fixa e licença MIT estão em dist/face-beautifier/UPSTREAM.txt e LICENSE.txt. O caminho anterior GPUPixel + OpenMakeup deixou de ser carregado pela sala.

Professora e aluno aprovados têm o mesmo botão Filtro de beleza, com Porcelana inicialmente ativo, ajustes individuais, comparação original e opção de desligar. A saída do canvas é publicada no WebRTC e continua compatível com a etapa existente de fundo borrado. O filtro não espelha a imagem; a orientação segue as regras existentes da sala.

O modelo facial e MediaPipe são servidos pelo próprio site. O modelo é armazenado no cache local do navegador; reinstalar limpa somente o cache do filtro. Downloads de texturas e modelos dos efeitos anteriores foram retirados do manifesto. O processamento de imagens permanece no dispositivo de cada participante.

Adaptações: buffer WebGL preservado para captura, captura manual sem quota fixa de FPS, relógio Worker para a renderização quando a página estiver oculta, pausa desse relógio quando visível, cancelamento e descarte do contexto/saída sem encerrar a câmera original. O rastreamento facial é atualizado separadamente da renderização. Sem modelo facial, o renderizador mantém a suavização por tom de pele e avisa que o rastreamento está indisponível.

Validação: build completo, 72 testes Node passando; Chrome com duas sessões isoladas, câmeras sintéticas e transmissão WebRTC. Os controles ficaram disponíveis para as duas funções e pixels recebidos mudaram nos dois sentidos após aplicar o filtro. Intensidade, desligamento, reativação e rastreador pronto nos dois clientes foram verificados. O caminho de página oculta foi exercitado por evento de visibilidade simulado e teste do relógio; isso não comprova execução em páginas que o sistema operacional suspenda completamente. Nenhuma câmera pessoal foi acessada. Compatibilidade e desempenho em Safari, celulares e máquinas sem WebGL2 ainda exigem validação; em falha a câmera original permanece disponível com aviso.
