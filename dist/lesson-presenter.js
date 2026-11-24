(() => {
  'use strict';
  const el = id => document.getElementById(id), stage = el('screenStage'), viewport = el('screenViewport'), video = el('screenVideo');
  const bar = document.createElement('div'); bar.id = 'lessonTools'; bar.hidden = true;
  bar.innerHTML = '<button type="button" id="lessonImport">Abrir apresentação</button><input id="lessonFile" type="file" accept=".pptx,.pdf,.png,.jpg,.jpeg,.webp" multiple hidden><div id="lessonSlides" hidden><button type="button" id="lessonPrevious" aria-label="Slide anterior">←</button><output id="lessonPage">1 / 1</output><button type="button" id="lessonNext" aria-label="Próximo slide">→</button></div><label class="presenter-toggle" id="lessonCameraLabel"><input id="lessonCamera" type="checkbox" checked>Câmera na apresentação</label><label class="presenter-toggle" id="lessonStudentNotesLabel"><input id="lessonStudentNotes" type="checkbox" checked>Permitir anotações do aluno</label><span id="lessonStatus" role="status"></span>';
  const openButton = document.createElement('button'); openButton.id = 'openLessonDeck'; openButton.type = 'button'; openButton.textContent = 'Apresentação'; openButton.hidden = true;
  document.querySelector('.room-actions').prepend(openButton); stage.querySelector('.screenhead').after(bar);
  const content = document.createElement('div'); content.id = 'lessonContent'; viewport.append(content);
  const camera = document.createElement('div'); camera.id = 'presenterOverlay'; camera.hidden = true;
  const foreground = document.createElement('canvas'); foreground.id = 'presenterCanvas'; foreground.setAttribute('aria-label', 'Câmera de quem apresenta');
  const badge = document.createElement('span'); badge.className = 'presenter-caption'; camera.append(foreground, badge); content.append(camera);
  const sourceCanvas = document.createElement('canvas'); sourceCanvas.id = 'lessonSource'; sourceCanvas.hidden = true; document.body.append(sourceCanvas);
  let hooks, current, controller, cutout, cameraTrack, cameraMirror, session = '', page = '', enabled = true, allowStudents = true, localSource = null, deckActive = false, loading = false, disposed = false;
  let view = {scale: 1, x: 0, y: 0}, epoch = '', revision = 0;
  let remoteSession = '', remotePage = '', remoteEpoch = '', remoteEnabled = true, remoteAllowStudents = false, remoteReady = false, lastRevision = 0, proposalSequence = 0, pendingSnapshot = null, snapshotTimer;
  const proposals = new Map(), resyncAt = new Map();
  const status = message => { el('lessonStatus').textContent = message || ''; };
  const isTeacher = () => current?.you?.role === 'teacher';
  const active = () => !!current?.teacherPresenting && current.you?.status === 'accepted' && !current.ended && !disposed;
  const canAnnotate = () => active() && (isTeacher() || remoteReady && remoteAllowStudents && !!remoteSession && page === remotePage);
  const validMember = member => member && member.status === 'accepted' && /^[a-zA-Z0-9_.:-]{1,64}$/.test(member.id);
  function send(packet, target) { return hooks?.send({v: 1, ...packet}, target); }
  function metadata() { return {session, page, epoch, revision, enabled, allowStudents, active: !!current?.teacherPresenting}; }
  function announce(target) { if (session) return send({type: 'state', ...metadata()}, target); }
  function advanceEpoch() { epoch = crypto.randomUUID(); proposals.clear(); resyncAt.clear(); }
  function broadcast(data, author) { revision++; return send({type: 'annotation', session, page, epoch, revision, author, data}); }
  const notes = window.lessonAnnotations.attach({
    container: content, canEdit: canAnnotate, identity: () => current?.you?.id || 'local',
    canEditObject: object => isTeacher() || object.owner === current?.you?.id, canClearAll: isTeacher,
    send: data => {
      if (!canAnnotate()) return false;
      if (isTeacher()) return broadcast(data, current.you.id);
      return send({type: 'proposal', session: remoteSession, page: remotePage, epoch: remoteEpoch, proposal: ++proposalSequence, data}, current.teacher.id);
    }, onStatus: status
  });
  bar.after(notes.toolbar);
  function setPage(next) {
    if (page === next) return false;
    // Finish the old-page stroke before changing the envelope.
    notes.setPage(next); page = next;
    if (isTeacher()) advanceEpoch();
    return true;
  }
  function permissionUI() {
    const teacher = isTeacher(), presenting = active();
    el('lessonImport').hidden = !teacher; el('lessonCameraLabel').hidden = !teacher;
    el('lessonStudentNotesLabel').hidden = !teacher; el('lessonStudentNotes').checked = allowStudents;
    el('lessonSlides').hidden = !teacher || !deckActive; bar.hidden = stage.hidden || !presenting;
    notes.refreshPermission(); notes.toolbar.hidden = !canAnnotate(); notes.surface.style.display = current?.teacherPresenting ? '' : 'none';
    if (!teacher) status(!remoteReady ? 'Sincronizando anotações…' : remoteAllowStudents ? 'Você pode desenhar e apagar suas próprias anotações.' : 'A professora desativou as anotações do aluno.');
    taskPanel.hidden = !teacher || current?.you?.status !== 'accepted' || current?.ended;
  }
  function resetCamera() { cutout?.stop(); cutout = null; cameraTrack = null; camera.hidden = true; camera.classList.remove('fallback'); }
  function layout() {
    const w = viewport.clientWidth, h = viewport.clientHeight, sw = video.videoWidth, sh = video.videoHeight;
    if (!sw || !sh || !w || !h) return;
    const fit = Math.min(w / sw, h / sh);
    content.style.width = sw * fit + 'px'; content.style.height = sh * fit + 'px';
    content.style.left = (w - sw * fit) / 2 + 'px'; content.style.top = (h - sh * fit) / 2 + 'px';
    content.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
  }
  function syncCamera() {
    const stream = current?.camera, track = stream?.getVideoTracks()[0];
    const show = (current?.presenting ?? current?.teacherPresenting) && (current?.presenter?.role === 'student' || (isTeacher() ? enabled : remoteEnabled)) && track?.readyState === 'live';
    if (!show) { resetCamera(); return; }
    const mirror = current?.presenter ? current.presenter.id === current.you.id : isTeacher(); camera.hidden = false;
    if (cameraTrack === track && cameraMirror === mirror) return;
    resetCamera(); camera.hidden = false; cameraTrack = track; cameraMirror = mirror; badge.textContent = (current.presenter || current.teacher)?.name || 'Participante';
    cutout = window.presenterCamera.attach(stream, foreground, {mirror, onStatus: result => {
      camera.classList.toggle('fallback', result.state === 'fallback');
      badge.textContent = ((current?.presenter || current?.teacher)?.name || 'Participante') + (result.state === 'loading' ? ' · Preparando recorte…' : result.state === 'fallback' ? ' · Sem recorte neste navegador' : '');
    }, onError: () => { badge.textContent = ((current?.presenter || current?.teacher)?.name || 'Participante') + ' · Câmera sem recorte'; }});
  }
  function sync(value) {
    if (disposed) return; current = value;
    const teacher = isTeacher(), canTeach = teacher && value.you.status === 'accepted' && !value.ended;
    openButton.hidden = !canTeach; openButton.disabled = loading; el('lessonCamera').checked = enabled;
    const source = value.localScreen?.getVideoTracks()[0];
    if (teacher && value.teacherPresenting && source && source !== localSource) {
      if (session) notes.setPage('inactive');
      localSource = source; session = crypto.randomUUID(); revision = 0;
      setPage(session + ':' + (deckActive ? 'slide-' + (controller?.index || 0) : 'screen')); snapshot();
    } else if (teacher && !value.teacherPresenting && localSource) {
      announce(); notes.setPage('inactive'); localSource = null; session = ''; page = ''; advanceEpoch();
    }
    if (!teacher && remotePage && page !== remotePage) setPage(remotePage);
    permissionUI(); syncCamera(); layout();
  }
  async function loadFiles(files) {
    if (loading || !files?.length || !isTeacher() || current.you.status !== 'accepted' || current.ended) return;
    loading = true; openButton.disabled = true; el('lessonImport').disabled = true; status('Abrindo apresentação no dispositivo…');
    try {
      controller ??= window.lessonDeck.create({canvas: sourceCanvas, onStatus: message => status(typeof message === 'string' ? message : message?.message), onPage: info => {
        el('lessonPage').textContent = (info.index + 1) + ' / ' + info.count;
        el('lessonPrevious').disabled = info.index === 0; el('lessonNext').disabled = info.index >= info.count - 1;
        if (deckActive && session) { setPage(session + ':slide-' + info.index); snapshot(); }
        if (info.warning) status(info.warning);
      }});
      if (!await controller.load(files.length === 1 ? files[0] : files)) return;
      deckActive = true; await hooks.startDeck(sourceCanvas); el('lessonSlides').hidden = false;
      status('Use as setas para trocar os slides. Animações e vídeos do PPTX podem não ser reproduzidos.');
    } catch (error) { deckActive = false; controller?.close(); status(error.message || 'Não foi possível abrir. Tente exportar o PowerPoint como PDF.'); }
    finally { loading = false; openButton.disabled = false; el('lessonImport').disabled = false; el('lessonFile').value = ''; }
  }
  openButton.onclick = () => el('lessonFile').click(); el('lessonImport').onclick = openButton.onclick;
  el('lessonFile').onchange = () => loadFiles([...el('lessonFile').files]);
  const turn = async method => { if (loading || !deckActive || !isTeacher()) return; loading = true; try { await controller[method](); } catch (error) { status(error.message); } finally { loading = false; } };
  el('lessonPrevious').onclick = () => turn('previous'); el('lessonNext').onclick = () => turn('next');
  el('lessonCamera').onchange = () => { if (!isTeacher()) return; enabled = el('lessonCamera').checked; announce(); syncCamera(); };
  el('lessonStudentNotes').onchange = () => {
    if (!isTeacher() || !active()) return;
    notes.snapshot(); allowStudents = el('lessonStudentNotes').checked; advanceEpoch(); snapshot(); permissionUI();
    status(allowStudents ? 'O aluno pode desenhar e apagar as próprias anotações.' : 'Anotações do aluno desativadas.');
  };
  function snapshot(target) {
    if (!isTeacher() || !active() || !session) return;
    const data = notes.snapshot(), snapshotId = crypto.randomUUID(), atRevision = revision;
    announce(target);
    send({type: 'snapshot-start', session, page, epoch, revision: atRevision, snapshotId, count: data.length}, target);
    data.forEach((item, index) => send({type: 'snapshot-item', session, page, epoch, revision: atRevision, snapshotId, index, data: item}, target));
    send({type: 'snapshot-end', session, page, epoch, revision: atRevision, snapshotId}, target);
  }
  function requestSnapshot() {
    remoteReady = false; permissionUI();
    if (current?.teacher?.id) send({type: 'request'}, current.teacher.id);
  }
  function resyncStudent(member) {
    if (Date.now() - (resyncAt.get(member.id) || 0) < 1000) return;
    resyncAt.set(member.id, Date.now()); snapshot(member.id);
  }
  function proposal(member, packet) {
    if (!isTeacher() || !active() || !allowStudents || !validMember(member) || member.role !== 'student' || packet.session !== session || packet.page !== page || packet.epoch !== epoch || !Number.isSafeInteger(packet.proposal) || packet.proposal < 1 || packet.proposal <= (proposals.get(member.id) || 0)) return false;
    if (!proposals.has(member.id) && proposals.size >= 5) return false;
    const data = window.lessonAnnotations.normalizePacket(packet.data);
    if (!data || data.page !== page || data.type === 'clear') return false;
    const key = data.object?.id || data.id, prior = notes.getObject(key);
    if (!key?.startsWith(member.id + ':') || data.type === 'upsert' && (data.object.owner !== member.id || prior) || data.type !== 'upsert' && prior?.owner !== member.id) { resyncStudent(member); return false; }
    if (!notes.receive(data)) { resyncStudent(member); return false; }
    proposals.set(member.id, packet.proposal); broadcast(data, member.id); return true;
  }
  function validRemote(packet) { return !!remoteSession && packet.session === remoteSession && packet.page === remotePage && packet.epoch === remoteEpoch; }
  function receive(member, packet) {
    if (disposed || !packet || packet.v !== 1 || !validMember(member)) return false;
    if (packet.type === 'request') { if (isTeacher() && member.role === 'student') { resyncStudent(member); return true; } return false; }
    if (packet.type === 'proposal') return proposal(member, packet);
    if (member.role !== 'teacher' || member.id !== current?.teacher?.id || isTeacher()) return false;
    if (packet.type === 'state') {
      if (typeof packet.session !== 'string' || !packet.session || packet.session.length > 64 || typeof packet.page !== 'string' || !packet.page || packet.page.length > 100 || typeof packet.epoch !== 'string' || !packet.epoch || packet.epoch.length > 64 || typeof packet.enabled !== 'boolean' || typeof packet.allowStudents !== 'boolean' || typeof packet.active !== 'boolean') return false;
      const changed = packet.session !== remoteSession || packet.page !== remotePage || packet.epoch !== remoteEpoch;
      if (changed || !packet.active) { remoteReady = false; pendingSnapshot = null; clearTimeout(snapshotTimer); proposalSequence = 0; }
      remoteSession = packet.active ? packet.session : ''; remotePage = packet.active ? packet.page : ''; remoteEpoch = packet.active ? packet.epoch : '';
      remoteEnabled = packet.enabled; remoteAllowStudents = packet.allowStudents;
      if (remotePage) setPage(remotePage); else { notes.setPage('inactive'); page = ''; }
      permissionUI(); syncCamera(); return true;
    }
    if (!validRemote(packet) || !Number.isSafeInteger(packet.revision) || packet.revision < 0) return false;
    if (packet.type === 'snapshot-start') {
      if (typeof packet.snapshotId !== 'string' || packet.snapshotId.length > 64 || !Number.isInteger(packet.count) || packet.count < 1 || packet.count > 201 || packet.revision < lastRevision && remoteReady) return false;
      pendingSnapshot = {id: packet.snapshotId, revision: packet.revision, count: packet.count, items: []}; remoteReady = false; permissionUI();
      clearTimeout(snapshotTimer); snapshotTimer = setTimeout(() => { pendingSnapshot = null; if (!disposed) { status('Sincronizando anotações…'); requestSnapshot(); } }, 10000); return true;
    }
    if (packet.type === 'snapshot-item') {
      const pending = pendingSnapshot, data = window.lessonAnnotations.normalizePacket(packet.data);
      if (!pending || packet.snapshotId !== pending.id || packet.revision !== pending.revision || packet.index !== pending.items.length || pending.items.length >= pending.count || !data || data.page !== page || !['clear', 'upsert'].includes(data.type)) return false;
      pending.items.push(data); return true;
    }
    if (packet.type === 'snapshot-end') {
      const pending = pendingSnapshot;
      if (!pending || packet.snapshotId !== pending.id || packet.revision !== pending.revision || pending.items.length !== pending.count || pending.items[0]?.type !== 'clear' || !notes.restore(pending.items)) return false;
      clearTimeout(snapshotTimer); pendingSnapshot = null; lastRevision = pending.revision; remoteReady = true; permissionUI(); return true;
    }
    if (packet.type === 'annotation') {
      if (!remoteReady || packet.revision <= lastRevision) return false;
      if (packet.revision !== lastRevision + 1) { requestSnapshot(); return false; }
      const data = window.lessonAnnotations.normalizePacket(packet.data);
      if (!data || data.page !== page || typeof packet.author !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(packet.author)) return false;
      // Its author already applied this proposal optimistically; reapplying an upsert would
      // overwrite the author's points that are still waiting for acknowledgement.
      if (packet.author !== current.you.id && !notes.receive(data)) { requestSnapshot(); return false; }
      lastRevision = packet.revision; return true;
    }
    return false;
  }
  function peerReady(member) {
    if (!validMember(member)) return;
    if (isTeacher() && member.role === 'student') snapshot(member.id);
    else if (member.role === 'teacher') send({type: 'request'}, member.id);
  }
  // Teacher-authored draft only: the room's hook provides its encrypted/durable chat path.
  const taskPanel = document.createElement('details'); taskPanel.id = 'lessonNotes'; taskPanel.className = 'livebox'; taskPanel.hidden = true;
  const taskTitle = document.createElement('summary'); taskTitle.textContent = 'Resumo e tarefas';
  const taskLabel = document.createElement('label'); taskLabel.htmlFor = 'lessonTaskDraft'; taskLabel.textContent = 'Rascunho da professora — revise antes de enviar.';
  const taskDraft = document.createElement('textarea'); taskDraft.id = 'lessonTaskDraft'; taskDraft.maxLength = 4000; taskDraft.rows = 6; taskDraft.placeholder = 'Resumo da aula e tarefas para a próxima aula…';
  const taskTemplate = document.createElement('button'); taskTemplate.type = 'button'; taskTemplate.textContent = 'Usar modelo';
  const taskSend = document.createElement('button'); taskSend.id = 'lessonSendTask'; taskSend.type = 'button'; taskSend.textContent = 'Enviar tarefa';
  const taskStatus = document.createElement('p'); taskStatus.setAttribute('role', 'status');
  taskPanel.append(taskTitle, taskLabel, taskDraft, taskTemplate, taskSend, taskStatus); el('lessonPanel').append(taskPanel);
  taskTemplate.onclick = () => { if (!isTeacher() || taskDraft.value.trim()) return; taskDraft.value = 'Resumo da aula:\n\nTarefas para a próxima aula:\n- '; taskDraft.focus(); };
  taskSend.onclick = async () => {
    if (!isTeacher() || current.you.status !== 'accepted' || current.ended || taskSend.disabled) return;
    const text = taskDraft.value.trim().slice(0, 4000);
    if (!text) { taskStatus.textContent = 'Escreva o resumo ou a tarefa antes de enviar.'; taskDraft.focus(); return; }
    if (typeof hooks?.postNote !== 'function') { taskStatus.textContent = 'O envio de tarefas não está disponível nesta sala.'; return; }
    taskSend.disabled = true; taskStatus.textContent = 'Enviando para a conversa da aula…';
    try { const result = await hooks.postNote('Resumo e tarefas\n\n' + text); if (result === false) throw Error('Não foi possível enviar agora.'); taskStatus.textContent = 'Incluído na conversa. Confira o estado de salvamento da aula.'; taskDraft.value = ''; }
    catch (error) { taskStatus.textContent = error.message || 'Não foi possível enviar. Seu rascunho foi mantido.'; }
    finally { taskSend.disabled = false; }
  };
  function stopDeck() { if (!deckActive) return; deckActive = false; controller?.close(); el('lessonSlides').hidden = true; }
  const observer = new ResizeObserver(layout); observer.observe(viewport);
  const viewChanged = event => { view = event.detail; layout(); };
  video.addEventListener('loadedmetadata', layout); video.addEventListener('resize', layout); viewport.addEventListener('screenviewchange', viewChanged);
  function destroy() {
    if (disposed) return; disposed = true; clearTimeout(snapshotTimer); pendingSnapshot = null; resetCamera(); notes.destroy(); controller?.close();
    observer.disconnect(); video.removeEventListener('loadedmetadata', layout); video.removeEventListener('resize', layout); viewport.removeEventListener('screenviewchange', viewChanged);
    proposals.clear(); resyncAt.clear(); taskDraft.value = ''; taskPanel.hidden = true; openButton.disabled = true; bar.hidden = true;
  }
  window.lessonPresenter = {configure(value) { hooks = value; }, sync, receive, peerReady, stopDeck, destroy};
})();
