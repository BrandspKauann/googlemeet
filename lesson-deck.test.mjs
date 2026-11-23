import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {window: {}};
vm.runInNewContext(fs.readFileSync(new URL('./dist/lesson-deck.js', import.meta.url), 'utf8'), sandbox);
const deck = sandbox.window.lessonDeck;
const file = (name, size = 100) => ({name, size, arrayBuffer() {}});

test('presentation import validates local files, total bytes and formats before parsing', () => {
  assert.equal(deck.inspect(file('aula.pptx')).format, 'pptx');
  assert.equal(deck.inspect(file('aula.PDF')).format, 'pdf');
  assert.equal(deck.inspect([file('1.png'), file('2.jpg')]).format, 'image');
  assert.throws(() => deck.inspect(file('aula.ppt')), /PPT antigos/);
  assert.throws(() => deck.inspect(file('aula.svg')), /Use PPTX/);
  assert.throws(() => deck.inspect([file('a.pdf'), file('b.pdf')]), /vários arquivos/);
  assert.throws(() => deck.inspect(file('large.pdf', 36 * 1024 * 1024)), /35 MB/);
  assert.throws(() => deck.inspect([file('a.png', 20 * 1024 * 1024), file('b.png', 20 * 1024 * 1024)]), /35 MB/);
  assert.throws(() => deck.inspect(Array.from({length: 101}, () => file('a.png'))), /100 imagens/);
});

test('slide fit preserves 4:3, widescreen and portrait without cropping', () => {
  const wide = deck.fit(1920, 1080);
  assert.equal(wide.width, 1280); assert.equal(wide.height, 720);
  const classic = deck.fit(1024, 768);
  assert.equal(classic.width, 960); assert.equal(classic.height, 720); assert.equal(classic.x, 160);
  const portrait = deck.fit(600, 800);
  assert.equal(portrait.width, 540); assert.equal(portrait.height, 720); assert.equal(portrait.x, 370);
  assert.throws(() => deck.fit(0, 1), /Dimensões/);
  assert.throws(() => deck.fit(Infinity, 1), /Dimensões/);
});
