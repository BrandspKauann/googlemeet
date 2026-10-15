import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const environment = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('./dist/educational-quotes.js', import.meta.url), 'utf8'), environment);
const format = environment.window.educationalQuotes.format;
test('explicit Portuguese word references receive quotes without changing recognized words', () => {
 for (const [input, output] of [
  ['A palavra carro, tem quantas letras?', 'A palavra “carro”, tem quantas letras?'],
  ['Essa palavra coração significa o quê?', 'Essa palavra “coração” significa o quê?'],
  ['A palavra carro é um substantivo.', 'A palavra “carro” é um substantivo.'],
  ['A palavra guarda-chuva se escreve assim.', 'A palavra “guarda-chuva” se escreve assim.'],
  ['A palavra carro tem letras e a palavra casa começa com c.', 'A palavra “carro” tem letras e a palavra “casa” começa com c.'],
 ]) {
  assert.equal(format(input), output);
  assert.equal(format(output), output);
  assert.equal(output.replace(/[“”]/g, ''), input);
 }
});
test('ordinary speech, existing quotes, phrases and unsupported languages remain untouched', () => {
 for (const input of ['O carro tem quatro portas.', 'A palavra “carro” tem quantas letras?', 'A palavra "carro" tem quantas letras?', 'A palavra carro azul aparece aqui.', 'Vou falar uma palavra amanhã.', 'A palavra carro']) assert.equal(format(input), input);
 assert.equal(format('A palavra carro tem quantas letras?', 'en'), 'A palavra carro tem quantas letras?');
 assert.equal(format('A palavra carro tem quantas letras?', 'pt-BR'), 'A palavra “carro” tem quantas letras?');
});
