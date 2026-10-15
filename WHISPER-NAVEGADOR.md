# Whisper no navegador — experimental

## Usar na aula

1. Abra o Aula Global na porta 4178 ou 4188. Atualize a página se ela já estava aberta.
2. Na área de idiomas/transcrição, escolha **Whisper no dispositivo — precisão (experimental)**.
3. Clique em **Preparar reconhecimento**. O primeiro uso baixa um modelo grande; a rede precisa alcançar o Hugging Face. A preparação não liga o microfone. Os dois arquivos de pesos somam aproximadamente 1,6 GB. Há progresso em megabytes, recuperação de partes que falham e botão para cancelar.
4. Aguarde o download, carregamento e a verificação de um áudio sintético conhecido. Se a verificação falhar, escolha **Reconhecimento do navegador**.
5. Ligue o microfone. A transcrição ocorre nas pausas, em trechos de dois a dez segundos. A demora depende do dispositivo.

Para trocar de motor, desligue o microfone, espere os últimos trechos serem concluídos, escolha outra opção e ligue novamente. Falha do reconhecimento não encerra a chamada. Trechos omitidos por sobrecarga são sinalizados. No encerramento, o buffer final espera a fila liberar espaço. A versão em nuvem mantém o participante ativo durante a conclusão e admite até sete minutos para essa etapa; encerra assim que os participantes confirmam ou ficam desconectados. Não há troca silenciosa.

O perfil exige WebGPU. Não há fallback automático do modelo grande para CPU/WASM. Não foi feita comparação com voz real suficiente para recomendar a substituição definitiva do reconhecedor atual.

## Modelo e processamento

- Transformers.js **4.3.1**, empacotado com esbuild **0.28.2**.
- Modelo **onnx-community/whisper-large-v3-turbo**, revisão **360ebcde2559d60bb474678be3c1de9ef347d01a**.
- Encoder `fp16`, decoder `q4`, WebGPU, execução em Worker. A verificação sintética bloqueia o uso quando o WER da amostra supera 35%; isso detecta algumas falhas de execução, não comprova qualidade geral.
- Áudio mono a 16 kHz em memória, transferido para o Worker. A API da plataforma recebe apenas texto, cifrado na versão em nuvem. Os downloads externos contêm somente pedidos dos arquivos do modelo; não contêm a fala.
- Cache do modelo quando o navegador permitir. O navegador pode remover esse cache ou não ter espaço disponível; a aplicação informa falhas de preparação.
- Idioma explícito: português, mandarim, inglês ou espanhol. Transcrição no idioma original; tradução continua independente.
- Falas consecutivas do mesmo participante/idioma são agrupadas até pontuação final, dois segundos sem novo resultado ou dez segundos de espera. As aspas são aplicadas depois; `rawText` preserva o reconhecimento agrupado.
- O teste de WebGPU não comprova que um dispositivo consegue sustentar aulas longas com vídeo e compartilhamento. O desempenho precisa ser medido no dispositivo de uso.

## Comparar com sua voz

No localhost, abra **/asr-compare.html**, prepare o modelo e selecione um WAV de até 20 MB e dois minutos. O arquivo fica apenas em memória. Escreva o texto de referência para obter WER (português/inglês/espanhol) ou CER (mandarim). O download JSON só ocorre ao clicar no botão.

As métricas removem pontuação e ignoram maiúsculas. Ainda contam mudanças de números por extenso para dígitos e diferenças de escrita tradicional/simplificada. Examine também o texto para distinguir essas diferenças de erros de reconhecimento. A página de comparação é excluída da implantação Vercel.

## Benchmark local

Execute `.venv/Scripts/python.exe benchmark_asr.py`. O padrão compara `base`, `small` e `turbo` em CPU int8, com um aquecimento por caso e três execuções medidas, sem mudar drivers. A saída é salva progressivamente em `data/qa/bench/comparison.json`.

As amostras versionadas em `benchmarks/` são sintéticas (vozes Windows Maria, Huihui e Zira), incluindo perguntas, números, termos de aula e silêncio. Não há amostra espanhola nem de voz humana neste conjunto. Para sua voz, use `--references caminho/references.json`, com WAVs na mesma pasta e registros `{ "File": "fala.wav", "Language": "pt", "Text": "referência", "TestType": "human voice" }`. Fornecer esse manifesto é uma decisão explícita de usar os arquivos já existentes; o script não grava o microfone.

É possível reutilizar pesos locais completos em `data/models/benchmark-small` e `data/models/benchmark-turbo`. Caso contrário, o faster-whisper baixa o modelo oficial. O serviço das aulas continua usando `base` por padrão; executar o benchmark não troca o modelo do serviço.

## Build e publicação

`npm ci` e `npm run build` geram o Worker, o runtime WASM e a amostra de validação na pasta `dist`. `npm start` e `npm run dev:cloud` executam o build antes de iniciar. A Vercel passa a executar `npm run build`; pesos do modelo são baixados pelo navegador, não incluídos na Function.

Python e modelos locais continuam fora da Vercel. O runtime de reconhecimento no dispositivo é estático. Para os dados, siga o guia `VERCEL-NEON.md`.

## Validação nesta entrega

19 testes automatizados passaram: reamostragem, WER/CER, agrupamento, preparação obrigatória, falha de validação, erro do Worker, ausência de WebGPU, áudio transferido sem upload, silêncio, ordem da fila, sobrecarga, conclusão no desligamento, descarte após abortar e preservação de texto bruto cifrado; além dos testes existentes de salas, sincronização e pontuação.

O build e os tipos MIME do Worker, runtime e WAV foram conferidos nas duas portas. A primeira abertura direta pelo navegador de testes retornou `net::ERR_BLOCKED_BY_CLIENT`. A navegação pelo link da página inicial funcionou depois, e o botão de preparação exibiu progresso real dos arquivos ONNX. O primeiro download integral falhou com erro de rede. Foi implementada recuperação em partes de 4 MB, até três requisições simultâneas por arquivo e três tentativas por parte, preservando a ordem dos bytes. A nova tentativa mostrou progresso real em megabytes. A conclusão do download e a transcrição efetiva em WebGPU ainda não foram confirmadas. Cache após download completo, microfone físico, vídeo e compartilhamento simultâneos continuam pendentes. A aplicação executa a verificação de áudio conhecido durante a preparação no dispositivo do usuário, sem declarar esse teste como já realizado aqui.

Referências: https://github.com/huggingface/transformers.js ; https://huggingface.co/onnx-community/whisper-large-v3-turbo ; https://github.com/SYSTRAN/faster-whisper

## Resultados da comparação em CPU

Veja benchmarks/RESULTADOS.md. Base, small e turbo foram executados nos sete casos, com três medições por caso após aquecimento. O cache manual do turbo inclui preprocessor_config.json (128 bandas mel); sem esse arquivo, a leitura local incorreta de 80 bandas é recusada ou corrigida pelo download padrão do faster-whisper. Nas perguntas e termos sintéticos em português, os três preservaram as palavras. Para a pergunta de 7,4 segundos, os tempos medianos foram aproximadamente 0,8s (base), 2,2s (small) e 9,4s (turbo). O turbo foi mais lento que a duração de alguns áudios, sem demonstrar ganho semântico nesse conjunto. Sua escrita chinesa coincidiu com a referência simplificada; base/small usaram tradicional, inflando o CER bruto sem necessariamente errar palavras. O padrão local permanece base.
