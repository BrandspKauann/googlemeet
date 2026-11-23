import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const plain = value => JSON.parse(JSON.stringify(value));
function surface() {
  const ids = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.attributes = {}; this.children = []; this.listeners = new Map(); this.style = {}; this.hidden = false; this.disabled = false; this.value = ''; this.textContent = ''; this.capture = null; this.clientWidth = 1000; this.clientHeight = 600; this.classList = {toggle() {}, remove() {}}; }
    set id(value) { this.attributes.id = value; ids.set(value, this); } get id() { return this.attributes.id; }
    set className(value) { this.attributes.class = value; } get className() { return this.attributes.class; }
    setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'id') this.id = value; if (key === 'value') this.value = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    append(...nodes) { nodes.forEach(node => { node.remove(); node.parent = this; this.children.push(node); }); }
    prepend(node) { node.remove(); node.parent = this; this.children.unshift(node); }
    after(node) { node.remove(); node.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node); }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    replaceChildren(...nodes) { this.children.forEach(child => child.parent = null); this.children = []; this.append(...nodes); }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    fire(type, data = {}) { const event = {target: this, button: 0, pointerId: 1, clientX: 100, clientY: 100, preventDefault() {}, ...data}; this['on' + type]?.(event); [...(this.listeners.get(type) || [])].forEach(fn => fn(event)); }
    click() { this.fire('click'); }
    closest(selector) { if (selector === '[data-annotation-id]' && this.getAttribute('data-annotation-id')) return this; return this.parent?.closest(selector) || null; }
    querySelector(selector) { const children = this.children.flatMap(child => [child, ...child.all()]); return children.find(child => selector.startsWith('.') ? child.className?.split(' ').includes(selector.slice(1)) : child.id === selector.slice(1)) || null; }
    all() { return this.children.flatMap(child => [child, ...child.all()]); }
    getBoundingClientRect() { return {left: 0, top: 0, width: this.clientWidth, height: this.clientHeight}; }
    setPointerCapture(id) { this.capture = id; } hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; this.fire('lostpointercapture'); }
    focus() { this.focused = true; }
    set innerHTML(value) {
      this.replaceChildren();
      for (const [, tag, attrs] of value.matchAll(/<([a-z][\w-]*)([^>]*)>/g)) {
        const node = new Element(tag);
        for (const [, key, item] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(key, item);
        node.checked = /\bchecked\b/.test(attrs); node.hidden = /\bhidden\b/.test(attrs); this.append(node);
      }
    }
  }
  const document = new Element('document'), window = new Element('window'); document.body = new Element('body'); document.append(document.body);
  document.createElement = tag => new Element(tag); document.createElementNS = (_, tag) => new Element(tag); document.getElementById = id => ids.get(id);
  const add = (tag, id, parent = document.body, cls) => { const node = new Element(tag); node.id = id; if (cls) node.className = cls; parent.append(node); return node; };
  add('div', 'roomActions', document.body, 'room-actions'); const stage = add('section', 'screenStage'); add('div', 'screenHeader', stage, 'screenhead'); const viewport = add('div', 'screenViewport', stage); const video = add('video', 'screenVideo', viewport); video.videoWidth = 1920; video.videoHeight = 1080; add('aside', 'lessonPanel');
  return {document, window, ids, Element};
}
function network() {
  const members = new Map(), clients = new Map(), queue = [], sent = [];
  const teacher = {id: 'teacher1', role: 'teacher', status: 'accepted', name: 'Professora'};
  const initialSource = {readyState: 'live'}, localScreen = {getVideoTracks: () => [initialSource]};
  function client(id = 'teacher1') {
    const member = id === teacher.id ? teacher : {id, role: 'student', status: 'accepted', name: id}; members.set(id, member);
    const h = surface();
    h.window.presenterCamera = {attach() { return {stop() {}}; }};
    let controller;
    h.window.lessonDeck = {create(options) { return controller = {index: 0, async load() { options.onPage({index: 0, count: 2}); return true; }, async next() { this.index++; options.onPage({index: this.index, count: 2}); }, async previous() { this.index--; options.onPage({index: this.index, count: 2}); }, close() {}}; }};
    const context = {document: h.document, window: h.window, crypto: {randomUUID}, ResizeObserver: class {observe() {} disconnect() {}}, setTimeout, clearTimeout, console};
    vm.createContext(context); vm.runInContext(fs.readFileSync('dist/lesson-annotations.js', 'utf8'), context); vm.runInContext(fs.readFileSync('dist/lesson-presenter.js', 'utf8'), context);
    h.api = h.window.lessonPresenter; h.member = member; h.sent = [];
    h.state = {you: member, teacher, teacherPresenting: true, ended: false, localScreen: member.role === 'teacher' ? localScreen : null, camera: null};
    h.sync = () => h.api.sync(h.state); h.configure = extra => h.api.configure({send(packet, target) { const event = {sender: member, target, packet: plain(packet)}; h.sent.push(event); sent.push(event); queue.push(event); return Promise.resolve(true); }, startDeck: async () => { h.state.localScreen = {getVideoTracks: () => [{readyState: 'live'}]}; h.sync(); }, ...extra});
    h.configure(); clients.set(id, h); h.sync();
    h.toolbar = () => h.ids.get('screenStage').all().find(node => node.className === 'lesson-annotations-toolbar');
    h.svg = () => h.ids.get('lessonContent').children.find(node => node.tagName === 'svg');
    h.button = name => h.toolbar().children.find(node => node.getAttribute('aria-label') === name);
    h.draw = (length = 5) => { h.button('Caneta').click(); h.svg().fire('pointerdown'); for (let i = 1; i < length; i++) h.svg().fire('pointermove', {clientX: 100 + i * 3, clientY: 100 + i}); h.svg().fire('pointerup'); };
    h.objects = () => h.svg().children.map(node => ({id: node.getAttribute('data-annotation-id'), path: node.getAttribute('d')}));
    h.permission = value => { h.ids.get('lessonStudentNotes').checked = value; h.ids.get('lessonStudentNotes').onchange(); };
    return h;
  }
  function pump() { let n = 0; while (queue.length) { if (++n > 2000) throw Error('Message loop'); const message = queue.shift(); for (const [id, client] of clients) if (id !== message.sender.id && (!message.target || message.target === id)) client.api.receive(message.sender, plain(message.packet)); } }
  function close() { for (const client of clients.values()) client.api.destroy(); queue.length = 0; }
  return {client, pump, close, sent, queue, teacher, members};
}

