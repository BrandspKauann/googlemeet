# Tradução progressiva — 1 de novembro de 2026

Implementação funcional inspirada na experiência de legendas do Transync AI. Não utiliza seus modelos proprietários nem promete o mesmo desempenho. O sistema continua gratuito em chamadas de API: Whisper large-v3 CUDA para reconhecimento e Tencent Hy-MT2-1.8B Q8_0 para português ↔ chinês, executados no Docker do professor.

## Comportamento

- Ligar o microfone inicia o reconhecimento configurado no servidor, sem outro botão.
- O primeiro reconhecimento parcial pode começar com 1,6 segundo de fala. Novas janelas são solicitadas em intervalos de pelo menos 2,5 segundos, ou após uma breve pausa com novas palavras. Estes números são limiares de captura, não garantias de tempo de resposta.
- Cada participante tem seu balão. Texto provisório aparece durante a fala, recebe tradução assim que o modelo responde e pode ser corrigido. Borda tracejada e mensagem “Prévia simultânea · pode mudar” distinguem a prévia.
- A confirmação ocorre em uma pausa de aproximadamente 0,9 segundo, detectada pela energia do microfone. Não existe espera obrigatória de três segundos. Ruído contínuo pode atrasar a detecção de uma pausa.
- Desligar o microfone conclui a última fala e aguarda o processamento pendente. O histórico e o download recebem apenas as falas confirmadas.

## Fluxo e limites

AudioWorklet → PCM mono 16 kHz → janela deslizante de até oito segundos → endpoint autenticado de Whisper → prévia original → tradução no servidor → prévia traduzida. O processamento é incremental por janelas HTTP, não inferência token a token ou um modelo de streaming nativo. A fala final completa continua sendo reconhecida em blocos de até dez segundos; quando a prévia cobre integralmente o trecho final, seu resultado é reaproveitado.

Um reconhecimento por participante é enviado de cada vez. Prévia tem no máximo um pedido pendente; falas finais mantêm a fila limitada e os avisos de sobrecarga existentes. Traduções locais são serializadas, duplicatas compartilham a mesma Promise, e a prévia pendente mais recente substitui as intermediárias. A confirmação tem prioridade sobre novas traduções provisórias, sem cancelar inferências já iniciadas.

Prévias e traduções são compartilhadas pelo DataChannel WebRTC `aula-live-v1`, criptografadas com AES-GCM da sala além da proteção do WebRTC. Idioma, participante e tamanho são validados. O resultado da tradução final é reaproveitado no outro navegador quando chega a tempo, reduzindo pedidos duplicados. Se o canal não estiver disponível, o histórico e a tradução final seguem o fluxo HTTP existente. Sem canal, a prévia do interlocutor não fica disponível.

Prévias não são enviadas à API de histórico nem ao IndexedDB. Somente a confirmação recebe o identificador de turno dentro do conteúdo criptografado já persistido. Áudio permanece temporário em memória. A API pública de transcrições permanece compatível; nenhum esquema de banco foi alterado. Câmera, filtros e compartilhamento de tela mantêm seu processamento anterior.

A tradução Hy continua na CPU. Ela pode levar vários segundos, especialmente com falas simultâneas; retirar a espera de captura não elimina o tempo de inferência. Traduções de uma janela anterior podem ser mostradas enquanto o original mais recente já está visível, sempre identificadas como provisórias. Janelas de oito segundos podem perder contexto anterior; a confirmação usa a fala completa. Não houve nesta atualização comparação de precisão com voz humana nem comprovação de latência equivalente à do Transync.

## Validação

- 75 testes Node: reamostragem, limites de pausa, janelas e fila de reconhecimento, reutilização da prévia, parada/aborto, cache e ordenação de traduções, resultados atrasados, validação de pacotes, preservação das duas vozes, criptografia, histórico e regressões existentes.
- Sete testes Python do tradutor, incluindo recuperação quando a preparação chinesa demora mais de 120 tentativas. O serviço agora aguarda o modelo com intervalo limitado a cinco segundos entre tentativas, em vez de permanecer indisponível após uma inicialização lenta.
- Chrome em duas sessões isoladas, banco PostgreSQL de teste: prévias nos dois sentidos, seis mensagens criptografadas, balões simultâneos, confirmação de uma fala sem apagar a outra e apenas uma fala no histórico. ASR/tradução foram controlados nesse teste de interface; isso não mede a qualidade ou o atraso dos modelos reais. Nenhuma câmera ou microfone pessoal foi utilizado.

Os limiares de 1,6/2,5/0,9 segundo foram testados com áudio sintético e relógios controlados. O atraso real depende de reconhecimento, tradução, carga do computador e conexão. A preparação inicial após ligar o Docker também pode demorar, e o endereço do túnel temporário precisa estar atualizado na Vercel.

Na preparação deste computador, o Whisper permaneceu preparando enquanto o tradutor ocupava memória. Após parar temporariamente o tradutor, o Whisper ficou pronto. O Compose agora inicia o tradutor após a saúde do Whisper, reduzindo a concorrência de memória na inicialização; os dois continuam rodando juntos durante a aula.

## Referências públicas

O [guia de reprodução de voz do Transync](https://www.transyncai.com/docs/how-to-use-voice-playback-in-transync-ai/) descreve atraso configurável para reprodução. Isso não determina uma espera obrigatória antes do reconhecimento. O [guia de tradução em tempo real](https://www.transyncai.com/docs/how-to-start-real-time-translation/) descreve seus motores comerciais; seus pesos não foram disponibilizados para esta integração.
