# Ajustes da professora — 23/11/2026

Analisei os pedidos de produto na transcrição da aula, sem incorporar assuntos pessoais ao projeto. Os horários abaixo são os registrados no arquivo; não representam o horário de implementação.

| Pedido | Alteração realizada |
| --- | --- |
| 07:47 e 07:56 — escolher câmera e microfone | Acrescentei seleção de dispositivos, incluindo câmeras externas/virtuais, troca durante a chamada e recuperação da escolha anterior. A câmera selecionada permanece exata mesmo no retry. |
| 07:47–07:54 — filtro deformava rosto/olhos e travava | Mantive Porcelana automático com efeito suave; formato do rosto, olhos e nariz começam em zero. Alterações manuais recuam com rastreamento inseguro. Movi a inferência facial para Worker real. |
| 07:49 e 10:04 — falta de nitidez | Reduzi suavização/clareamento, preservei a textura e a resolução de entrada; acrescentei HD/Full HD e informação da resolução efetiva. Não impus limite de quadros. A resolução solicitada continua dependendo do hardware e da rede. |
| 07:58 — aluno desenhar no material | Implementei propostas do aluno validadas pela professora, permissão revogável e edição apenas das próprias anotações. Sincronizei snapshots para entrada tardia. |
| 07:58–08:05 — ver rostos e tradução ao operar PPT externo | Reuni câmeras e histórico bilíngue em Sala flutuante, com fonte e rolagem próprias. Em navegadores compatíveis, uso Document Picture-in-Picture; a alternativa comum informa que não fica sobre outros aplicativos. |
| 07:59 — fonte menor | Acrescentei 14 e 16 px e preservei o ajuste em telas estreitas. |
| 07:59 e 08:01 — início oficial da contagem | Separei o cronômetro da abertura da sala, com iniciar/pausar/retomar, 50/60 minutos ou duração personalizada e aviso final de cinco minutos. Salvei o estado no servidor. |
| 08:06–08:14 — chat único estável | Preservei a conversa única aprovada na aula; a janela flutuante também usa histórico contínuo. A leitura não depende de um tooltip que muda a cada fala. |
| 08:02 — tradução opcional sem cortar o áudio | Acrescentei controle da professora para desligar transcrição e tradução pagas em toda a sala. A chamada segue com microfone; novos acessos aos serviços ficam bloqueados no servidor e os clientes encerram suas sessões. |
| 08:02 — acompanhar o custo | Consultei o total confirmado da própria sala em USD nos registros de sessões finalizadas da Soniox. Não estimei consumo pelo tempo em que alguém falou. |
| 08:03 — professores em salas independentes | Verifiquei isolamento entre duas contas/salas, tokens cruzados rejeitados e estados independentes. Consultei os limites reais da organização Soniox. |
| 09:12 — interrupção prolongada de legendas | Corrigi retomada após falha na obtenção de chave/reconexão e nova tentativa após intervalo de recuperação. Mantive áudio da chamada e confirmação das últimas falas. Corrigi início concorrente de reconhecimento e microfone que chegava após a saída. |
| 07:58 — apoio para resumo e tarefas | Acrescentei rascunho editável e envio pela conversa criptografada. É manual, sem contratar outro modelo nem atribuir geração por IA. A professora pode escrever nos dois idiomas. |

## Verificações

- 69 testes focados passaram: dispositivos, captura, beleza, rastreamento, criptografia, colaboração, cronômetro, desligamento de serviços, reconexão, consumo e isolamento de salas.
- Executei uma aula de teste em duas sessões isoladas do Chrome com dispositivos sintéticos: troca de câmera, microfones com tradução desligada/reativada, cronômetro persistente, sala flutuante, desenhos do aluno, permissões, tarefas e quatro larguras de tela (1440/1024/768/390 px). Não houve erros JavaScript nesse fluxo.
- Validei o filtro com retrato sintético animado e WebRTC: oito amostras remotas diferentes, preservação de 640 × 480 e track de origem ativo após desligar o processamento. Essa amostra não comprova aparência ou desempenho em todos os computadores.
- Verifiquei Document Picture-in-Picture real e fallback, duas câmeras, histórico bilíngue e leitura independente sem interromper tracks.
- Confirmei a consulta autenticada de consumo e de limites da Soniox sem abrir uma nova sessão de áudio paga. Os ensaios de transcrição utilizaram respostas simuladas, preservando o saldo para o teste prático.
- Testei a coluna aditiva `lesson_settings` em uma branch Neon de validação e em produção, com 30 salas preservadas e nenhuma configuração nula. Não alterei transcrições.

## Custo e capacidade

Em 23/11/2026, a consulta autenticada da Soniox retornou limite organizacional de **10 conexões de transcrição simultâneas**. O limite específico do projeto veio nulo, portanto não atribuí um número próprio ao projeto. Duas pessoas com reconhecimento ativo usam duas conexões: cinco duplas já consumiriam as dez vagas em termos de quota. Isso não é uma medição de carga do site nem garantia de capacidade da rede, banco ou WebRTC.

O custo confirmado considera sessões concluídas e pode aparecer depois de encerrar a conexão de voz. Sessões ativas e registros que ainda não foram publicados pelo provedor não entram nesse total. O preço depende de tokens e duração da sessão; silêncio enquanto conectado pode ser cobrado. O painel não expõe a chave nem registros de cobrança de outras salas.

Fontes verificadas: [preços Soniox](https://soniox.com/pricing), [registros de consumo](https://docs.soniox.com/guides/usage-logs), [consulta de limites](https://docs.soniox.com/api-reference/other/get_concurrency_limits) e [limites do reconhecimento em tempo real](https://docs.soniox.com/stt/rt/limits-and-quotas).

## Limites de uso

- Um site não libera hardware ocupado por outro aplicativo. O seletor permite usar outro dispositivo disponível; permissões continuam sendo concedidas pelo navegador.
- Vídeo mais nítido depende da câmera, iluminação, desempenho e rede. Full HD é uma preferência, não uma promessa de resolução recebida.
- O PowerPoint externo continua controlado no próprio aplicativo. Abertura PPTX dentro do site é estática e não reproduz animações/áudio.
- A janela comum de fallback pode ficar atrás do PowerPoint. A sobreposição nativa depende do navegador e do sistema.
- Anotações são temporárias durante a sessão; o resumo/tarefa enviado é salvo na conversa criptografada. Mensagens digitadas preservam o original; não há novo gerador ou tradutor de tarefas por IA.
- Novos testes com câmera/dispositivos reais da professora e um ensaio de carga são necessários antes de prometer desempenho nesses equipamentos ou centenas de aulas simultâneas.
