import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor(tag) { this.tagName = tag; this.attributes = {}; this.children = []; this.listeners = new Map(); this.style = {}; this.hidden = false; this.value = ''; this.textContent = ''; this.rect = null; this.capture = null; }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'value') this.value = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  replaceChildren(...nodes) { this.children.forEach(node => node.parent = null); this.children = []; this.append(...nodes); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, data = {}) { const event = {target: this, button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, ...data}; [...(this.listeners.get(type) || [])].forEach(fn => fn(event)); }
  closest(selector) { if (selector === '[data-annotation-id]' && this.getAttribute('data-annotation-id')) return this; return this.parent?.closest(selector) || null; }
  getBoundingClientRect() { return this.rect || this.parent?.getBoundingClientRect() || {left: 0, top: 0, width: 1000, height: 600}; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; this.fire('lostpointercapture'); }
  focus() { this.focused = true; }
}
const plain = value => JSON.parse(JSON.stringify(value));
function harness({edit = true, send} = {}) {
  const document = new Element('document'), window = new Element('window'), container = new Element('div');
  document.createElement = tag => new Element(tag); document.createElementNS = (_, tag) => new Element(tag);
  const sent = [], statuses = []; let resize, disconnected = false;
  class ResizeObserver { constructor(callback) { resize = callback; } observe() {} disconnect() { disconnected = true; } }
  vm.runInNewContext(fs.readFileSync('dist/lesson-annotations.js', 'utf8'), {document, window, ResizeObserver, setTimeout, clearTimeout, console});
  const api = window.lessonAnnotations.attach({container, canEdit: () => edit, send: packet => { sent.push(plain(packet)); return send?.(packet); }, onStatus: text => statuses.push(text)});
  const toolbar = api.toolbar, surface = api.surface;
  const button = name => toolbar.children.find(child => child.getAttribute('aria-label') === name);
  return {api, container, document, toolbar, surface, button, sent, statuses, resize: () => resize(), permission: value => edit = value, disconnected: () => disconnected};
}
const envelope = (type, extra = {}, page = 'screen') => ({v: 1, page, type, ...extra});
const stroke = (id = 'test1', points = [[.2, .3]]) => ({id, kind: 'pen', color: '#2563eb', width: 3, points});

test('pen synchronizes bounded incremental chunks and final speech-sized stroke survives pointer release', () => {
  const student = harness({edit: false});
  const teacher = harness({send: packet => student.api.receive(packet)});
  assert.notEqual(teacher.surface.getAttribute('data-editing'), 'true');
  assert.equal(student.toolbar.hidden, true);
  teacher.button('Caneta').fire('click');
  teacher.surface.fire('pointerdown', {clientX: 100, clientY: 100});
  for (let i = 1; i <= 80; i++) teacher.surface.fire('pointermove', {clientX: 100 + i * 4, clientY: 100 + i});
  teacher.surface.fire('pointerup');
  assert.equal(teacher.sent.filter(packet => packet.type === 'upsert').length, 1);
  assert.ok(teacher.sent.filter(packet => packet.type === 'append').length >= 6);
  assert.ok(teacher.sent.every(packet => JSON.stringify(packet).length < 7000));
  assert.deepEqual(plain(student.api.snapshot()), plain(teacher.api.snapshot()));
  assert.equal(teacher.api.snapshot()[1].object.points.length, 81);
  assert.equal(teacher.surface.capture, null);
  teacher.api.destroy(); student.api.destroy();
});

test('coordinates stay normalized on resize and inactive tools pass pointer events through', () => {
  const h = harness(); h.api.receive(envelope('upsert', {object: stroke()}));
  assert.match(h.surface.children[0].getAttribute('d'), /M200.00,180.00/);
  h.container.rect = {left: 0, top: 0, width: 500, height: 300}; h.resize();
  assert.match(h.surface.children[0].getAttribute('d'), /M100.00,90.00/);
  h.button('Caneta').fire('click'); assert.equal(h.surface.getAttribute('data-editing'), 'true');
  h.document.fire('keydown', {key: 'Escape'}); assert.equal(h.surface.getAttribute('data-editing'), 'false');
  h.surface.fire('pointerdown'); assert.equal(h.sent.length, 0); h.api.destroy();
});

