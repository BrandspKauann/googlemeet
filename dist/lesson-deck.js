(() => {
  'use strict';
  const MAX_FILE_BYTES = 35 * 1024 * 1024, MAX_FILES = 100, MAX_PAGES = 200;
  const PPTX_WARNING = 'PPTX em modo estático: animações, vídeos e alguns elementos podem diferir. Para preservar o visual, use PDF.';
  const LIMITS = Object.freeze({maxEntries: 4000, maxTotalUncompressedBytes: 160 * 1024 * 1024, maxXmlPartBytes: 8 * 1024 * 1024, maxTotalXmlBytes: 32 * 1024 * 1024});
  let runtime;
  const loadRuntime = () => runtime ||= import('/lesson-runtime/v1/runtime.js').catch(error => { runtime = null; throw error; });
  const imageTypes = new Set(['png', 'jpg', 'jpeg', 'webp']);
  const extension = file => String(file?.name || '').split('.').pop().toLowerCase();
  function inspect(input) {
    const files = Array.isArray(input) ? input : [input];
    if (!files.length || files.length > MAX_FILES) throw Error('Selecione entre 1 e 100 imagens, ou um PDF/PPTX.');
    let total = 0;
    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(file.size) || file.size <= 0) throw Error('Selecione um arquivo válido.');
      total += file.size;
      if (file.size > MAX_FILE_BYTES || total > MAX_FILE_BYTES) throw Error('A apresentação deve ter no máximo 35 MB.');
    }
    const type = extension(files[0]);
    if (files.length > 1 && files.some(file => !imageTypes.has(extension(file)))) throw Error('Para selecionar vários arquivos, use apenas imagens PNG, JPG ou WebP.');
    if (!imageTypes.has(type) && !['pdf', 'pptx'].includes(type)) throw Error('Use PPTX, PDF, PNG, JPG ou WebP. Arquivos PPT antigos devem ser exportados como PDF.');
    return {files, format: imageTypes.has(type) ? 'image' : type};
  }
  function fit(width, height, targetWidth = 1280, targetHeight = 720) {
    if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 1e9)) throw Error('Dimensões inválidas na apresentação.');
    const scale = Math.min(targetWidth / width, targetHeight / height);
    return {x: (targetWidth - width * scale) / 2, y: (targetHeight - height * scale) / 2, width: width * scale, height: height * scale, scale};
  }
  // SVG stays an image; no deck markup ever enters the page's HTML tree.
  // The allowlist also removes links and external assets before rasterization.
  function safeSvg(source) {
    if (source.length > 20 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw Error('Slide complexo demais para abrir com segurança. Exporte como PDF.');
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw Error('Não foi possível desenhar este slide. Exporte como PDF.');
    const viewBox = String(doc.documentElement.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const intrinsicWidth = viewBox.length === 4 ? viewBox[2] : Number(doc.documentElement.getAttribute('width'));
    const intrinsicHeight = viewBox.length === 4 ? viewBox[3] : Number(doc.documentElement.getAttribute('height'));
    const raster = fit(intrinsicWidth, intrinsicHeight);
    doc.documentElement.setAttribute('width', String(Math.round(raster.width)));
    doc.documentElement.setAttribute('height', String(Math.round(raster.height)));
    const allowed = new Set('svg g defs path rect circle ellipse line polygon polyline text tspan image use linearGradient radialGradient stop clipPath mask pattern filter feGaussianBlur feColorMatrix feComponentTransfer feFuncR feFuncG feFuncB feFuncA feMerge feMergeNode feOffset feFlood feComposite feBlend feDropShadow title desc'.split(' '));
    let omitted = 0;
    const nodes = [...doc.querySelectorAll('*')];
    if (nodes.length > 80_000) throw Error('Slide complexo demais. Exporte como PDF.');
    for (const element of nodes) {
      if (!allowed.has(element.localName) || element.namespaceURI !== 'http://www.w3.org/2000/svg') {element.remove(); omitted++; continue;}
      for (const attr of [...element.attributes]) {
        const name = attr.localName.toLowerCase(), value = attr.value;
        if (name.startsWith('on') || name === 'src' || name === 'base' || /javascript:|@import|expression\s*\(/i.test(value)) {element.removeAttributeNode(attr); continue;}
        if (name === 'href') {
          const internal = /^#[\w:.-]+$/.test(value);
          const raster = element.localName === 'image' && /^data:image\/(?:png|jpeg|jpg|webp|gif|bmp);base64,[a-z\d+/=\s]+$/i.test(value);
          if (!internal && !raster) {element.removeAttributeNode(attr); omitted++;}
        }
        if ([...value.matchAll(/url\s*\(([^)]*)\)/gi)].some(match => !/^\s*['"]?#[\w:.-]+['"]?\s*$/.test(match[1]))) {element.removeAttributeNode(attr); omitted++;}
      }
    }
    return {svg: new XMLSerializer().serializeToString(doc), omitted};
  }
  function imageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob), image = new Image();
      const finish = () => {image.onload = image.onerror = null; URL.revokeObjectURL(url);};
      image.onload = () => {finish(); resolve(image);};
      image.onerror = () => {finish(); reject(Error('Não foi possível abrir a imagem do slide. Use PDF, PNG, JPG ou WebP.'));};
      image.src = url;
    });
  }
  function create({canvas, onStatus = () => {}, onPage = () => {}} = {}) {
    if (!canvas?.getContext) throw Error('Canvas da apresentação não encontrado.');
    const context = canvas.getContext('2d', {alpha: false});
    const metrics = document.createElement('canvas').getContext('2d');
    canvas.width = 1280; canvas.height = 720;
    let documentState = null, generation = 0, renderTicket = 0, renderTask = null, requested = -1, lastPage = -1;
    let pdfLoading = null, loading = false;
    const status = (state, message) => onStatus({state, message});
    function measureText(text, spec) {
      // A family is a value, never a CSS rule or a URL.
      const family = String(spec.family || 'Arial').replace(/["\\\r\n]/g, '');
      metrics.font = `${spec.italic ? 'italic ' : ''}${spec.bold ? 'bold ' : ''}${spec.sizePx}px "${family}", Arial, "Microsoft YaHei", sans-serif`;
      const measured = metrics.measureText(text);
      return {widthPx: measured.width + Math.max(0, [...text].length - 1) * (spec.letterSpacingPx || 0), ascentPx: measured.fontBoundingBoxAscent || measured.actualBoundingBoxAscent, descentPx: measured.fontBoundingBoxDescent || measured.actualBoundingBoxDescent};
    }
    async function release(state) {
      if (state?.pdf) {try {await state.pdf.destroy();} catch {}}
      if (state?.images) state.images.length = 0;
    }
    async function clear(version) {
      renderTicket++; loading = false; requested = lastPage = -1;
      renderTask?.cancel(); renderTask = null;
      const oldLoading = pdfLoading; pdfLoading = null;
      const old = documentState; documentState = null;
      if (oldLoading) {try {await oldLoading.destroy();} catch {}}
      await release(old);
      if (version === generation) {
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        status('idle', 'Abra um PPTX, PDF ou imagens para apresentar.');
      }
    }
    const close = () => clear(++generation);
    async function go(index) {
      const state = documentState;
      if (!state || loading) return false;
      index = Math.max(0, Math.min(state.count - 1, Math.trunc(Number(index))));
      if (!Number.isFinite(index)) return false;
      requested = index;
      const ticket = ++renderTicket, version = generation;
      renderTask?.cancel(); renderTask = null;
      status('rendering', `Abrindo slide ${index + 1} de ${state.count}…`);
      try {
        // Each render owns its own pixels. Fast navigation cannot paint stale content.
        const pageCanvas = document.createElement('canvas'); pageCanvas.width = 1280; pageCanvas.height = 720;
        const pageContext = pageCanvas.getContext('2d', {alpha: false});
        pageContext.fillStyle = '#ffffff'; pageContext.fillRect(0, 0, 1280, 720);
        let title = state.name, warning = state.format === 'pptx' ? PPTX_WARNING : '', sourceWidth = 1280, sourceHeight = 720;
        if (state.format === 'pdf') {
          const page = await state.pdf.getPage(index + 1);
          try {
            if (ticket !== renderTicket || version !== generation) return false;
            const natural = page.getViewport({scale: 1}); sourceWidth = natural.width; sourceHeight = natural.height;
            const box = fit(sourceWidth, sourceHeight), viewport = page.getViewport({scale: box.scale});
            const task = page.render({canvasContext: pageContext, viewport, transform: [1, 0, 0, 1, box.x, box.y], background: '#ffffff'});
            renderTask = task;
            await task.promise;
          } finally {page.cleanup();}
        } else {
          let image;
          if (state.format === 'pptx') {
            const result = state.pptx.render(index, measureText); title = result.title || title;
            const safe = safeSvg(result.svg);
            if (safe.omitted || /data-pptx-fallback=/.test(result.svg)) warning += ' Este slide contém elementos não exibidos; confira a prévia.';
            image = await imageFromBlob(new Blob([safe.svg], {type: 'image/svg+xml'}));
          } else {
            image = await imageFromBlob(state.images[index]); title = state.images[index].name || title;
          }
          sourceWidth = image.naturalWidth; sourceHeight = image.naturalHeight;
          if (state.format === 'image' && sourceWidth * sourceHeight > 32_000_000) throw Error('Imagem muito grande. Reduza para até 32 megapixels.');
          const box = fit(sourceWidth, sourceHeight);
          pageContext.drawImage(image, box.x, box.y, box.width, box.height);
          image.src = '';
        }
        if (ticket !== renderTicket || version !== generation || state !== documentState) return false;
        context.drawImage(pageCanvas, 0, 0); pageCanvas.width = pageCanvas.height = 1;
        lastPage = index;
        onPage({index, count: state.count, title, name: state.name, format: state.format, warning, width: sourceWidth, height: sourceHeight});
        status('ready', warning || `Slide ${index + 1} de ${state.count}. O arquivo permanece neste dispositivo.`);
        return true;
      } catch (error) {
        if (ticket !== renderTicket || version !== generation || error?.name === 'RenderingCancelledException') return false;
        status('error', error?.message || 'Não foi possível abrir o slide. Exporte a apresentação como PDF.');
        throw error;
      } finally {if (ticket === renderTicket) renderTask = null;}
    }
    async function load(input) {
      const inspected = inspect(input);
      const version = ++generation;
      await clear(version);
      if (version !== generation) return false;
      loading = true;
      status('loading', 'Abrindo apresentação no dispositivo…');
      let candidate = null;
      try {
        const {files, format} = inspected;
        candidate = {format, name: files[0].name, count: files.length};
        if (format === 'image') candidate.images = files.slice();
        else {
          const module = await loadRuntime();
          const bytes = new Uint8Array(await files[0].arrayBuffer());
          if (version !== generation) return false;
          if (format === 'pptx') {candidate.pptx = await module.openPptx(bytes, LIMITS); candidate.count = candidate.pptx.count;}
          else {
            const task = module.openPdf(bytes); pdfLoading = task;
            task.onPassword = () => {task.destroy();};
            candidate.pdf = await task.promise;
            if (pdfLoading === task) pdfLoading = null;
            candidate.count = candidate.pdf.numPages;
          }
        }
        if (candidate.count < 1 || candidate.count > MAX_PAGES) throw Error('A apresentação deve ter entre 1 e 200 slides.');
        if (version !== generation) {await release(candidate); return false;}
        documentState = candidate; loading = false;
        return await go(0);
      } catch (error) {
        await release(candidate);
        if (version !== generation) return false;
        documentState = null; loading = false; pdfLoading = null;
        status('error', error?.name === 'PasswordException' ? 'PDF protegido por senha. Exporte uma cópia sem senha para apresentar.' : error?.message || 'Não foi possível abrir o arquivo. Tente exportar como PDF.');
        throw error;
      }
    }
    return {load, go, close, next: () => go(requested + 1), previous: () => go(requested - 1), get index() {return lastPage;}, get count() {return documentState?.count || 0;}, get active() {return !!documentState;}, get format() {return documentState?.format || null;}};
  }
  window.lessonDeck = Object.freeze({create, inspect, fit, limits: Object.freeze({maxBytes: MAX_FILE_BYTES, maxFiles: MAX_FILES, maxPages: MAX_PAGES})});
})();
