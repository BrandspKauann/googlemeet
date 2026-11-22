# Captura de legendas do aluno — 22/11/2026

Relato: professora ouve o aluno normalmente, mas não aparece transcrição e o aluno não vê mensagem de erro. Não acessei o microfone pessoal nem confirmei a causa do episódio original.

Encontrei um caminho de falha silenciosa: o AudioContext das legendas era construído depois de aguardar a credencial remota e sua chamada resume() não tinha prazo. Se o navegador mantivesse esse contexto suspenso, a chamada WebRTC continuaria transmitindo a voz, mas a captura das legendas aguardaria indefinidamente, antes mesmo de instalar o watchdog.

Preparei e retomei o contexto no clique do microfone, antes de aguardar a permissão e as chamadas de rede. Reutilizei esse contexto no reconhecimento e na reconexão manual. Limitei a cinco segundos a espera por resume(); bloqueio mostra erro e libera os recursos das legendas, mantendo a voz da chamada. Falhas iniciais agora expõem explicitamente Reconectar legendas. O chat mostra o texto de mediaStatus em uma faixa visível. Acrescentei exclusão mútua para cliques sobrepostos do microfone; o polling respeita esse bloqueio. O estado informa quando o microfone foi desligado.

Diagnóstico temporário local: contagem de frames/bytes enviados, respostas, tokens originais recebidos e estado de captura. Nenhum áudio, conteúdo reconhecido, chave ou credencial é incluído nesse diagnóstico.

Validações: 18 testes focados passaram, incluindo contexto preparado no clique, reutilização, resume bloqueado com erro em cinco segundos, timeout/reconexão, encerramento, falha de saldo e preservação do microfone da chamada. Chrome com duas sessões, microfones sintéticos e Soniox simulada: bloqueio de contexto construído após solicitar o microfone; a versão corrigida preparou o contexto antes, transmitiu PCM, exibiu falas e traduções nos dois sentidos, preservou histórico após reload e mostrou estado visível no chat. Nenhum erro JavaScript, nenhum pedido a ASR/tradutor Docker, nenhum teste pago.

Limite: testes simulados comprovam o caminho corrigido, não a configuração específica do dispositivo do aluno. O diagnóstico de uma nova ocorrência deverá distinguir captura suspensa, áudio efetivamente enviado, respostas vazias e falha do provedor.