test('text is entered in a textarea and rendered as text, never parsed as HTML', () => {
  const h = harness(); h.button('Texto').fire('click'); h.surface.fire('pointerdown', {clientX: 250, clientY: 240});
  const editor = h.container.children.find(child => child.getAttribute('class') === 'lesson-annotations-text');
  assert.equal(editor.hidden, false); assert.equal(editor.children[0].focused, true);
  const hostile = '<img src=x onerror=alert(1)>\n中文 & português';
  editor.children[0].value = hostile; editor.children[1].fire('click');
  const text = h.surface.children[0]; assert.equal(text.tagName, 'text');
  assert.equal(text.children[0].textContent, hostile.split('\n')[0]);
  assert.equal(text.children[1].textContent, hostile.split('\n')[1]);
  assert.equal(editor.hidden, true); h.api.destroy();
});

test('erase, undo and clear synchronize object state', () => {
  const h = harness(); h.button('Caneta').fire('click'); h.surface.fire('pointerdown', {clientX: 100, clientY: 100}); h.surface.fire('pointerup');
  h.button('Apagar').fire('click'); h.surface.fire('pointerdown', {target: h.surface.children[0]});
  assert.equal(h.api.snapshot().length, 1);
  h.button('Desfazer última anotação').fire('click'); assert.equal(h.api.snapshot().length, 2);
  h.button('Limpar anotações desta página').fire('click'); assert.equal(h.api.snapshot().length, 1);
  h.button('Desfazer última anotação').fire('click'); assert.equal(h.api.snapshot().length, 2); h.api.destroy();
});

test('late join snapshots are bounded, validated atomically and isolated per page', () => {
  const h = harness({edit: false});
  const points = Array.from({length: 400}, (_, i) => [.1234, i % 2 ? .9876 : .1234]);
  assert.equal(h.api.receive(envelope('upsert', {object: stroke('x'.repeat(100), points)})), true);
  const snapshot = h.api.snapshot(); assert.ok(snapshot.every(packet => JSON.stringify(packet).length < 7000));
  const other = harness({edit: false}); assert.equal(other.api.restore(snapshot), true);
  assert.deepEqual(plain(other.api.snapshot()), plain(snapshot));
  assert.equal(other.api.restore([...snapshot, envelope('upsert', {object: {...stroke(), kind: 'script'}})]), false);
  assert.deepEqual(plain(other.api.snapshot()), plain(snapshot));
  h.api.setPage('slide-2'); assert.equal(h.api.snapshot().length, 1);
  assert.equal(h.api.receive(snapshot[1]), false); h.api.setPage('screen'); assert.equal(h.api.snapshot().length, 2);
  h.api.destroy(); other.api.destroy();
});

test('malformed, oversized, wrong-page and out-of-order packets cannot change rendered annotations', () => {
  const h = harness({edit: false});
  assert.equal(h.api.receive(envelope('upsert', {object: stroke()})), true);
  const invalid = [envelope('clear', {}, 'other'), {...envelope('clear'), v: 99}, envelope('append', {id: 'test1', start: 4, points: [[.2, .3]]}), envelope('append', {id: 'test1', start: 1, points: [[Infinity, 0]]}), envelope('upsert', {object: {...stroke(), points: Array(401).fill([0, 0])}}), envelope('upsert', {object: {id: 'x', kind: 'text', color: '#123456', x: 0, y: 0, text: 'x'.repeat(241)}}), envelope('clear', {extra: 'x'.repeat(7001)})];
  for (const value of invalid) assert.equal(h.api.receive(value), false);
  assert.equal(h.api.snapshot()[1].object.points.length, 1);
  assert.equal(h.api.receive(envelope('append', {id: 'test1', start: 1, points: [[.4, .5]]})), true);
  assert.equal(h.api.snapshot()[1].object.points.length, 2); h.api.destroy();
});

test('permission changes stop editing, send errors are visible, and destruction removes listeners and UI', () => {
  const h = harness({send: () => { throw Error('offline'); }});
  h.button('Caneta').fire('click'); h.surface.fire('pointerdown', {clientX: 50, clientY: 50}); h.surface.fire('pointerup');
  assert.ok(h.statuses.some(text => /conexão/.test(text)));
  h.permission(false); h.api.setPage('screen'); assert.equal(h.toolbar.hidden, true);
  const count = h.sent.length; h.surface.fire('pointerdown'); assert.equal(h.sent.length, count);
  h.api.destroy(); assert.equal(h.container.children.length, 0); assert.equal(h.disconnected(), true);
  assert.equal(h.document.listeners.get('keydown').size, 0); assert.equal(h.surface.listeners.get('pointerdown').size, 0);
  assert.equal(h.api.receive(envelope('clear')), false);
});