test('student proposals pass through teacher and reach teacher, author and late join without duplicating points', () => {
  const n = network(), t = n.client(), s = n.client('student1'); n.pump();
  assert.equal(s.toolbar().hidden, false); s.draw(80); n.pump();
  assert.deepEqual(s.objects(), t.objects()); assert.equal(t.objects().length, 1); assert.ok(t.objects()[0].id.startsWith('student1:'));
  const initial = s.sent.find(event => event.packet.type === 'proposal'); assert.equal(initial.target, 'teacher1');
  assert.ok(n.sent.filter(event => event.packet.type === 'annotation').every(event => event.sender.id === 'teacher1'));
  const late = n.client('student2'); t.api.peerReady(late.member); n.pump(); assert.deepEqual(late.objects(), t.objects());
  assert.ok(n.sent.every(event => JSON.stringify(event.packet).length < 7800)); n.close();
});

test('students can erase, clear and undo only their own annotations, including after teacher activity', () => {
  const n = network(), t = n.client(), s = n.client('student1'); n.pump(); s.draw(); n.pump(); t.draw(); n.pump();
  assert.equal(t.objects().length, 2); const teacherObject = s.svg().children.find(node => node.getAttribute('data-annotation-id').startsWith('teacher1:'));
  s.button('Apagar').click(); s.svg().fire('pointerdown', {target: teacherObject}); n.pump(); assert.equal(t.objects().length, 2);
  s.button('Limpar anotações desta página').click(); n.pump(); assert.equal(t.objects().length, 1); assert.ok(t.objects()[0].id.startsWith('teacher1:'));
  s.button('Desfazer última anotação').click(); n.pump(); assert.equal(t.objects().length, 2); assert.deepEqual(s.objects(), t.objects());
  t.button('Limpar anotações desta página').click(); n.pump(); assert.equal(t.objects().length, 0); assert.equal(s.objects().length, 0); n.close();
});

test('revocation turns tools off immediately and rejects delayed proposals from previous permission epochs', () => {
  const n = network(), t = n.client(), s = n.client('student1'); n.pump(); s.draw(); n.pump();
  const delayed = plain(s.sent.find(event => event.packet.type === 'proposal').packet); delayed.proposal = 500; delayed.data.object.id += '-delayed';
  s.button('Caneta').click(); s.svg().fire('pointerdown'); s.svg().fire('pointermove', {clientX: 200});
  n.pump(); t.permission(false); n.pump();
  assert.equal(s.toolbar().hidden, true); assert.equal(s.svg().getAttribute('data-editing'), 'false');
  assert.equal(t.api.receive(s.member, delayed), false);
  t.permission(true); n.pump(); assert.equal(s.toolbar().hidden, false); assert.equal(t.api.receive(s.member, delayed), false);
  s.draw(); n.pump(); assert.deepEqual(s.objects(), t.objects()); n.close();
});

