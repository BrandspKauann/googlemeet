# Aula Global

Sala de aula com câmera, compartilhamento de tela, legendas traduzidas e exportação de transcrições. Repositório principal: [BrandspKauann/googlemeet](https://github.com/BrandspKauann/googlemeet).

## Instalação

Requer Node.js 22 ou superior. Execute `npm ci` e escolha um dos modos abaixo. `npm test` verifica as integrações e `npm run build` prepara o Whisper para o navegador. GitHub Actions executa ambos a cada atualização.

Para importar este repositório na Vercel, use a raiz `.` como Root Directory, preset **Other**, build `npm run build` e saída `dist`. Configure o banco antes de publicar, seguindo [VERCEL-NEON.md](VERCEL-NEON.md).

## Desenvolvimento local

Há duas versões de desenvolvimento:

- `npm start` → http://localhost:4178: versão anterior, com banco JSON e opções locais de Whisper/pontuação Python.
- `npm run dev:cloud` → http://localhost:4188: nova arquitetura com PostgreSQL local de teste, transcrições criptografadas e fila IndexedDB. Os cadastros são separados da versão anterior.

Para conectar à Vercel e ao Neon, siga [VERCEL-NEON.md](VERCEL-NEON.md). O código foi preparado; as contas, o banco Neon e a implantação externa ainda não foram criados. As transcrições antigas em claro não foram migradas automaticamente.

Execute `npm start` nesta pasta e abra http://localhost:4178 no Chrome.

1. Crie a conta local da professora (nome, e-mail e senha de pelo menos 8 caracteres).
2. Escolha seu nome na aula, seu idioma e o idioma do aluno. Crie a sala e copie o convite.
3. Para testar neste computador, abra o convite numa nova aba independente ou janela anônima; informe somente o nome do aluno. A sala aplica o idioma definido pela professora.
4. Aceite o pedido na tela da professora. Ative câmera e microfone em cada lado. Use fones para evitar retorno de áudio.
5. Clique em Preparar tradução em cada navegador. Se novos idiomas entrarem, prepare novamente.
6. Compartilhe uma janela, aba ou tela pelo botão Compartilhar tela.
7. Encerre a reunião. Todos os participantes aceitos podem baixar a transcrição, no idioma selecionado para leitura, com originais e traduções disponíveis.

## Modo apresentação

O botão **✧ Beleza**, exclusivo da professora, oferece efeitos gratuitos adaptados do GPUPixel. Veja [BELEZA-GPUPIXEL.md](BELEZA-GPUPIXEL.md) para origem, licença, uso e limitações. O efeito é opcional e vem desligado.

Ao iniciar ou receber compartilhamento de tela, o material ocupa a área principal. A legenda fica diretamente abaixo, com câmeras compactas ao lado (ou numa faixa no celular). Idiomas e transcrição ficam num painel recolhível. Use Ativar tradução para preparar os idiomas e os controles Letra, Original e Expandir para ajustar a leitura. Preferências de letra e original ficam no navegador; o idioma de leitura fica na sessão da sala.

O botão Legenda flutuante usa Document Picture-in-Picture quando disponível para acompanhar o texto ao apresentar em outro programa. Esse recurso precisa de validação no Chrome de desktop; o navegador embutido pode não abrir a janela. A janela acompanha a última legenda e fecha ao sair da sala. Se compartilhar a tela inteira, o sistema de captura pode incluir a janela flutuante; compartilhar só a janela da apresentação evita mostrar elementos de outras janelas.

## Whisper local (experimental)

### Pontuação automática

No painel Idiomas e transcrição, Pontuação automática vem ativada. Ela funciona com a fala reconhecida pelo navegador e pelo Whisper, antes da tradução, usando o modelo local Horizon-Labs/punctuation-restoration-small (ONNX int8). Estima vírgulas, pontos, perguntas, dois-pontos e outros separadores pelo contexto; não altera as palavras. A pontuação nativa de frases já concluídas é preservada. Texto digitado e avisos de interrupção não são ajustados.

O texto bruto fica salvo junto com a versão pontuada e pode ser consultado em Ver texto reconhecido sem ajuste. O download inclui as duas versões quando diferem. Se o modelo falhar, o texto bruto é preservado e a indisponibilidade é sinalizada no arquivo. Perguntas curtas ou ambíguas podem receber pontuação inadequada, porque o restaurador usa o texto, não a entonação original. Desmarque Pontuação automática para preservar diretamente a saída do reconhecedor.

O modelo é baixado em `data/models/punctuation` no primeiro uso. Sua licença é Apache-2.0: https://huggingface.co/Horizon-Labs/punctuation-restoration-small. Não há tarifa de API. Testes reais pela API da sala estão em `data/qa/bench/punctuation-results.json`.

O ambiente Python `.venv` e os modelos `tiny` e `base` foram instalados nesta máquina. `npm start` inicia o motor local automaticamente, em 127.0.0.1:4180, usando o modelo multilíngue `base`, CPU e int8. O modelo é baixado no primeiro uso e fica em `data/models`. O backend só aceita chamadas com credencial efêmera gerada pelo servidor; o proxy valida a participação e o idioma da pessoa.

Na reunião: abra Idiomas e transcrição, selecione **Whisper local — experimental** em Reconhecimento de voz e clique Verificar motor local. Com o status Pronto, ligue o microfone. A captura prefere pausas em blocos de 2 a 8 segundos, com o último bloco processado ao desligar. O atraso inclui esse tempo de espera e a inferência. A opção Navegador continua sendo o padrão. Escolha o motor antes de ligar o microfone; a troca fica bloqueada durante captura.

O áudio local é enviado ao computador que hospeda a sala e processado em memória, sem persistência de áudio. Os textos reconhecidos seguem o mesmo fluxo de tradução e transcrição. Silêncio é filtrado, trechos de baixa confiança podem ser descartados com indicação de interrupção, e sobrecarga/falhas são sinalizadas. Ao encerrar, o servidor espera confirmação de processamento final dos participantes com microfone ativo por até sete minutos; ausência de confirmação é registrada na transcrição.

Para reinstalar no Windows: `python -m venv .venv` e `.venv/Scripts/python.exe -m pip install -r requirements-asr.txt`. GPU não foi ativada; cuBLAS/cuDNN necessários não estavam configurados. Use `ASR_DISABLED=1` para iniciar só o motor do navegador. `ASR_MODEL` e `ASR_DEVICE` permitem testes avançados; CUDA requer instalação e validação próprias. Em desenvolvimento, altere também `ASR_PORT` quando usar outra instância do servidor.

Os resultados de benchmark com vozes sintéticas ficam em `data/qa/bench/results.json`, e a integração real em `data/qa/bench/integration.json`. Não representam avaliação de uma aula real nem comparação com o reconhecimento do navegador. O teste de mandarim produziu caracteres tradicionais; o CER bruto conta diferenças entre tradicional e simplificado e não deve ser interpretado como erro semântico.

Somente os trechos reconhecidos e os textos digitados são armazenados, em `data/store.json`. Interrupções do reconhecimento são identificadas. Não há gravação de áudio ou tela. O serviço de reconhecimento do navegador pode transmitir áudio para seu provedor. Tradução depende da API Translator disponível no navegador e dos pacotes de idioma. As traduções são geradas em cada navegador; os originais persistem no servidor e permitem gerar novamente a tradução.

Contas usam senha com scrypt e sessão HttpOnly. O aluno é convidado, sem conta permanente. As sessões da professora expiram em 24 horas e são invalidadas ao reiniciar o servidor. O token de participação fica no sessionStorage da aba. Não existe recuperação de senha nem histórico visual de salas nesta versão. Até 6 participantes, com conexões WebRTC em malha.

O servidor escuta somente 127.0.0.1. **Convites localhost não funcionam em outros computadores.** Para uso pela internet, falta hospedar este servidor sob HTTPS, configurar TURN para redes que impeçam conexão direta, e evoluir autenticação/armazenamento para produção. Não exponha este protótipo como serviço público sem essa preparação. O site estático anteriormente publicado não contém este servidor.

Testes: `npm test`. Testam autenticação, permissões, aprovação, sinalização privada, deduplicação, encerramento e recuperação de transcrição após reinício.

# Maquiagem no navegador

Veja [OpenMakeupSDK na câmera](BELEZA-OPENMAKEUP.md) para uso, origem, privacidade e limites da integração gratuita.

