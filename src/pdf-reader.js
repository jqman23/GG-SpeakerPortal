const PDF_URL = '/2026speakerguide.pdf';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

export function bindPdfReader() {
  const reader = document.getElementById('speaker-guide-reader');
  if (!reader) return;
  const dialog = reader.querySelector('.pdf-reader-dialog');
  const stage = document.getElementById('pdf-stage');
  const canvas = document.getElementById('pdf-canvas');
  const pageWrap = document.getElementById('pdf-page-wrap');
  const linkLayer = document.getElementById('pdf-link-layer');
  const status = document.getElementById('pdf-reader-status');
  const pageInput = document.getElementById('pdf-page-number');
  const pageCount = document.getElementById('pdf-page-count');
  const pageJump = document.getElementById('pdf-page-jump');
  const prev = document.getElementById('pdf-prev');
  const next = document.getElementById('pdf-next');
  const zoomOut = document.getElementById('pdf-zoom-out');
  const zoomIn = document.getElementById('pdf-zoom-in');
  const zoomLabel = document.getElementById('pdf-zoom-label');
  let pdf, pageNumber = 1, zoom = 1, rendering = false, queuedPage = null;
  let lastFocus, pointerStart, resizeTimer;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('pdf-reader-error', isError);
    status.hidden = !message;
  }
  async function loadPdf() {
    if (pdf) return pdf;
    setStatus('Loading Speaker Guide…');
    try {
      const pdfjs = await import(PDFJS_URL);
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      pdf = await pdfjs.getDocument(PDF_URL).promise;
      pageCount.textContent = `of ${pdf.numPages}`;
      pageInput.max = String(pdf.numPages);
      return pdf;
    } catch (error) {
      console.error('Speaker Guide reader failed:', error);
      setStatus('The guide could not be displayed here. Download the PDF to continue.', true);
      throw error;
    }
  }
  async function renderPage(requestedPage = pageNumber) {
    if (!pdf || reader.hidden) return;
    const nextPage = Math.max(1, Math.min(pdf.numPages, Number(requestedPage) || 1));
    if (rendering) { queuedPage = nextPage; return; }
    rendering = true;
    pageNumber = nextPage;
    pageInput.value = String(pageNumber);
    pageJump.value = String(pageNumber);
    prev.disabled = pageNumber === 1;
    next.disabled = pageNumber === pdf.numPages;
    canvas.setAttribute('aria-label', `Speaker Guide page ${pageNumber} of ${pdf.numPages}`);
    setStatus(`Loading page ${pageNumber}…`);
    try {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(280, stage.clientWidth - 32);
      const fitScale = Math.min(1.8, availableWidth / base.width);
      const displayViewport = page.getViewport({ scale: fitScale * zoom });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = page.getViewport({ scale: fitScale * zoom * pixelRatio });
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${Math.floor(displayViewport.width)}px`;
      canvas.style.height = `${Math.floor(displayViewport.height)}px`;
      pageWrap.style.width = `${Math.floor(displayViewport.width)}px`;
      pageWrap.style.height = `${Math.floor(displayViewport.height)}px`;
      linkLayer.replaceChildren();
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: renderViewport }).promise;
      const annotations = await page.getAnnotations({ intent: 'display' });
      annotations.filter(annotation => annotation.subtype === 'Link').forEach(annotation => {
        const href = annotation.url || annotation.unsafeUrl;
        if (!/^(https?:|mailto:)/i.test(String(href || ''))) return;
        const [left, top, right, bottom] = displayViewport.convertToViewportRectangle(annotation.rect);
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'pdf-link-target';
        link.style.left = `${Math.min(left, right)}px`;
        link.style.top = `${Math.min(top, bottom)}px`;
        link.style.width = `${Math.abs(right - left)}px`;
        link.style.height = `${Math.abs(bottom - top)}px`;
        link.setAttribute('aria-label', annotation.contents || 'Open linked resource in a new tab');
        linkLayer.append(link);
      });
      setStatus('');
    } catch (error) {
      console.error('Speaker Guide page failed:', error);
      setStatus(`Page ${pageNumber} could not be displayed.`, true);
    } finally {
      rendering = false;
      if (queuedPage !== null) {
        const queued = queuedPage; queuedPage = null; renderPage(queued);
      }
    }
  }
  async function openReader(event) {
    event.preventDefault();
    lastFocus = event.currentTarget;
    reader.hidden = false;
    document.body.classList.add('pdf-reader-open');
    dialog.focus();
    try { await loadPdf(); await renderPage(pageNumber); } catch (_) {}
  }
  function closeReader() {
    reader.hidden = true;
    document.body.classList.remove('pdf-reader-open');
    lastFocus?.focus();
  }
  function changePage(delta) { if (pdf) renderPage(pageNumber + delta); }
  function changeZoom(delta) {
    zoom = Math.max(.7, Math.min(2, Math.round((zoom + delta) * 10) / 10));
    zoomLabel.textContent = zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= .7; zoomIn.disabled = zoom >= 2;
    renderPage(pageNumber);
  }
  document.querySelectorAll('[data-open-speaker-guide]').forEach(link => link.addEventListener('click', openReader));
  reader.querySelectorAll('[data-pdf-close]').forEach(button => button.addEventListener('click', closeReader));
  prev.addEventListener('click', () => changePage(-1));
  next.addEventListener('click', () => changePage(1));
  zoomOut.addEventListener('click', () => changeZoom(-.1));
  zoomIn.addEventListener('click', () => changeZoom(.1));
  pageInput.addEventListener('change', () => renderPage(pageInput.value));
  pageJump.addEventListener('change', () => renderPage(pageJump.value));
  stage.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY }; });
  stage.addEventListener('pointerup', event => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) changePage(dx < 0 ? 1 : -1);
  });
  reader.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeReader();
    if (event.key === 'ArrowLeft' && event.target !== pageInput) changePage(-1);
    if (event.key === 'ArrowRight' && event.target !== pageInput) changePage(1);
    if (event.key === 'Tab') {
      const focusable = [...reader.querySelectorAll('a, button:not(:disabled), input')].filter(el => !el.hidden);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('resize', () => {
    if (reader.hidden || !pdf) return;
    clearTimeout(resizeTimer); resizeTimer = setTimeout(() => renderPage(pageNumber), 180);
  });
}
