import {loadPresentation, getSlides, getSlideSize, getSlideTitle} from '@office-kit/pptx';
import {renderSlideToSvg} from '@office-kit/pptx-preview';
import {getDocument, GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';

const ROOT = '/lesson-runtime/v1/';
GlobalWorkerOptions.workerSrc = ROOT + 'pdf.worker.min.mjs';

export async function openPptx(bytes, limits) {
  const presentation = await loadPresentation(bytes, {limits});
  const slides = getSlides(presentation);
  const size = getSlideSize(presentation) || {width: 1280, height: 720};
  return {
    count: slides.length,
    width: size.cx ?? size.width ?? size.w,
    height: size.cy ?? size.height ?? size.h,
    render(index, measureText) {
      return {
        svg: renderSlideToSvg(presentation, slides[index], {
          textLayout: 'svg', measureText,
          resolveFamily: family => family || 'Arial',
          eastAsianFamily: 'Microsoft YaHei',
        }),
        title: getSlideTitle(slides[index]) || '',
      };
    },
  };
}

export function openPdf(bytes) {
  return getDocument({
    data: bytes,
    cMapUrl: ROOT + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: ROOT + 'standard_fonts/', wasmUrl: ROOT + 'wasm/',
    enableXfa: false, isEvalSupported: false, useSystemFonts: true,
    maxImageSize: 16_777_216, canvasMaxAreaInBytes: 33_554_432,
    stopAtErrors: true,
  });
}
