# Tradução no computador que hospeda a aula

O reconhecimento e a tradução usam o servidor Docker do professor. Professora e
aluno não precisam instalar modelos de voz ou de tradução no navegador.
A câmera, o filtro de beleza e o compartilhamento de tela continuam no dispositivo.

## Fluxo e privacidade

1. O navegador recebe a fala reconhecida e solicita a tradução pela API da sala.
2. A Vercel verifica a participação aprovada e impõe o idioma de destino do participante.
3. O texto segue por HTTPS ao mesmo servidor autenticado usado pelo Whisper.
4. O resultado aparece no navegador. A rota de tradução não grava texto ou áudio.

O servidor recebe texto legível temporariamente para traduzi-lo. As transcrições
persistidas no banco continuam criptografadas pelo navegador. A chave privada
do serviço fica no servidor da Vercel e no Docker, sem ser entregue aos participantes.
O texto original é preservado em falhas, com uma ação para tentar novamente;
não há troca automática para modelos que exijam download no navegador.

## Instalação e operação

O procedimento de [WHISPER-ONLINE.md](WHISPER-ONLINE.md) inicia os dois motores.
`ASR_TRANSLATION=1` no Docker carrega os seis pares definidos em
`translation-models.json`. O primeiro uso baixa aproximadamente 654 MB de pacotes,
verifica SHA256 e tamanho e extrai cerca de 750 MB úteis no volume de modelos.
Não são instalados PyTorch, Stanza ou modelos de divisão de frases.
Os pacotes temporários são removidos após verificação e extração.

Na Vercel, `TRANSLATION_SERVER_ENABLED=1` ativa a opção remota; ASR_URL e
ASR_SECRET permanecem privados no servidor. O script de publicação só ativa
o recurso depois de verificar a prontidão da transcrição e da tradução pelo
endereço público. Atualize o site após publicar para carregar a configuração.

O computador precisa permanecer ligado, conectado e sem suspender. Docker e
túnel precisam estar em execução. O endereço Quick Tunnel é temporário e pode
mudar quando o túnel reinicia. Execute novamente os scripts de início e
publicação para atualizar a Vercel; o link dos alunos permanece igual.
Não há garantia de disponibilidade do endereço temporário.

Português, espanhol e mandarim usam modelos de/para inglês. Traduções entre
esses três idiomas passam por inglês. Cinco pares rodam em CPU int8. Espanhol
para inglês usa float32: int8 produziu repetições no teste real, um problema
também relatado pelo projeto Argos. Cada par passa por uma amostra de verificação
antes de o servidor indicar prontidão. A memória do container continua limitada
a 4 GB e a CPU a quatro núcleos lógicos.

## Fontes e créditos

Argos Open Technologies; OPUS-MT, Jörg Tiedemann e Santhosh Thottingal (2020),
“OPUS-MT — Building open translation services for the World”.
Os READMEs originais dos seis pacotes estão em `licenses/translation/` e são
preservados no cache de modelos. Não alteramos os pesos; o aplicativo usa
tokenização, divisão de frases e configuração de precisão próprias.

- [Índice oficial fixado](https://github.com/argosopentech/argospm-index/blob/ff90de60728f7c1338ff6b75974e4c89b2442d22/index.json).
- [Espelho oficial dos pacotes](https://data.argosopentech.com/argospm/v1/).
- Os pacotes zh↔en, pt↔en e es→en identificam os modelos OPUS originais como
  [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- O README antigo de en→es 1.0 não declara licença explícita. A inclusão usa a
  [declaração do mantenedor sobre liberação MIT/CC0](https://github.com/argosopentech/argos-translate/issues/76)
  dos modelos Argos. Esse pacote cita OpenSubtitles, ParaCrawl e UNPC/OPUS.
- [Tokenizadores Argos](https://github.com/argosopentech/argos-translate/blob/17ed1a9b055c5ba1b51d76b683bbb0c64e2a4a88/argostranslate/tokenizer.py).
- [Correção de precisão no projeto Argos](https://github.com/argosopentech/argos-translate/pull/511).

NLLB não foi instalado nem usado nesta integração.

## Validação de 17/10/2026

Ryzen 5 5500, Docker em CPU, seis modelos carregados. As 12 combinações entre
os quatro idiomas retornaram texto em amostras curtas, sem marcadores internos
de tokenização. Também foram verificadas perguntas, números e uma palavra entre
aspas. Não há benchmark com voz humana nem avaliação bilíngue de precisão.
Modelos podem errar, alterar palavras citadas e perder nuances; a transcrição
original continua disponível. Tradução por inglês pode ampliar esses erros.

O teste com dois contextos Chrome e a API real confirmou tradução automática
mandarim↔português, zero downloads de modelos de tradução no navegador,
nenhum acesso a window.Translator, persistência criptografada e recuperação
de uma falha controlada. O filtro de beleza não estava ativo nesse teste.

Uma solicitação longa, outra curta e um trecho Whisper rodaram simultaneamente
pelo túnel: tradução longa em cerca de 7,1 s e Whisper em 4,2 s de processamento.
Isso verifica o limite de resposta de 20 s nesses casos, sem garantir o mesmo
tempo em outras cargas. O container ficou em aproximadamente 1,1 GB de RAM
após os testes. Não foram alterados drivers ou contratadas APIs pagas.

Verificações reproduzíveis: `npm test` e
`python -m unittest translation_engine_test`.
