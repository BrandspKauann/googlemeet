# Sala clara e tradução definida pela professora

## Comportamento

- Antes de criar a sala, a professora escolhe o nome que usará na aula, o idioma da própria fala e o idioma do aluno. O aluno entra com o nome; não há seletor de idioma na entrada nem na sala dele.
- A configuração vale nos dois sentidos: o aluno lê a professora em seu idioma, e a professora lê as respostas no idioma dela. A própria fala aparece como original.
- O idioma do aluno é aplicado no servidor, mesmo que um cliente modificado envie outro idioma no pedido de entrada. Salas anteriores sem a configuração continuam compatíveis.
- Há dois balões estáveis: professora e aluno. Cada um mantém a última fala do respectivo papel. Com vários alunos, o segundo balão identifica o aluno que falou por último; o histórico preserva todas as falas.
- As filas de tradução são independentes por papel. Uma tradução atrasada não bloqueia o balão da outra pessoa; resultados antigos não substituem os mais recentes do mesmo papel.
- Tela compartilhada ocupa a área principal com proporção preservada, câmeras compactas no computador, opção de recolher as câmeras e tela cheia mantendo as legendas. Em telas estreitas, as câmeras são recolhidas durante a apresentação. Em telas baixas na horizontal, os balões ficam ao lado do material.
- Cada dispositivo ainda precisa ativar a tradução para permitir o download dos idiomas pelo navegador. Isso não permite ao aluno alterar o par definido pela professora.

## Verificação de 15/10/2026

- `npm test`: 19 testes passaram, incluindo PostgreSQL, configuração dos idiomas persistida, rejeição de idioma inválido, tentativa do aluno de sobrescrever a configuração, criptografia, fila persistente e encerramento.
- `npm run build`: passou.
- Navegador Chromium separado, com duas sessões locais: cadastro, escolha do nome da aula, configuração português/mandarim, convite, entrada e aprovação do aluno, preparação dos dois idiomas, mensagens simultâneas, eventos finais de reconhecimento simultâneos, câmera em cada sessão, compartilhamento WebRTC recebido pelo aluno, expansão, tela cheia e interrupção do compartilhamento.
- Dimensões verificadas: 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 360×640 e 844×390. Sem rolagem horizontal, sem sobreposição dos balões com os controles, com material e controles visíveis. Capturas e medições locais ficam em `data/qa/`, ignorado pelo Git.
- Nenhum erro JavaScript no fluxo de navegador.

O teste de interface usou câmera e apresentação sintéticas, eventos de reconhecimento controlados e um tradutor simulado para verificar o fluxo de idiomas e concorrência. Não mede precisão de voz real, qualidade da tradução do Chrome, nem conectividade entre redes externas. A precisão do Whisper continua experimental, conforme `WHISPER-NAVEGADOR.md`.

## Implantação

### Zoom local do conteúdo compartilhado

O espectador de uma tela compartilhada tem controles de 100% a 400%, em passos de 25%, com ajuste ao enquadramento completo. Pode mover o conteúdo ampliado com arraste do mouse/toque, setas ou rolagem. Os limites de movimento consideram a proporção original do vídeo. O zoom não altera o compartilhamento nem a visualização dos outros participantes; é reiniciado quando o compartilhamento termina ou a fonte muda.

Verificação adicional em navegador separado: recepção WebRTC de uma apresentação sintética, zoom em 200%, arraste, limite em 400%, retorno a 100%, atalhos de teclado, isolamento em relação à visualização da professora e controles em 1366×768, 390×844, 360×640 e 844×390. O fluxo anterior dos dois balões também passou.

Executar `npm run db:migrate` antes de publicar. A mudança adiciona somente a coluna opcional `ag_rooms.student_language`; preserva salas, contas e transcrições existentes. A conexão do banco continua em variável de ambiente privada.