test('teacher rejects spoofed identities, malformed packets, arbitrary clearing and replayed append offsets', () => {
  const n = network(), t = n.client(), s = n.client('student1'); n.pump(); s.draw(25); n.pump(); t.draw(); n.pump();
  const base = plain(s.sent.find(event => event.packet.type === 'proposal').packet), bad = extra => ({...plain(base), proposal: 1000, ...extra});
  const teacherId = t.objects().find(object => object.id.startsWith('teacher1:')).id;
  const invalid = [bad({page: 'wrong'}), bad({epoch: 'old'}), bad({data: {...base.data, type: 'clear'}}), bad({data: {...base.data, type: 'remove', id: teacherId}}), bad({data: {...base.data, object: {...base.data.object, owner: 'teacher1'}}}), bad({data: {...base.data, object: {...base.data.object, points: [[-1, 0]]}}})];
  for (const packet of invalid) assert.equal(t.api.receive(s.member, packet), false);
  const append = plain(s.sent.find(event => event.packet.data?.type === 'append').packet); append.proposal = 1001;
  assert.equal(t.api.receive(s.member, append), false); assert.equal(t.objects().length, 2);
  assert.equal(s.api.receive(s.member, {v: 1, type: 'state'}), false);
  assert.equal(s.api.receive({id: 'other-teacher', role: 'teacher', status: 'accepted'}, {v: 1, type: 'state'}), false);
  n.pump(); assert.deepEqual(s.objects(), t.objects()); n.close();
});

test('page changes produce authoritative snapshots, reject old-page proposals and restore drawings on returning', async () => {
  const n = network(), t = n.client(), s = n.client('student1'); n.pump();
  t.ids.get('lessonFile').files = [{}]; await t.ids.get('lessonFile').onchange(); n.pump(); s.draw(); n.pump();
  const old = plain(s.sent.filter(event => event.packet.type === 'proposal').at(-1).packet); old.proposal += 100;
  await t.ids.get('lessonNext').onclick(); n.pump(); assert.equal(s.objects().length, 0); assert.equal(t.api.receive(s.member, old), false);
  const late = n.client('student2'); t.api.peerReady(late.member); n.pump();
  await t.ids.get('lessonPrevious').onclick(); n.pump(); assert.equal(late.objects().length, 1); assert.deepEqual(late.objects(), t.objects()); assert.equal(t.api.receive(s.member, old), false); n.close();
});

test('manual task draft uses durable chat hook, keeps failed drafts, and is unavailable to students', async () => {
  const n = network(), t = n.client(), s = n.client('student1'); n.pump();
  assert.equal(t.ids.get('lessonNotes').hidden, false); assert.equal(s.ids.get('lessonNotes').hidden, true);
  const posted = []; t.configure({postNote: async text => posted.push(text)});
  t.ids.get('lessonTaskDraft').value = '复习今天的内容。\nPraticar a apresentação.'; await t.ids.get('lessonSendTask').onclick();
  assert.equal(posted.length, 1); assert.match(posted[0], /^Resumo e tarefas\n\n复习/); assert.equal(t.ids.get('lessonTaskDraft').value, '');
  t.configure({postNote: async () => { throw Error('offline'); }}); t.ids.get('lessonTaskDraft').value = 'Rascunho mantido'; await t.ids.get('lessonSendTask').onclick(); assert.equal(t.ids.get('lessonTaskDraft').value, 'Rascunho mantido');
  const before = posted.length; s.ids.get('lessonTaskDraft').value = 'Spoof'; await s.ids.get('lessonSendTask').onclick(); assert.equal(posted.length, before); n.close();
});

test('at most five student identities can propose annotations in one active permission epoch', () => {
  const n = network(), t = n.client();
  for (let index = 1; index <= 6; index++) { const student = n.client('student' + index); t.api.peerReady(student.member); n.pump(); student.draw(); n.pump(); }
  assert.equal(t.objects().length, 5); assert.ok(t.objects().every(object => !object.id.startsWith('student6:'))); n.close();
});
