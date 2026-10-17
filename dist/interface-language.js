(() => {
  const dictionary={
    'Novo: reconhecimento de mandarim e inglês no navegador.':'新增：浏览器端中文和英语语音识别。','Usar reconhecimento de mandarim':'使用中文语音识别','Reconhecimento parado. Últimos trechos processados.':'识别已停止，最后片段已处理。','Carregando reconhecimento de mandarim neste dispositivo…':'正在此设备加载中文语音识别…','Baixando Paraformer para mandarim e inglês (aproximadamente 249 MB no primeiro uso)…':'正在下载中文和英语 Paraformer 模型（首次约 249 MB）…',
    'Mandarim e inglês — Paraformer (experimental)':'中文和英语 — Paraformer（实验性）','Paraformer pronto. Mandarim e inglês reconhecidos neste dispositivo.':'Paraformer 已就绪，可在此设备识别中文和英语。','Prepare o modelo de mandarim e inglês. Primeiro download: aproximadamente 249 MB; áudio processado neste dispositivo.':'请准备中文和英语模型。首次下载约 249 MB，音频在此设备处理。','O modelo é baixado para este navegador. O áudio não é enviado a uma API de transcrição.':'模型下载到此浏览器，音频不会发送到转写 API。','Reconhecendo mandarim com Paraformer…':'正在用 Paraformer 识别中文…','Paraformer ouvindo. Transcreve nas pausas; trechos de 2 a 10 segundos.':'Paraformer 正在聆听，停顿时转写，每段 2 至 10 秒。',
    'Ouvir som compartilhado':'播放共享音频','Som da tela sendo compartilhado.':'正在共享屏幕声音。','Compartilhamento sem som. Pare e compartilhe novamente marcando Compartilhar áudio.':'当前共享没有声音。请停止并重新共享，勾选共享音频。','O som compartilhado foi interrompido. Pare e compartilhe novamente com áudio.':'共享音频已中断，请停止并重新共享音频。','Marque Compartilhar áudio na janela do navegador. Para PowerPoint, escolha a tela inteira com áudio do sistema.':'请在浏览器窗口勾选共享音频。共享 PowerPoint 时，请选择整个屏幕并开启系统音频。',
    'Microfone ligado, sem transcrição. Clique em Preparar reconhecimento para ativar as legendas.':'麦克风已开启，暂未转写。请点击“准备语音识别”以启用字幕。','Baixar recursos do filtro':'下载美颜资源','Tentar ativar novamente':'重新启用美颜','Ajustes avançados de voz':'高级语音设置','Tentar tradução novamente':'重试翻译','Ligue o microfone para começar. As legendas e a tradução são ativadas automaticamente.':'开启麦克风即可开始，字幕和翻译将自动启用。','Recursos baixados. Ligue a câmera ou clique em Tentar ativar novamente.':'资源已下载。请开启摄像头，或点击重新启用美颜。','Voltar para a home':'返回首页','Filtro de beleza':'美颜滤镜','Filtro de beleza ativo, inclusive em outra aba.':'美颜已启用，切换标签页后仍会持续生效。','Filtro pronto. Aproxime o rosto da câmera para aplicar os ajustes.':'美颜已就绪，请靠近摄像头以应用效果。','O processamento acontece neste dispositivo. O aluno recebe a câmera com o efeito. O filtro continua funcionando ao trocar de aba ou minimizar o navegador.':'所有处理均在此设备完成。学生会看到美颜画面，切换标签页或最小化浏览器后效果仍会持续生效。','Restaurar Porcelana':'恢复瓷肌设置','Porcelana ativado. Ligue a câmera para aplicar o filtro.':'瓷肌已启用，开启摄像头即可应用。','Efeito ativo. Filtro de beleza aplicado à câmera enviada ao aluno.':'美颜已启用，学生会看到处理后的画面。',
    'Aula Global — sua sala sem fronteiras':'Aula Global — 无国界课堂',
    'Um novo jeito de se entender.':'让沟通更轻松。','LOCALHOST':'本地环境','SALA PRIVADA':'私人课堂',
    'FEITO PARA ENSINAR. EM QUALQUER IDIOMA.':'为教学而生，不受语言限制。','Mais conversa.':'更多交流。','Menos fronteiras.':'更少隔阂。',
    'Uma sala para olhar, ouvir e aprender.':'一起观看、聆听和学习。','Sua aula ganha legendas no idioma do aluno.':'用学生的语言，为课堂提供字幕。',
    'Sua próxima aula':'您的下一堂课','Conhecimento conecta pessoas.':'知识连接你我。','Professora':'老师','Vamos aprender juntos?':'一起学习吧？',
    '✓ Tela compartilhada':'✓ 屏幕共享','✓ Legendas nos dois sentidos':'✓ 双向翻译字幕','✓ Transcrição ao final':'✓ 课后文字记录',
    'SEU ESPAÇO PARA ENSINAR':'您的教学空间','Vamos começar?':'开始上课吧？','Entre com sua conta para abrir uma aula.':'登录账号，创建课堂。',
    'Seu nome':'您的姓名','· para criar conta':'· 注册时填写','Como você se chama?':'请输入您的姓名','E-mail':'邮箱','Senha':'密码','Sua senha':'请输入密码',
    'Mostrar senha':'显示密码','Ocultar senha':'隐藏密码','Entrar →':'登录 →','Criar conta':'注册账号','Seu nome nesta aula':'本堂课显示的姓名',
    'Título da aula':'课程名称','Idiomas da aula':'课堂语言','Você configura. O aluno só precisa entrar.':'由您设置，学生只需加入。',
    'Idioma da professora':'老师使用的语言','Traduzir para / idioma do aluno':'翻译为／学生使用的语言','Português':'葡萄牙语','English':'英语','Español':'西班牙语','中文 — Mandarim':'中文（普通话）',
    'As respostas do aluno voltam traduzidas para o seu idioma.':'学生的回答会翻译成您的语言。','Criar sala →':'创建课堂 →',
    'VOCÊ RECEBEU UM CONVITE':'您收到了一份邀请','Entrar na aula':'加入课堂','Informe seu nome. Sua professora cuidou do resto.':'填写姓名即可，老师已完成其他设置。',
    'Como podemos chamar você?':'请输入您的称呼','Pedir para entrar →':'申请加入 →','SUA SALA DE AULA':'您的课堂','Conectando…':'正在连接…',
    'Link para o aluno':'学生邀请链接','Copiar convite':'复制邀请','Convidar aluno':'邀请学生','Você':'您','Câmera desligada':'摄像头已关闭',
    'Seu próximo encontro':'下一堂课','começa aqui.':'从这里开始。','Convide seu aluno para a aula.':'邀请学生加入课堂。','Tela compartilhada':'共享屏幕',
    'Expandir tela':'展开屏幕','Mostrar câmeras':'显示摄像头','Tela cheia':'全屏','Sair da tela cheia':'退出全屏','Parar compartilhamento':'停止共享',
    'Expandir material e recolher câmeras':'展开教学内容并收起摄像头','Ver material e legendas em tela cheia':'全屏显示内容和字幕','Legendas da conversa':'对话字幕',
    'Ligar microfone':'开启麦克风','Desligar microfone':'关闭麦克风','Ligar câmera':'开启摄像头','Desligar câmera':'关闭摄像头','Compartilhar tela':'共享屏幕','Parar tela':'停止共享',
    'Transcrição':'文字记录','Encerrar reunião':'结束课堂','Sair da reunião':'离开课堂','Conversa da aula':'课堂对话','Tradução da conversa':'对话翻译',
    'As falas aparecem separadas. A tradução acompanha o idioma definido pela professora.':'双方发言分别显示，按老师设置的语言翻译。',
    'Ativar tradução neste dispositivo':'在此设备启用翻译','Ativar tradução':'启用翻译','Ative uma vez para preparar os idiomas no seu navegador.':'首次启用时，浏览器会准备所需语言。',
    'Prefere escrever?':'想用文字交流？','Escreva sua mensagem…':'输入消息…','Enviar para a sala':'发送到课堂',
    'A voz usa o reconhecimento do navegador. Tela e áudio não são gravados.':'语音由浏览器识别，不录制屏幕或音频。',
    'AO VIVO':'实时','FINALIZADA':'已结束','Transcrição automática: pode conter erros ou omissões.':'自动文字记录可能存在错误或遗漏。',
    'Reunião encerrada':'课堂已结束','Você saiu da reunião':'您已离开课堂','A transcrição contém as falas reconhecidas de todos os participantes, com original e tradução quando disponível.':'记录包含所有参与者识别出的发言，以及可用的原文和译文。',
    'Baixar transcrição bilíngue':'下载双语文字记录','Fechar':'关闭','Encerrar para todos?':'结束所有人的课堂？','Vamos salvar os últimos trechos reconhecidos e liberar a transcrição da aula.':'将保存最后识别出的发言，并提供课堂文字记录。',
    'Encerrar para todos':'结束所有人的课堂','Continuar aula':'继续上课','Conversa':'对话','Fechar painel ×':'关闭面板 ×','Conversa ao vivo':'实时对话','Cada voz tem seu espaço.':'双方发言分别显示。',
    'Letra':'字号','Tamanho das legendas':'字幕字号','Normal':'标准','Grande':'大','Maior':'更大','Original':'原文','Mais texto':'更多文字','Menos texto':'收起文字','Legenda flutuante':'悬浮字幕','Fechar flutuante':'关闭悬浮字幕',
    'PROFESSORA':'老师','Aluno':'学生','ALUNO':'学生','Aguardando a professora…':'等待老师发言…','Aguardando o aluno…':'等待学生发言…','A fala dela fica aqui.':'老师的发言显示在这里。','A resposta dele fica aqui.':'学生的回答显示在这里。',
    'Sala conectada':'课堂已连接','Aguardando aprovação':'等待批准','Entrada recusada':'加入申请被拒绝','Aceitar':'允许加入','Recusar':'拒绝','Salvando os últimos trechos…':'正在保存最后的发言…',
    'Conectado':'已连接','Falha de conexão':'连接失败','Reconectando…':'正在重新连接…','Mostrar câmera':'显示摄像头','Clique para mostrar a câmera':'点击显示摄像头','Conexão interrompida':'连接已中断',
    'Sua conversa e o histórico da aula':'您的对话与课堂记录','Idiomas definidos por você':'您设置的语言','Falas enviadas com confirmação do servidor.':'发言已发送并由服务器确认。',
    'Carregar falas anteriores':'加载更早的发言','Ver texto reconhecido sem ajuste':'查看未经调整的识别文字','Tradução pendente — original preservado.':'翻译待完成，原文已保留。','Tradução pendente · ative a tradução':'翻译待完成 · 请启用翻译',
    'Organizando a transcrição…':'正在整理文字记录…','Transcrição até agora':'当前文字记录','Transcrição baixada com sucesso.':'文字记录下载成功。','Pontuando a fala…':'正在添加标点…',
    'Convite privado copiado. Compartilhe somente com seu aluno.':'私人邀请已复制，请仅分享给学生。','Selecione e copie o link com Ctrl+C.':'请选择链接并按 Ctrl+C 复制。',
    'Zoom do conteúdo':'内容缩放','Diminuir zoom':'缩小','Aumentar zoom':'放大','Mostrar todo o conteúdo':'显示全部内容','Ajustar à tela':'适应屏幕','Só muda a sua visualização.':'仅调整您的视图。','Arraste o conteúdo para mover.':'拖动内容以移动。','Zoom do conteúdo compartilhado':'共享内容缩放',
    'Conteúdo compartilhado. Use mais e menos para ampliar, setas para mover e zero para ajustar.':'共享内容：使用加减键缩放、方向键移动、0 键重置。',
    'Reconhecimento de voz':'语音识别','Reconhecimento do navegador':'浏览器语音识别','Whisper no dispositivo — precisão (experimental)':'设备端 Whisper · 高精度（实验性）','Whisper local — experimental':'本地 Whisper（实验性）',
    'Preparar reconhecimento':'准备语音识别','Cancelar preparação':'取消准备','Pontuação automática':'自动标点','Preserva as palavras. Vírgulas e perguntas são estimadas pelo contexto.':'保留原词，根据上下文推断逗号和问号。',
    'Opções de reconhecimento':'语音识别选项','Verificando motor…':'正在检查识别引擎…','Whisper no dispositivo disponível após preparação. O reconhecimento do navegador continua como alternativa.':'准备完成后可使用设备端 Whisper，也可选择浏览器识别。',
    'A pontuação nativa do navegador é preservada. A camada Python está disponível apenas no localhost.':'保留浏览器原生标点，Python 处理仅在本地环境可用。',
    'O provedor do navegador pode receber áudio. O texto é criptografado no dispositivo antes do envio ao banco.':'浏览器的服务提供方可能接收音频，文字在设备端加密后发送至数据库。',
    'O reconhecimento do navegador está disponível ao ligar o microfone.':'开启麦克风后即可使用浏览器语音识别。','Preparando idiomas…':'正在准备语言…','Whisper parado. Últimos trechos processados.':'Whisper 已停止，最后的片段已处理。',
    '✧ Beleza':'✧ 美颜','Fechar ajustes de beleza':'关闭美颜设置','RETRATO EM TEMPO REAL · 美颜':'实时美颜','Seu jeito de aparecer.':'展现自然的您。','Efeitos opcionais no dispositivo, com intensidade do seu jeito.':'在设备端处理，可自由调节效果强度。',
    'Ligue a câmera para ver a prévia.':'开启摄像头以查看预览。','Sua prévia':'您的预览','Ver original':'查看原图','Ver efeito':'查看效果','Efeito de beleza':'美颜效果',
    'O processamento acontece neste dispositivo. O aluno recebe a câmera com o efeito; sua tela compartilhada não muda.':'在此设备处理。学生会看到美颜效果，共享屏幕不受影响。',
    'Ativar efeito de beleza':'启用美颜','Motor de beleza':'美颜引擎','OpenMakeupSDK · maquiagem natural':'OpenMakeupSDK · 自然妆容','Combinar os dois · pele + maquiagem':'组合效果 · 美肤 + 妆容','GPUPixel · suavização e contorno':'GPUPixel · 磨皮与美型',
    'Estilos de beleza':'美颜风格','Natural':'自然','美颜 suave':'柔和美颜','Porcelana':'瓷肌','Suavização da pele · 磨皮':'磨皮','Luminosidade · 提亮':'提亮','Contorno do rosto · 瘦脸':'瘦脸','Realçar olhos · 大眼':'大眼','Tom rosado · 红润':'红润','Batom suave':'柔和唇色','Contorno sutil do nariz':'轻微瘦鼻',
    'Restaurar ajustes naturais':'恢复自然设置','Desligado. Sua câmera continua original.':'已关闭，使用原始摄像头画面。','Efeito selecionado. Ligue a câmera para aplicar.':'效果已选定，开启摄像头即可应用。',
    'Preparando efeito de beleza… Sua câmera original continua na chamada.':'正在准备美颜，通话暂时使用原始画面。','Preparando o rastreamento do rosto… O primeiro uso baixa o modelo.':'正在准备人脸跟踪，首次使用需下载模型。',
    'Efeito ativo. O aluno recebe sua câmera com o filtro.':'效果已启用，学生会看到美颜画面。','Efeito ativo. OpenMakeupSDK aplicado à câmera enviada ao aluno.':'效果已启用，学生会看到 OpenMakeupSDK 妆容。','Efeito ativo. GPUPixel + OpenMakeupSDK aplicados à câmera enviada ao aluno.':'组合效果已启用，学生会看到美肤和妆容。',
    'Efeito pronto. Aproxime o rosto da câmera para aplicar os ajustes.':'效果已就绪，请靠近摄像头以应用效果。','Efeitos: OpenMakeupSDK (MIT) e GPUPixel (Apache 2.0). Rastreamento auxiliar: MediaPipe. Sem licença paga.':'效果：OpenMakeupSDK（MIT）、GPUPixel（Apache 2.0）。辅助跟踪：MediaPipe。无需付费许可。',
    'Guardar acesso privado da aula':'保存课堂私人访问文件','Guardar acesso à aula':'保存课堂访问文件','Senha do arquivo':'文件密码','Baixar arquivo protegido':'下载加密文件','Cancelar':'取消',
    'O arquivo inclui sua chave e seu acesso à transcrição. Proteja-o com uma senha. Sem a chave ou esse arquivo, o servidor não consegue recuperar o conteúdo para você.':'文件包含密钥和文字记录访问权限，请用密码保护。没有密钥或此文件，服务器无法恢复内容。',
    'Use uma senha de pelo menos 10 caracteres.':'请使用至少 10 个字符的密码。','Não foi possível criar o arquivo protegido.':'无法创建加密文件。',
    'E-mail ou senha incorretos.':'邮箱或密码错误。','Esta aula já foi encerrada.':'这堂课已经结束。','Permita o acesso nas configurações do navegador.':'请在浏览器设置中允许访问。','Dispositivo não encontrado.':'未找到设备。','Dispositivo ocupado. Feche outros aplicativos que estejam usando-o.':'设备被占用，请关闭正在使用它的其他应用。',
    'Falha na conexão.':'连接失败。','Falha interna do servidor.':'服务器内部错误。','Há falas que ainda não foram salvas. Aguarde a conexão ou baixe a transcrição antes de encerrar.':'仍有发言尚未保存。请等待连接恢复，或在结束前下载记录。'
  };
  let language='pt';try{language=localStorage.getItem('aulaInterfaceLanguage')==='zh'?'zh':'pt';}catch{}
  const originals=new WeakMap(),attributes=new WeakMap();
  // Classroom content and participant identities are never interface strings.
  const protectedContent='script,style,svg,textarea,#transcript,#caption[data-user-content],#studentCaption[data-user-content],#original,#studentOriginal,#captionSpeaker,#studentCaptionSpeaker,#selfName,#selfLabel,#selfInitial,#meetingTitle,#joinTitle,#sessionTitle[data-user-content],.tilelabel,.bubble-name,.bubble-avatar,.avatar,#interfaceLanguage';
  function translate(text){
    if(dictionary[text])return dictionary[text];
    const profile=text.match(/^Reconhecimento: (.+) → (.+)\. Tradução configurada separadamente\.$/);if(profile)return '语音识别：'+({Mandarim:'中文',Português:'葡萄牙语',Inglês:'英语',Espanhol:'西班牙语'}[profile[1]]||profile[1])+' → '+({Navegador:'浏览器','Whisper no dispositivo':'设备端 Whisper','Whisper local':'本地 Whisper'}[profile[2]]||profile[2])+'。翻译单独配置。';
    const request=text.match(/^(.+) quer entrar$/);if(request)return request[1]+' 申请加入';
    const ready=text.match(/^Tradução pronta\. As falas serão traduzidas para (.+)\.$/);if(ready)return '翻译已就绪，发言将翻译为'+(dictionary[ready[1]]||ready[1])+'。';
    const summary=text.match(/^Professora: (.+) ⇄ Aluno: (.+)\. Definidos antes de abrir a sala\.$/);if(summary)return '老师：'+(dictionary[summary[1]]||summary[1])+' ⇄ 学生：'+(dictionary[summary[2]]||summary[2])+'。创建课堂前设置。';
    const welcome=text.match(/^Olá, (.+)\. Vamos abrir sua aula\?$/);if(welcome)return `您好，${welcome[1]}。准备开始上课吗？`;
    const count=text.match(/^(\d+) pessoa(s)?$/);if(count)return `${count[1]} 人`;
    if(text.endsWith(' está compartilhando'))return text.slice(0,-' está compartilhando'.length)+' 正在共享屏幕';
    if(text==='Você está compartilhando a tela')return '您正在共享屏幕';
    const name=text.match(/^(.+) · Você$/);if(name)return name[1]+' · 您';
    const waiting=text.match(/^(\d+) fala\(s\) aguardando confirmação\. A fila permanece neste navegador\.$/);if(waiting)return `${waiting[1]} 条发言等待确认，已保存在此浏览器的队列中。`;
    return text;
  }
  function updateText(node){
    if(node.parentElement?.closest(protectedContent))return;
    const current=node.data,previous=originals.get(node);
    const source=previous&&current===previous.rendered?previous.source:current;
    const trimmed=source.trim(),result=language==='zh'?source.replace(trimmed,translate(trimmed)):source;
    originals.set(node,{source,rendered:result});if(current!==result)node.data=result;
  }
  function updateAttributes(element){
    if(element.closest(protectedContent))return;
    const saved=attributes.get(element)||{};
    for(const key of ['placeholder','aria-label','title']){const current=element.getAttribute(key);if(current===null)continue;const old=saved[key],source=old&&current===old.rendered?old.source:current,result=language==='zh'?translate(source):source;saved[key]={source,rendered:result};if(result!==current)element.setAttribute(key,result);}
    attributes.set(element,saved);
  }
  const titleInput=document.getElementById('roomTitle');let customTitle=false;titleInput.addEventListener('input',()=>{customTitle=true;});
  const button=document.createElement('button');button.type='button';button.id='interfaceLanguage';document.querySelector('.app-header').append(button);
  const observer=new MutationObserver(records=>{observer.disconnect();for(const record of records){if(record.type==='characterData')updateText(record.target);else if(record.type==='attributes')updateAttributes(record.target);else for(const node of record.addedNodes)walk(node);}observe();});
  function walk(root){if(root.nodeType===3){updateText(root);return;}if(root.nodeType!==1&&root.nodeType!==9)return;if(root.nodeType===1){if(root.closest(protectedContent))return;updateAttributes(root);}const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(node.nodeType===3)updateText(node);else if(!node.closest(protectedContent))updateAttributes(node);}}
  function observe(){observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});}
  function apply(){observer.disconnect();document.documentElement.lang=language==='zh'?'zh-CN':'pt-BR';if(!customTitle&&['Minha aula','我的课堂'].includes(titleInput.value))titleInput.value=language==='zh'?'我的课堂':'Minha aula';walk(document.documentElement);button.textContent=language==='zh'?'Português':'中文';button.setAttribute('aria-label',language==='zh'?'切换到葡萄牙语':'Mudar interface para chinês simplificado');button.title=language==='zh'?'Português':'中文（简体）';observe();}
  button.onclick=()=>{language=language==='zh'?'pt':'zh';try{localStorage.setItem('aulaInterfaceLanguage',language);}catch{}apply();};
  window.interfaceLanguage={get:()=>language};apply();
})();
