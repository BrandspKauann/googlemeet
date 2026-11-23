/* Live presentation annotations. In-memory only; the room authenticates the sender. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const LIMIT = {objects: 200, points: 400, totalPoints: 8000, pages: 24, text: 240, packet: 7000, undo: 20};
  const EMOJI = ['👍', '👏', '❤️', '⭐', '❓', '🎉', '😊', '💡'];
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value);
  const validPage = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
  const point = value => Array.isArray(value) && value.length === 2 && value.every(n => Number.isFinite(n) && n >= 0 && n <= 1);
  const round = value => Math.round(value * 10000) / 10000;
  const cleanPoints = value => Array.isArray(value) && value.length > 0 && value.length <= LIMIT.points && value.every(point) ? value.map(p => p.map(round)) : null;
  const clone = value => JSON.parse(JSON.stringify(value));
  function object(value) {
    if (!value || typeof value !== 'object' || !validId(value.id)) return null;
    const {id, kind} = value;
    if (kind === 'pen' || kind === 'marker') {
      const points = cleanPoints(value.points);
      if (!points || !/^#[\da-f]{6}$/i.test(value.color) || !Number.isFinite(value.width) || value.width < 1 || value.width > 12) return null;
      return {id, kind, color: value.color, width: value.width, points};
    }
    if (kind !== 'text' && kind !== 'emoji') return null;
    if (!point([value.x, value.y]) || typeof value.text !== 'string' || !value.text.trim() || value.text.length > LIMIT.text) return null;
    if (kind === 'emoji' && !EMOJI.includes(value.text)) return null;
    if (!/^#[\da-f]{6}$/i.test(value.color)) return null;
    return {id, kind, color: value.color, x: round(value.x), y: round(value.y), text: value.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')};
  }
  function packet(value) {
    if (!value || typeof value !== 'object' || value.v !== 1 || !validPage(value.page)) return null;
    try { if (JSON.stringify(value).length > LIMIT.packet) return null; } catch { return null; }
    const base = {v: 1, page: value.page, type: value.type};
    if (value.type === 'clear') return base;
    if (value.type === 'remove' && validId(value.id)) return {...base, id: value.id};
    if (value.type === 'upsert') { const entry = object(value.object); return entry ? {...base, object: entry} : null; }
    if (value.type === 'append' && validId(value.id) && Number.isInteger(value.start) && value.start >= 1 && value.start < LIMIT.points) {
      const points = cleanPoints(value.points);
      return points && value.start + points.length <= LIMIT.points ? {...base, id: value.id, start: value.start, points} : null;
    }
    return null;
  }
  function attach({container, canEdit = () => false, send = () => {}, onStatus = () => {}} = {}) {
    if (!container || typeof container.append !== 'function') throw new TypeError('Informe a área da apresentação.');
    let dead = false, pageId = 'screen', tool = '', color = '#2563eb', width = 3, chosenEmoji = EMOJI[0];
    let drawing = null, flushTimer = null, editPosition = null, sequence = 0;
    let dimensions = {width: 1, height: 1};
    const pages = new Map(), removers = [], rendered = new Map(), prefix = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
    const allowed = () => { try { return !dead && !!canEdit(); } catch { return false; } };
    const status = message => { try { onStatus(message); } catch {} };
    const el = (tag, attrs = {}, text) => {
      const node = document.createElement(tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const svgEl = (tag, attrs = {}) => { const node = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node; };
    const listen = (node, event, callback, options) => { node.addEventListener(event, callback, options); removers.push(() => node.removeEventListener(event, callback, options)); };
    function state() {
      if (!pages.has(pageId)) {
        if (pages.size >= LIMIT.pages) pages.delete(pages.keys().next().value);
        pages.set(pageId, {objects: new Map(), undo: []});
      }
      return pages.get(pageId);
    }
    const pointsIn = entries => Array.from(entries.values()).reduce((sum, entry) => sum + (entry.points?.length || 0), 0);
    const id = () => `${prefix}-${++sequence}`;
    const wrap = (type, data = {}) => ({v: 1, page: pageId, type, ...data});
    function transmit(value) {
      if (!allowed()) return false;
      const safe = packet(value);
      if (!safe) { status('A anotação excedeu o limite permitido.'); return false; }
      try {
        const result = send(safe);
        if (result === false) status('Não foi possível enviar a anotação.');
        if (result?.then) result.then(ok => { if (ok === false && !dead) status('Não foi possível enviar a anotação.'); }, () => { if (!dead) status('Não foi possível enviar a anotação. Verifique a conexão.'); });
        return result !== false;
      } catch { status('Não foi possível enviar a anotação. Verifique a conexão.'); return false; }
    }
    const style = el('style');
    style.textContent = `.lesson-annotations-toolbar{position:absolute;left:10px;top:10px;z-index:8;display:flex;flex-wrap:wrap;align-items:center;gap:5px;max-width:calc(100% - 20px);padding:6px;background:rgba(255,255,255,.97);border:1px solid #d9e1ec;border-radius:12px;box-shadow:0 3px 18px #0f172a1a;color:#18243a;font:13px system-ui,sans-serif;pointer-events:auto}.lesson-annotations-toolbar[hidden],.lesson-annotations-text[hidden],.lesson-annotations-palette[hidden]{display:none!important}.lesson-annotations-toolbar button{font:inherit;min-height:32px;border:1px solid transparent;border-radius:7px;background:#f2f5fa;color:inherit;padding:4px 8px;cursor:pointer}.lesson-annotations-toolbar button[aria-pressed=true]{background:#dbeafe;border-color:#93b7fa;color:#174fae}.lesson-annotations-toolbar button:focus-visible,.lesson-annotations-text textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}.lesson-annotations-toolbar input[type=color]{width:30px;height:30px;padding:2px;border:0;background:transparent}.lesson-annotations-toolbar select{font:inherit;max-width:65px;border:1px solid #d9e1ec;border-radius:6px;padding:4px}.lesson-annotations-palette{display:flex;gap:3px;flex-wrap:wrap;flex-basis:100%;border-top:1px solid #e2e8f0;padding-top:5px}.lesson-annotations-text{position:absolute;z-index:9;display:flex;flex-wrap:wrap;gap:5px;width:240px;max-width:calc(100% - 12px);background:white;border:1px solid #cbd5e1;border-radius:10px;padding:8px;box-shadow:0 4px 18px #0f172a26;pointer-events:auto}.lesson-annotations-text textarea{width:100%;height:74px;resize:vertical;font:16px system-ui,sans-serif;color:#0f172a;background:white;border:1px solid #cbd5e1;border-radius:5px}.lesson-annotations-text button{padding:5px 10px;background:#eaf1ff;border:0;border-radius:5px;color:#1d4ed8;cursor:pointer}.lesson-annotations-surface{position:absolute;inset:0;z-index:6;width:100%;height:100%;overflow:hidden;touch-action:none;pointer-events:none}.lesson-annotations-surface[data-editing=true]{pointer-events:auto;cursor:crosshair}`;
    const surface = svgEl('svg', {'class': 'lesson-annotations-surface', 'aria-label': 'Anotações da apresentação'});
    const toolbar = el('div', {'class': 'lesson-annotations-toolbar', 'role': 'toolbar', 'aria-label': 'Anotar apresentação'});
    const controls = new Map();
    const tools = [['', '↖', 'Navegar'], ['pen', '✎', 'Caneta'], ['marker', '▰', 'Marca-texto'], ['eraser', '⌫', 'Apagar'], ['text', 'T', 'Texto'], ['emoji', '😊', 'Emojis']];
    function closeText() { editor.hidden = true; textarea.value = ''; editPosition = null; }
    function selectTool(next) {
      finish(); closeText(); tool = allowed() ? next : '';
      surface.setAttribute('data-editing', String(!!tool));
      controls.forEach((button, key) => button.setAttribute('aria-pressed', String(tool === key)));
      palette.hidden = tool !== 'emoji';
    }
    tools.forEach(([key, glyph, title]) => {
      const button = el('button', {'type': 'button', 'title': title, 'aria-label': title, 'aria-pressed': String(!key)}, glyph);
      controls.set(key, button); toolbar.append(button); listen(button, 'click', () => selectTool(key));
    });
    const colorInput = el('input', {'type': 'color', 'value': color, 'aria-label': 'Cor das anotações', 'title': 'Cor'});
    const widthInput = el('select', {'aria-label': 'Espessura da caneta', 'title': 'Espessura'});
    [2, 3, 5, 8, 12].forEach(value => { const option = el('option', {'value': String(value)}, String(value)); option.selected = value === width; widthInput.append(option); });
    const undo = el('button', {'type': 'button', 'aria-label': 'Desfazer última anotação', 'title': 'Desfazer'}, '↶');
    const clear = el('button', {'type': 'button', 'aria-label': 'Limpar anotações desta página', 'title': 'Limpar esta página'}, 'Limpar');
    toolbar.append(colorInput, widthInput, undo, clear);
    listen(colorInput, 'input', () => { color = colorInput.value; });
    listen(widthInput, 'change', () => { width = Number(widthInput.value); });
    const palette = el('div', {'class': 'lesson-annotations-palette', 'role': 'group', 'aria-label': 'Escolher emoji'}); palette.hidden = true;
    EMOJI.forEach(emoji => {
      const button = el('button', {'type': 'button', 'aria-label': emoji, 'aria-pressed': String(emoji === chosenEmoji)}, emoji);
      listen(button, 'click', () => { chosenEmoji = emoji; Array.from(palette.children).forEach(item => item.setAttribute('aria-pressed', String(item === button))); });
      palette.append(button);
    });
    toolbar.append(palette);
    const editor = el('div', {'class': 'lesson-annotations-text'}); editor.hidden = true;
    const textarea = el('textarea', {'maxlength': String(LIMIT.text), 'aria-label': 'Texto da anotação', 'placeholder': 'Escreva na apresentação…'});
    const addText = el('button', {'type': 'button'}, 'Adicionar');
    const cancelText = el('button', {'type': 'button'}, 'Cancelar');
    editor.append(textarea, addText, cancelText);
    container.append(style, surface, toolbar, editor);
    function syncPermission() {
      toolbar.hidden = !allowed();
      if (!allowed() && tool) { finish(false); closeText(); tool = ''; surface.setAttribute('data-editing', 'false'); }
    }
    function draw(entry) {
      const {width: w, height: h} = dimensions;
      if (entry.points) {
        const points = entry.points;
        const d = points.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * w).toFixed(2)},${(p[1] * h).toFixed(2)}`).join(' ');
        const line = svgEl('path', {'d': points.length === 1 ? `${d} l.01,0` : d, 'fill': 'none', 'stroke': entry.color, 'stroke-width': entry.width * (entry.kind === 'marker' ? 4 : 1), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'opacity': entry.kind === 'marker' ? '.32' : '1', 'data-annotation-id': entry.id});
        surface.append(line); rendered.set(entry.id, line);
      } else {
        const text = svgEl('text', {'x': entry.x * w, 'y': entry.y * h, 'fill': entry.color, 'font-family': 'system-ui, sans-serif', 'font-size': entry.kind === 'emoji' ? '34' : '22', 'dominant-baseline': 'hanging', 'data-annotation-id': entry.id});
        entry.text.split('\n').slice(0, 10).forEach((line, i) => { const span = svgEl('tspan', {'x': entry.x * w, 'dy': i ? '1.2em' : '0'}); span.textContent = line; text.append(span); });
        surface.append(text); rendered.set(entry.id, text);
      }
    }
    function paint(entry) { rendered.get(entry.id)?.remove(); draw(entry); }
    function render() { if (dead) return; surface.replaceChildren(); rendered.clear(); state().objects.forEach(draw); syncPermission(); undo.disabled = !state().undo.length; }
    function resize() {
      const rect = container.getBoundingClientRect();
      dimensions = {width: Math.max(1, rect.width), height: Math.max(1, rect.height)};
      surface.setAttribute('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`); render();
    }
    function remember(inverse) {
      const history = state().undo;
      history.push(inverse);
      while (history.length > LIMIT.undo || history.reduce((sum, batch) => sum + batch.reduce((n, p) => n + (p.object?.points?.length || 0), 0), 0) > LIMIT.totalPoints * 2) history.shift();
    }
    function apply(value, remote = false) {
      const safe = packet(value);
      if (dead || !safe || safe.page !== pageId) return false;
      const entries = state().objects;
      if (safe.type === 'clear') { entries.clear(); surface.replaceChildren(); rendered.clear(); }
      if (safe.type === 'remove') { entries.delete(safe.id); rendered.get(safe.id)?.remove(); rendered.delete(safe.id); }
      if (safe.type === 'upsert') {
        const old = entries.get(safe.object.id);
        if ((!old && entries.size >= LIMIT.objects) || pointsIn(entries) - (old?.points?.length || 0) + (safe.object.points?.length || 0) > LIMIT.totalPoints) return false;
        entries.set(safe.object.id, safe.object); paint(safe.object);
      }
      if (safe.type === 'append') {
        const old = entries.get(safe.id);
        if (!old?.points || old.points.length !== safe.start || pointsIn(entries) + safe.points.length > LIMIT.totalPoints) return false;
        old.points.push(...safe.points); paint(old);
      }
      if (remote) state().undo = [];
      syncPermission(); undo.disabled = !state().undo.length; return true;
    }
    function local(value) { if (!allowed() || !apply(value)) { status('Limite de anotações atingido. Limpe a página para continuar.'); return false; } transmit(value); return true; }
    function coordinates(event) {
      const rect = surface.getBoundingClientRect();
      const round = n => Math.round(Math.max(0, Math.min(1, n)) * 10000) / 10000;
      return [round((event.clientX - rect.left) / Math.max(1, rect.width)), round((event.clientY - rect.top) / Math.max(1, rect.height))];
    }
    function flush() {
      clearTimeout(flushTimer); flushTimer = null;
      if (!drawing?.pending.length) return;
      if (!allowed()) { drawing.pending = []; return; }
      const pending = drawing.pending.splice(0);
      const start = drawing.sent;
      drawing.sent += pending.length;
      transmit(wrap('append', {id: drawing.id, start, points: pending}));
    }
    function finish(commit = true) {
      if (!drawing) return;
      const active = drawing;
      if (commit && allowed()) { flush(); remember([wrap('remove', {id: active.id})]); }
      else { clearTimeout(flushTimer); flushTimer = null; }
      drawing = null;
      try { if (surface.hasPointerCapture(active.pointerId)) surface.releasePointerCapture(active.pointerId); } catch {}
      render();
    }
    function create(entry) {
      if (local(wrap('upsert', {object: entry}))) remember([wrap('remove', {id: entry.id})]);
      render();
    }
    function erase(event) {
      const node = event.target?.closest?.('[data-annotation-id]');
      const key = node?.getAttribute('data-annotation-id');
      const old = state().objects.get(key);
      if (old && local(wrap('remove', {id: key}))) { remember([wrap('upsert', {object: clone(old)})]); undo.disabled = false; }
    }
    listen(surface, 'pointerdown', event => {
      if (!tool || !allowed() || event.button !== 0) return;
      event.preventDefault(); closeText();
      const [x, y] = coordinates(event);
      if (tool === 'eraser') { erase(event); return; }
      if (tool === 'emoji') { create({id: id(), kind: 'emoji', color, x, y, text: chosenEmoji}); return; }
      if (tool === 'text') {
        editPosition = {x, y}; editor.hidden = false;
        editor.style.left = `${Math.max(6, Math.min(x * dimensions.width, dimensions.width - 258))}px`;
        editor.style.top = `${Math.max(6, Math.min(y * dimensions.height, dimensions.height - 140))}px`;
        textarea.focus(); return;
      }
      if (drawing) finish();
      const entry = {id: id(), kind: tool, color, width, points: [[x, y]]};
      if (!local(wrap('upsert', {object: entry}))) return;
      drawing = {id: entry.id, pointerId: event.pointerId, pending: [], sent: 1};
      try { surface.setPointerCapture(event.pointerId); } catch {}
    });
    listen(surface, 'pointermove', event => {
      if (!drawing || drawing.pointerId !== event.pointerId) return;
      if (!allowed()) { finish(false); return; }
      event.preventDefault();
      const entry = state().objects.get(drawing.id);
      if (!entry || entry.points.length >= LIMIT.points || pointsIn(state().objects) >= LIMIT.totalPoints) { finish(); status('Traço concluído. Continue com um novo traço.'); return; }
      const next = coordinates(event), previous = entry.points.at(-1);
      if (Math.hypot((next[0] - previous[0]) * dimensions.width, (next[1] - previous[1]) * dimensions.height) < 1.5) return;
      entry.points.push(next); drawing.pending.push(next); paint(entry);
      if (drawing.pending.length >= 12) flush(); else if (!flushTimer) flushTimer = setTimeout(flush, 60);
    });
    listen(surface, 'pointerup', event => { if (drawing?.pointerId === event.pointerId) finish(); });
    listen(surface, 'pointercancel', () => finish());
    listen(surface, 'lostpointercapture', () => { if (drawing) finish(); });
    listen(addText, 'click', () => {
      if (!allowed() || !editPosition || !textarea.value.trim()) return;
      create({id: id(), kind: 'text', color, ...editPosition, text: textarea.value.slice(0, LIMIT.text)}); closeText();
    });
    listen(cancelText, 'click', closeText);
    listen(undo, 'click', () => {
      if (!allowed()) return; finish(); closeText();
      const inverse = state().undo.pop(); if (!inverse) return;
      inverse.forEach(value => { if (apply(value)) transmit(value); }); render();
    });
    listen(clear, 'click', () => {
      if (!allowed()) return; finish(); closeText();
      const inverse = Array.from(state().objects.values(), entry => wrap('upsert', {object: clone(entry)}));
      if (inverse.length && local(wrap('clear'))) remember(inverse);
      render();
    });
    listen(document, 'keydown', event => { if (event.key === 'Escape' && (tool || !editor.hidden)) selectTool(''); });
    let observer;
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(resize); observer.observe(container); }
    else listen(window, 'resize', resize);
    resize();
    return {
      toolbar,
      surface,
      receive(value) { return apply(value, true); },
      snapshot() { finish(); return [wrap('clear'), ...Array.from(state().objects.values(), entry => wrap('upsert', {object: clone(entry)}))]; },
      restore(values) {
        if (dead || !Array.isArray(values) || values.length > LIMIT.objects + 1) return false;
        const packets = values.map(packet);
        if (packets.some(value => !value || value.page !== pageId)) return false;
        // Validate the complete snapshot against a detached map before replacing live state.
        const entries = new Map();
        for (const value of packets) {
          if (value.type === 'clear') entries.clear();
          else if (value.type === 'upsert') entries.set(value.object.id, value.object);
          else return false;
        }
        if (entries.size > LIMIT.objects || pointsIn(entries) > LIMIT.totalPoints) return false;
        finish(false); closeText(); state().objects = entries; state().undo = []; render(); return true;
      },
      setPage(value) {
        if (dead || !validPage(String(value ?? ''))) return false;
        finish(); closeText(); pageId = String(value); render(); return true;
      },
      destroy() {
        if (dead) return; finish(); dead = true; clearTimeout(flushTimer); observer?.disconnect();
        removers.splice(0).forEach(remove => remove()); pages.clear(); rendered.clear();
        [style, surface, toolbar, editor].forEach(node => node.remove());
      }
    };
  }
  window.lessonAnnotations = Object.freeze({attach});
})();
