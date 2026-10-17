# Whisper no seu computador, acessível pela aula online

O site continua na Vercel. Áudio mono WAV de 2 a 10 segundos segue para a API da
sala na Vercel, que verifica o participante e encaminha ao container Whisper
por HTTPS. Só o texto reconhecido volta ao navegador, onde continua no fluxo
de tradução, criptografia e IndexedDB. O áudio não é gravado pelo aplicativo.
O reconhecimento exige que computador, Docker e túnel permaneçam ligados.

O modelo baixa somente no computador que hospeda o Docker. Os participantes
não baixam modelos. A integração usa o idioma atribuído pela professora,
inclusive mandarim (`zh`), e não usa o serviço SpeechRecognition do Chrome.

## Iniciar

1. Abra o Docker Desktop e aguarde o motor Linux ficar pronto.
2. Na pasta do projeto, execute:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/start-whisper-online.ps1
   ```

3. Aguarde o primeiro download e o carregamento do modelo. O script mostra
   o endereço HTTPS e guarda a configuração em arquivos locais ignorados pelo Git.
4. Para conectar e publicar a configuração na Vercel:

   ```powershell
   node scripts/publish-whisper-server.mjs
   ```

Não compartilhe `.env.whisper.local`: contém a chave privada entre a API e
seu computador. Ela não é incluída no site, no Git ou na imagem Docker.

O padrão inicial continua **base**, CPU `int8`, quatro threads, sem alteração
de drivers. É necessário medir precisão e atraso com voz real em mandarim
antes de mudar para `small` ou `turbo`. Para experimentar:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-whisper-online.ps1 -Model small
```

A imagem limita memória a 4 GB e CPU a quatro núcleos lógicos. O serviço aceita
no máximo duas solicitações em processamento/fila. A Vercel valida WAV PCM,
duração, tamanho e limite por participante. O texto não é armazenado pela rota
de reconhecimento; a transcrição definitiva permanece criptografada na rota
existente. O container só publica a porta no loopback do computador, e o túnel
encaminha as chamadas autenticadas.

## Endereço temporário e permanente

Sem domínio, o perfil `quick` usa um Cloudflare Quick Tunnel, próprio para teste,
sem garantia de disponibilidade. O endereço pode mudar ao recriar o túnel;
nesse caso, execute novamente o script de publicação para atualizar a Vercel.
Não é necessário alterar o link usado pelos alunos.

Um endereço fixo exige configurar um túnel nomeado/domínio e guardar o token
no arquivo local. O perfil `stable` está preparado para `TUNNEL_TOKEN`:

```powershell
docker compose --env-file .env.whisper.local -f docker/compose.whisper.yml --profile stable up -d --build
```

Não execute os perfis `quick` e `stable` ao mesmo tempo sem necessidade.

Para parar os serviços sem apagar modelos:

```powershell
docker compose --env-file .env.whisper.local -f docker/compose.whisper.yml --profile quick down
```

Não use `down -v` se quiser preservar o cache de modelos.

## Docker Desktop neste computador

Na preparação de 17/10/2026, a pasta de sockets temporários
`%LOCALAPPDATA%\Docker\run` foi preservada como `run.stale-20261017` após erro
WinError 1920 nos sockets internos. O Docker pôde criar uma pasta nova.
Não foram removidos imagens, volumes ou discos WSL.

## Validação de 17/10/2026

Docker Desktop 28.3.2, Ryzen 5 5500, CPU int8, quatro threads, modelo base.
O container ficou saudável e o túnel HTTPS foi validado; chamadas sem chave
retornaram 401. Medições únicas, sem concorrência, com áudio sintético Windows TTS:

| Idioma / amostra | Duração | Processamento | Ida e volta pelo túnel |
|---|---:|---:|---:|
| Mandarim | 8,02 s | 1,687 s | 1,867 s |
| Português | 11,42 s | 1,667 s | 1,842 s |
| Inglês | 6,05 s | 1,010 s | 1,109 s |
| Silêncio | 3 s | 0,046 s | 0,127 s |

As três falas retornaram texto e o silêncio retornou vazio. O mandarim saiu em
caracteres tradicionais; isso afeta comparação literal com referência simplificada.
Esses valores não incluem espera pelo fechamento do trecho e tradução.
Não são benchmark de voz humana nem garantia de atraso em uma aula simultânea.

Também passou o fluxo com dois participantes em Chrome de teste, microfone
sintético em mandarim, captura AudioWorklet, API autenticada da sala, túnel e
Whisper real. O navegador recebeu a transcrição sem preparar modelo local,
e desligar o microfone concluiu os trechos pendentes. Os 40 testes automatizados
passaram, incluindo aprovação, idioma atribuído pela professora e armazenamento
criptografado das transcrições. A chave privada não é entregue ao navegador.
