# Reconhecimento separado por idioma

`dist/language-routing.js` separa duas decisões: reconhecimento por idioma de quem fala e tradução por par de idiomas. O idioma real vem da sala, configurado pela professora; escolher um motor não muda o idioma atribuído ao aluno.

Padrões:

| Idioma | Reconhecimento | Preparação |
| --- | --- | --- |
| Mandarim | Paraformer bilíngue, WebAssembly | Modelo de aproximadamente 249 MB no primeiro uso |
| Português | Whisper large-v3-turbo já integrado, Transformers.js/WebGPU | Preparar e validar antes do microfone; exige WebGPU e recursos do dispositivo |
| Inglês | Reconhecimento do navegador em `en-US` | Depende da disponibilidade e do serviço do navegador |
| Espanhol | Reconhecimento do navegador em `es-ES` | Depende da disponibilidade e do serviço do navegador |

O navegador não informa um checkpoint próprio para inglês ou espanhol; esta entrega não adiciona um novo modelo inglês de pesos abertos. A arquitetura permite selecionar outro motor compatível para cada idioma. Whisper continua multilíngue: se escolhido para mais de um idioma, os pesos podem ser compartilhados, mas as preferências e a configuração da fala permanecem independentes.

Ao entrar na sala, `localASR.configureLanguage` aplica o perfil do idioma desse participante antes de ligar o microfone. O painel mostra o idioma e o motor escolhidos. Em **Conversa → Opções de reconhecimento**, mudar o motor salva a preferência apenas para esse idioma, no navegador atual. Essas preferências não são uma configuração global sincronizada entre os computadores de professora e aluno. Sem preferência salva, todos recebem os padrões acima.

Downloads e processamento pesado só começam ao preparar/ligar o reconhecimento, não na escolha do perfil. O Whisper em português precisa de preparação e WebGPU; se indisponível, o usuário pode escolher explicitamente o reconhecimento do navegador para português. Não há fallback silencioso durante uma fala. O seletor é bloqueado enquanto o microfone está ativo, e a última fala continua sendo concluída antes de desligar.

Paraformer só pode ser selecionado para mandarim e inglês. O serviço Whisper local continua disponível apenas no localhost; não é o destino padrão de nenhum idioma no site publicado.

Tradução: usa o mecanismo do navegador com cache por par `origem:destino`, independente de qual ASR gerou o texto. Idiomas iguais usam identidade; quando a tradução direta não carrega, o fluxo existente pode tentar a ponte por inglês. Trocar Paraformer/Whisper/navegador não altera a tradução nem a proteção das transcrições.

Validação: testes unitários de padrões, localidade, preferências isoladas e persistentes, restrições de modelos e independência da tradução; teste com duas sessões (mandarim/português), alteração de motor e recarregamento. Não houve nova comparação de precisão dos modelos nesta mudança de arquitetura.
