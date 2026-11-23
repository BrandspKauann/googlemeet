/* The foreground is composited at each viewer: video codecs do not preserve alpha. */
(() => {
  const WORKER_URL = '/presenter-runtime/v1/worker.js?v=20261122-1';
  const STATUS = {
    loading: 'Preparando câmera sem fundo…',
    ready: 'Câmera sem fundo sobre a apresentação.',
    fallback: 'Recorte indisponível neste dispositivo. Mostrando a câmera com fundo.',
    stopped: 'Câmera da apresentação encerrada.'
  };

  function attach(inputStream, canvas, options = {}) {
    const { signal, mirror = false, onStatus, onError } = options;
    const source = inputStream?.getVideoTracks?.()[0];
    if (!source || !canvas?.getContext) throw new Error('Câmera e canvas são necessários para a apresentação.');
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Não foi possível preparar a câmera da apresentação.');
    let stopped = false, clone, processingTrack, video, worker, frameRequest, fallbackTimer, readyTimer, frameTimer;
    let fallback = true, status, lastWidth = 0, lastHeight = 0;
    const notify = (state, message = STATUS[state]) => {
      if (state === status) return;
      status = state;
      try { onStatus?.({ state, message }); } catch { /* UI callbacks cannot stop the camera. */ }
    };
    const reportError = error => {
      try { onError?.(error instanceof Error ? error : new Error(String(error))); } catch { /* Keep the call active. */ }
    };
    const clearCanvas = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
    const draw = (image, width, height) => {
      if (stopped || !width || !height) return;
      if (lastWidth !== width || lastHeight !== height) {
        canvas.width = lastWidth = width;
        canvas.height = lastHeight = height;
      }
      clearCanvas();
      context.save();
      try {
        if (mirror) { context.translate(width, 0); context.scale(-1, 1); }
        context.drawImage(image, 0, 0, width, height);
      } finally { context.restore(); }
    };
    const cancelFallback = () => {
      clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
      if (frameRequest !== undefined) video?.cancelVideoFrameCallback?.(frameRequest);
      frameRequest = undefined;
    };
    const drawFallback = () => {
      if (stopped || !fallback) return;
      if (video?.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const ratio = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
        draw(video, Math.max(2, Math.round(video.videoWidth * ratio)), Math.max(2, Math.round(video.videoHeight * ratio)));
      }
    };
    const scheduleFallback = () => {
      if (stopped || !fallback) return;
      drawFallback();
      if (typeof video?.requestVideoFrameCallback === 'function') {
        frameRequest = video.requestVideoFrameCallback(() => { frameRequest = undefined; scheduleFallback(); });
      } else fallbackTimer = setTimeout(scheduleFallback, 16);
    };
    const terminateWorker = () => {
      clearTimeout(readyTimer);
      clearTimeout(frameTimer);
      const previous = worker;
      worker = undefined;
      // A separate clone lets us release a transferred processor even when the camera fallback stays active.
      processingTrack?.stop();
      processingTrack = undefined;
      if (!previous) return;
      try { previous.postMessage({ type: 'stop' }); } catch { /* Already terminated. */ }
      previous.terminate();
    };
    const useFallback = error => {
      if (stopped) return;
      terminateWorker();
      fallback = true;
      cancelFallback();
      scheduleFallback();
      notify('fallback');
      if (error) reportError(error);
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      signal?.removeEventListener('abort', stop);
      clone?.removeEventListener?.('ended', stop);
      cancelFallback();
      terminateWorker();
      if (video) { video.pause(); video.srcObject = null; video.remove(); }
      clone?.stop();
      clearCanvas();
      notify('stopped');
    };
    const controller = { stop };
    if (signal?.aborted) { stop(); return controller; }
    signal?.addEventListener('abort', stop, { once: true });

    try {
      clone = source.clone();
      clone.addEventListener?.('ended', stop, { once: true });
      video = document.createElement('video');
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([clone]);
      video.play().then(() => { if (!stopped && fallback) drawFallback(); }).catch(error => {
        if (!stopped) reportError(error);
      });
      scheduleFallback();
      if (!window.Worker || !window.MediaStreamTrackProcessor || !window.OffscreenCanvas) {
        useFallback(new Error('Este navegador não oferece recorte de câmera em segundo plano.'));
        return controller;
      }
      notify('loading');
      processingTrack = source.clone();
      const processor = new MediaStreamTrackProcessor({ track: processingTrack, maxBufferSize: 1 });
      worker = new Worker(WORKER_URL);
      const currentWorker = worker;
      worker.onmessage = ({ data }) => {
        const bitmap = data?.bitmap;
        if (stopped || worker !== currentWorker) { bitmap?.close?.(); return; }
        if (data.type === 'frame') {
          try {
            draw(bitmap, data.width, data.height);
            if (fallback) { fallback = false; cancelFallback(); }
            clearTimeout(readyTimer);
            clearTimeout(frameTimer);
            frameTimer = setTimeout(() => {
              if (worker === currentWorker) useFallback(new Error('O recorte deixou de receber quadros. A câmera continua com fundo.'));
            }, 5000);
            notify('ready');
          } catch (error) { useFallback(error); }
          finally {
            bitmap?.close?.();
            if (worker === currentWorker) currentWorker.postMessage({ type: 'consumed' });
          }
        } else if (data.type === 'error') useFallback(new Error(data.message || 'O recorte da câmera foi interrompido.'));
      };
      worker.onerror = event => {
        event.preventDefault?.();
        if (!stopped && worker === currentWorker) useFallback(new Error(event.message || 'O recorte da câmera foi interrompido.'));
      };
      worker.onmessageerror = () => {
        if (!stopped && worker === currentWorker) useFallback(new Error('Não foi possível receber o recorte da câmera.'));
      };
      readyTimer = setTimeout(() => {
        if (worker === currentWorker) useFallback(new Error('O recorte demorou para preparar. A câmera continua disponível.'));
      }, 60000);
      worker.postMessage({ type: 'start', readable: processor.readable }, [processor.readable]);
    } catch (error) {
      if (clone && video) useFallback(error);
      else { reportError(error); stop(); }
    }
    return controller;
  }

  window.presenterCamera = { attach };
})();
