(() => {
 // Conservative metalinguistic cues: quote one explicitly named word, never infer a whole phrase.
 const word = '[\\p{L}\\p{M}]+(?:[-’\'][\\p{L}\\p{M}]+)*';
 const cue = new RegExp('(^|[^\\p{L}\\p{M}])((?:a|essa|esta)\\s+palavra\\s+)(' + word + ')(?=\\s*[,;:]?\\s+(?:tem|possui|significa|quer\\s+dizer|se\\s+escreve|é|começa|termina)(?![\\p{L}\\p{M}\\p{N}_]))', 'giu');
 function format(text, language = 'pt') {
  if (!String(language).toLowerCase().startsWith('pt')) return text;
  return text.replace(cue, (_, before, prefix, term) => before + prefix + '“' + term + '”');
 }
 window.educationalQuotes = { format };
})();
