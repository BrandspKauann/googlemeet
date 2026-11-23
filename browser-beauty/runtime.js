window.createBeauty = async function(input, values, status, onError, cancelled, signal) {
  const version = '20261123-natural1';
  const [{ Renderer }, { FaceMesh }, { MaskPainter }, { computeFace }, { buildWarps, faceUniforms, blurScaleFor },
    { defaults, toShader, DEFAULT_COLORS }, { safeWarpParameters }] = await Promise.all(
    ['renderer', 'facemesh', 'mask', 'face', 'warp', 'controls', 'tracking-safety'].map(name => import('/face-beautifier/' + name + '.js?v=' + version)));
  if (signal?.aborted || cancelled()) return null;
  const video = document.createElement('video');
  video.muted = true; video.autoplay = true; video.playsInline = true; video.srcObject = input;
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:.001;pointer-events:none';
  document.body.append(video);
  const canvas = document.createElement('canvas');
  let renderer, mesh, output, clock, raf, visibility, videoCallback, stopped = false, initializing = true;
  let frames = 0, sourceRevision = 0, renderedRevision = -1, lastMediaTime = -1, lastMask = -1, forceRender = true;
  let current = { ...values }, started = performance.now();
  const diagnostics = { renderer: 'face-beautifier', version, frames: 0, tracking: 'loading', trackingWorker: true,
    inputWidth: 0, inputHeight: 0, outputWidth: 0, outputHeight: 0, renderMs: 0, renderedFps: 0, reshapeActive: false };
  window.beautyDiagnostics = () => ({ ...diagnostics, ...mesh?.diagnostics?.() });
  function stop() {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(raf); clock?.terminate();
    if (videoCallback !== undefined) video.cancelVideoFrameCallback?.(videoCallback);
    if (visibility) document.removeEventListener('visibilitychange', visibility);
    signal?.removeEventListener('abort', stop); mesh?.close();
    output?.getTracks().forEach(track => track.stop());
    video.pause(); video.srcObject = null; video.remove();
    renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  function observeSource() {
    if (stopped || !video.requestVideoFrameCallback) return;
    videoCallback = video.requestVideoFrameCallback(() => { sourceRevision++; observeSource(); });
  }
  function draw() {
    if (stopped) return;
    if (cancelled() || signal?.aborted) { stop(); return; }
    try {
      const now = performance.now(), width = video.videoWidth, height = video.videoHeight;
      if (!width || !height || video.readyState < 2) return;
      const hasSourceCallback = typeof video.requestVideoFrameCallback === 'function';
      const changed = hasSourceCallback && !document.hidden ? sourceRevision !== renderedRevision : video.currentTime !== lastMediaTime;
      if (!forceRender && !changed) return;
      forceRender = false; renderedRevision = sourceRevision; lastMediaTime = video.currentTime;
      renderer.resize(width, height); painter.setAspect(width / height); renderer.uploadSource(video, width, height);
      mesh.detect(video, now);
      const tracking = mesh.snapshot(now), points = tracking.points;
      const face = computeFace(points, width / height);
      if (lastMask !== tracking.revision) { renderer.uploadMask(points ? painter.paint(points) : painter.clear()); lastMask = tracking.revision; }
      const values = { ...defaults(), ...current, lipAmount: current.lipstick, blushAmount: current.blush };
      const params = toShader(values, DEFAULT_COLORS), warpParams = safeWarpParameters(params, tracking);
      const warps = buildWarps(face, warpParams);
      renderer.render({ params, warps, face: faceUniforms(face, tracking.confidence), blurScale: blurScaleFor(face, height, params.radius),
        mirror: 0, compare: -1, showMask: false, time: now / 1000 });
      renderer.gl.flush();
      if (renderer.gl.isContextLost?.()) throw Error('A aceleração de vídeo foi interrompida. Sua câmera continua disponível sem efeito.');
      diagnostics.frames = ++frames; diagnostics.inputWidth = width; diagnostics.inputHeight = height;
      diagnostics.outputWidth = width; diagnostics.outputHeight = height;
      const elapsed = performance.now() - now;
      diagnostics.renderMs = Math.round((frames === 1 ? elapsed : diagnostics.renderMs * .9 + elapsed * .1) * 10) / 10;
      diagnostics.renderedFps = Math.round(frames * 10000 / Math.max(1, now - started)) / 10;
      diagnostics.reshapeActive = warps.length > 0;
      output?.getVideoTracks()[0]?.requestFrame?.();
    } catch (error) { stop(); if (initializing) throw error; onError(error); }
  }
  let painter;
  function loop() { if (stopped) return; if (!document.hidden) draw(); if (!stopped) raf = requestAnimationFrame(loop); }
  signal?.addEventListener('abort', stop, { once: true });
  try {
    await video.play();
    if (!video.videoWidth) await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); video.removeEventListener('loadeddata', ready); signal?.removeEventListener('abort', aborted); };
      const ready = () => { cleanup(); resolve(); }, aborted = () => { cleanup(); resolve(); };
      const timer = setTimeout(() => { cleanup(); reject(Error('A câmera não forneceu imagens.')); }, 10000);
      video.addEventListener('loadeddata', ready, { once: true });
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) aborted();
    });
    if (signal?.aborted || cancelled()) { stop(); return null; }
    renderer = new Renderer(canvas); mesh = new FaceMesh(); painter = new MaskPainter(320);
    observeSource(); draw();
    output = canvas.captureStream(0);
    if (!output.getVideoTracks()[0]?.requestFrame) { output.getTracks().forEach(track => track.stop()); output = canvas.captureStream(); }
    output.getVideoTracks()[0].contentHint = 'motion';
    forceRender = true; draw(); loop();
    clock = new Worker('/beauty-clock.js');
    clock.onmessage = event => { if (event.data?.type === 'tick') { if (document.hidden) draw(); clock?.postMessage({ type: 'consumed' }); } };
    visibility = () => { forceRender = true; clock?.postMessage({ type: 'active', value: document.hidden }); };
    document.addEventListener('visibilitychange', visibility); visibility();
    initializing = false;
    mesh.load().then(result => {
      if (stopped) { mesh.close(); return; }
      diagnostics.tracking = result; forceRender = true;
      status(result === 'ready' ? 'Filtro de beleza ativo. Seu formato natural é preservado; ajustes de rosto são opcionais.' : 'Filtro ativo com suavização leve. Ajustes de rosto indisponíveis neste navegador.');
    });
    status('Filtro de beleza ativo. Preparando ajustes faciais sem pausar a câmera…');
    return { stream: output, setValues(next) { current = { ...current, ...next }; forceRender = true; }, stop };
  } catch (error) { stop(); if (signal?.aborted || cancelled()) return null; throw error; }
};
