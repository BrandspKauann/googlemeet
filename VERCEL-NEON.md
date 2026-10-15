# Conectar Aula Global à Vercel e ao Neon

O código da versão em nuvem está preparado e foi testado com PostgreSQL local (PGlite). **Não existe implantação pública nem banco Neon criado nesta etapa.** Não foi validada uma aula de oito horas ou um teste de carga.

## Antes de publicar

1. Crie sua conta na Vercel e no Neon nos sites oficiais. Você deve concluir o cadastro e os termos.
2. No Neon, crie um projeto PostgreSQL e copie a connection string com TLS, de preferência a conexão pooled. Não publique nem envie essa string pelo chat.
3. Na pasta deste projeto, copie `.env.example` para `.env.local` e preencha `DATABASE_URL` localmente. O arquivo é ignorado pelo Git.
4. Execute `npm ci` e `npm run db:migrate`. Isso cria tabelas e índices; não copia as transcrições antigas em claro.
5. Conecte esta pasta à Vercel pelo fluxo oficial da CLI (`npx vercel`) ou importando `BrandspKauann/googlemeet`. Na importação deste repositório, use a raiz `.` como Root Directory; o repositório já contém somente o projeto.
6. No projeto Vercel, adicione `DATABASE_URL` em Environment Variables e configure o projeto como Other. `vercel.json` define o build `npm run build`, a saída estática `dist` e a API Node em `api/index.mjs`.
7. Faça a implantação e valide a URL HTTPS. Cadastre uma professora de teste, entre com um aluno de teste, aceite a entrada e confira câmera, microfone, legendas, encerramento e download.

Não é necessário instalar Python, Whisper ou um modelo de IA na Vercel. A pontuação ONNX/Whisper atual continua apenas na versão localhost. Em nuvem, a pontuação nativa do reconhecedor é preservada. Há também Whisper experimental no dispositivo via WebGPU; veja `WHISPER-NAVEGADOR.md`.

## Testar a arquitetura sem contas externas

Execute `npm run dev:cloud` e abra http://localhost:4188. Essa instância usa tabelas PostgreSQL reais no PGlite, armazenadas em `data/cloud-pg`, e o mesmo handler da Function. Cadastro e reuniões são separados da versão antiga em http://localhost:4178.

Essa URL continua sendo apenas local. O teste local não cria um banco Neon e não equivale à publicação na Vercel. PGlite é uma dependência de desenvolvimento, não o banco da implantação.

## Privacidade e recuperação

- Cada sala recebe uma chave AES-256-GCM gerada no navegador. A chave vai no fragmento do convite (`#k=...`), que não é enviado nas requisições HTTP.
- O texto é cifrado no navegador antes do envio. O banco salva somente o payload cifrado, nome/idioma do participante, identificação da sala e horários.
- O arquivo de acesso de cada participante contém chave e credencial, protegido por AES-GCM e uma senha derivada com PBKDF2. Use **Guardar acesso privado da aula**. Guarde a senha separadamente. Para outro dispositivo, use **Recuperar acesso a uma aula**.
- Se perder todos os acessos/chaves/arquivos, o servidor não pode recuperar o texto. Os nomes, e-mails de contas e demais metadados não são ocultos do operador.
- Essa arquitetura protege o conteúdo armazenado contra leitura casual pelo administrador do banco. Não protege contra um operador que altere o JavaScript servido para roubar as chaves, nem contra invasão do dispositivo do participante. Não é uma garantia de anonimato ou privacidade absoluta.
- Web Speech API pode enviar áudio ao provedor do navegador. A plataforma não recebe esse áudio. Tradução depende da API Translator e dos pacotes disponíveis no navegador.

## Sincronização e chamadas

Falas reconhecidas entram na fila IndexedDB; só saem depois da confirmação do servidor. O mesmo identificador evita duplicação nos reenvios. A fila protege os trechos já gravados no IndexedDB, não o áudio que nunca foi reconhecido nem uma aba encerrada antes de terminar a gravação local.

O estado da sala não inclui o histórico completo. A primeira abertura carrega as 100 falas mais recentes; **Carregar falas anteriores** recupera páginas anteriores. A sincronização recebe apenas novos registros. O download busca o histórico em páginas e traduz os trechos no dispositivo. O tempo de tradução/exportação aumenta com o tamanho da aula; isso precisa de teste de longa duração.

Sinalização usa consultas incrementais, não WebSockets beta. Estado, sessões e sinais ficam no PostgreSQL, sem depender de uma instância de Function. A reunião não tem prazo artificial de encerramento. Functions, navegador, rede e planos dos fornecedores continuam sujeitos aos seus próprios limites.

As chamadas WebRTC usam conexão direta e STUN. Para redes restritivas, configure TURN_URL, TURN_USERNAME e TURN_CREDENTIAL como secrets na Vercel. Credenciais TURN permanentes compartilhadas são aceitáveis só para teste restrito; antes de lançamento amplo, use credenciais temporárias e limites contra abuso. Não foi criado um serviço TURN nesta etapa.

## Limitações antes de lançamento amplo

- Confirmar build/rewrite e TLS na conta Vercel real, executar a migração no Neon e verificar permissões do usuário de banco.
- Testar chamadas entre duas redes diferentes, reconexão de navegador, oito horas de aula e vários professores simultâneos. Os testes atuais validam isolamento e persistência, não capacidade.
- Planos gratuitos Vercel/Neon têm limites; TURN pode ter custo. Não há tarifa da plataforma por minuto de transcrição via navegador, mas não há garantia de operação ilimitada gratuita.
- Recuperação de senha de conta por e-mail, verificação de e-mail, manutenção/retenção de sessões e sinais e testes de segurança ainda precisam ser concluídos para lançamento público amplo.
- Chamadas em malha são adequadas ao início com aulas pequenas; turmas grandes precisam de arquitetura de mídia própria.

Referências oficiais: https://vercel.com/docs/functions/runtimes/node-js ; https://vercel.com/docs/project-configuration/vercel-json ; https://github.com/neondatabase/serverless ; https://pglite.dev/docs/

