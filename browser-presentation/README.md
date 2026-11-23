# Apresentações dentro da aula

`dist/lesson-deck.js` mantém o arquivo somente na memória do navegador. O arquivo não é enviado a uma API nem armazenado no IndexedDB. A transmissão para os participantes usa o vídeo do canvas, integrado em `room.js`.

O renderizador pesado só é carregado após a escolha explícita de um arquivo. `scripts/build-lesson-deck.mjs` prepara esse renderizador e os recursos PDF no mesmo domínio do site, sem CDN em tempo de execução.

## API

```js
const deck = window.lessonDeck.create({
  canvas,
  onStatus: ({state, message}) => {},
  onPage: ({index, count, title, name, format, warning, width, height}) => {},
});
await deck.load(file); // ou File[] para imagens na ordem selecionada
await deck.next();
await deck.previous();
await deck.go(0); // índice começa em zero
await deck.close();
```

O canvas permanece em 1280 × 720 e centraliza o conteúdo mantendo a proporção, sem recortar slides 4:3 ou páginas verticais. `onPage` só é emitido depois que uma página atual foi desenhada. Importações ou renderizações superadas por outra operação não alteram a página. Fechar cancela a renderização e libera o documento PDF e referências ao arquivo.

Limites: 35 MB no total, até 100 imagens ou 200 páginas; PPTX limitado a 4.000 entradas e 160 MB descompactados, com limites menores para XML. Arquivos PPT legados, macros, SVG independente, PDFs protegidos por senha e conteúdos inválidos não são aceitos. Imagens importadas ficam limitadas a 32 megapixels. O SVG gerado pelo PPTX é sanitizado e decodificado como imagem isolada; nunca é injetado como HTML. Links externos e recursos remotos são descartados.

## Fidelidade e controles

PPTX usa [`@office-kit/pptx`](https://github.com/office-kit/pptx) 0.30.0 e [`@office-kit/pptx-preview`](https://github.com/office-kit/pptx/tree/main/packages/preview) 0.23.0, licença MIT. A renderização é estática e experimental: não executa animações, áudio, vídeos, macros nem controles do PowerPoint. SmartArt, formatos de imagem especiais e alguns gráficos podem mostrar marcadores ou diferenças. Um aviso orienta a conferir a prévia e usar PDF para preservar melhor o visual. Fontes não instaladas podem ser substituídas pelo navegador.

PDF usa [`pdfjs-dist`](https://github.com/mozilla/pdf.js) 6.5.438, licença Apache 2.0. A página é renderizada em canvas sem criar links, formulários ou executar scripts do documento. Recursos de CMap/fontes/WASM são servidos pelo próprio site.

Os botões controlam o arquivo aberto dentro do site. Um site não pode enviar teclas para um PowerPoint externo apenas por capturar a tela. O compartilhamento comum continua sendo o caminho para animações ou aplicativos externos.

## Verificações realizadas

- Testes automatizados de formatos, limites acumulados de tamanho e proporção.
- Chrome com PPTX sintético de duas páginas, texto em português/chinês, formas e cores; próximo/anterior e navegação rápida.
- Importação de PDF e sequência de imagens; substituição simultânea de arquivo e fechamento durante a importação.
- Inspeção visual das páginas rasterizadas e verificação de ausência de requisições a domínios externos durante os casos sintéticos.

Essas verificações não substituem a conferência de apresentações reais com fontes, gráficos e elementos específicos do professor.
