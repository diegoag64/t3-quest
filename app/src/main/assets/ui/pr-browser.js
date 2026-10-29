// Runs only inside the unprivileged GitHub WebView. No native interface or T3 credentials.
(() => {
  if (window.__t3QuestPrImages) return;
  window.__t3QuestPrImages = true;
  let viewer = null;
  const safeImage = value => {
    try { const url = new URL(value, location.href); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
    catch { return null; }
  };
  function dismiss() {
    if (!viewer) return;
    const old = viewer; viewer = null;
    old.observer?.disconnect(); old.host.remove(); document.documentElement.style.overflow = old.overflow;
    window.scrollTo(old.scrollX, old.scrollY);
    if (old.focus?.isConnected) old.focus.focus({ preventScroll: true });
  }
  function close() {
    if (!viewer) return;
    if (history.state?.t3QuestImage === viewer.id) history.back();
    else dismiss();
  }
  window.addEventListener('popstate', event => {
    if (!viewer) return;
    // This history entry belongs to the overlay, not GitHub's page router.
    dismiss(); event.stopImmediatePropagation();
  }, true);
  window.addEventListener('pagehide', dismiss);
  window.addEventListener('click', event => {
    const source = event.target.closest?.('.markdown-body img');
    if (!source || source.classList.contains('emoji') || source.closest('g-emoji') || source.naturalWidth < 64) return;
    const url = safeImage(source.currentSrc || source.src);
    if (!url) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (viewer) return;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host{color-scheme:dark}*{box-sizing:border-box}
      .viewer{position:absolute;inset:0;display:flex;flex-direction:column;background:#0c0c0c;color:#eee;font:15px system-ui,sans-serif}
      .bar{flex:none;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px;border-bottom:1px solid #303030}
      .title{flex:1;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      button{min-width:44px;min-height:44px;padding:0 14px;border:1px solid #444;border-radius:8px;background:#202020;color:#eee;font:inherit;cursor:pointer}
      button:focus-visible{outline:2px solid #51a2ff}button:disabled{opacity:.4}
      .stage{flex:1;min-height:0;min-width:0;overflow:auto;touch-action:none;overscroll-behavior:contain;cursor:grab}
      .stage.dragging{cursor:grabbing}.canvas{display:grid;place-items:center;min-width:100%;min-height:100%}
      img{display:block;max-width:none;max-height:none;user-select:none;-webkit-user-drag:none;pointer-events:none}
      .hint{padding:6px 12px;color:#aaa;font-size:12px;flex:none}.percent{min-width:46px;text-align:center}
    `;
    shadow.append(style);
    const root = document.createElement('section'); root.className = 'viewer'; root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'PR image viewer'); shadow.append(root);
    const bar = document.createElement('div'); bar.className = 'bar'; root.append(bar);
    const title = document.createElement('span'); title.className = 'title'; title.textContent = source.alt || 'PR image'; bar.append(title);
    function button(text, label, action) { const button = document.createElement('button'); button.textContent = text; button.setAttribute('aria-label', label); button.onclick = action; bar.append(button); return button; }
    let zoom = 1; let fit = 1;
    const minus = button('−', 'Zoom out', () => scale(zoom / 1.5));
    const percent = document.createElement('span'); percent.className = 'percent'; percent.setAttribute('aria-live', 'polite'); bar.append(percent);
    const plus = button('+', 'Zoom in', () => scale(zoom * 1.5));
    button('Fit', 'Fit image', () => { measureFit(); scale(fit, true); });
    button('100%', 'Actual image size', () => scale(1));
    const closeButton = button('Close', 'Close image', close);
    const stage = document.createElement('div'); stage.className = 'stage'; stage.tabIndex = 0; stage.setAttribute('aria-label', 'Pan image'); root.append(stage);
    const canvas = document.createElement('div'); canvas.className = 'canvas'; stage.append(canvas);
    const image = document.createElement('img'); image.alt = source.alt || 'PR image'; image.draggable = false; canvas.append(image);
    const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Loading image…'; root.append(hint);
    function measureFit() { fit = Math.min(1, (stage.clientWidth - 24) / image.naturalWidth, (stage.clientHeight - 24) / image.naturalHeight); fit = Math.max(.01, fit); }
    function scale(value, center = false) {
      if (!image.naturalWidth) return;
      const oldWidth = canvas.offsetWidth, oldHeight = canvas.offsetHeight;
      const x = (stage.scrollLeft + stage.clientWidth / 2) / oldWidth;
      const y = (stage.scrollTop + stage.clientHeight / 2) / oldHeight;
      zoom = Math.max(Math.min(fit, .1), Math.min(8, value));
      const width = Math.round(image.naturalWidth * zoom), height = Math.round(image.naturalHeight * zoom);
      image.style.width = width + 'px'; image.style.height = height + 'px';
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      stage.scrollLeft = (center ? .5 : x) * canvas.offsetWidth - stage.clientWidth / 2;
      stage.scrollTop = (center ? .5 : y) * canvas.offsetHeight - stage.clientHeight / 2;
      percent.textContent = Math.round(zoom * 100) + '%'; minus.disabled = zoom <= Math.min(fit, .1); plus.disabled = zoom >= 8;
    }
    let drag;
    stage.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
      stage.setPointerCapture(event.pointerId); stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', event => {
      if (!drag) return;
      stage.scrollLeft = drag.left + drag.x - event.clientX; stage.scrollTop = drag.top + drag.y - event.clientY;
    });
    const endDrag = () => { drag = null; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag); stage.addEventListener('lostpointercapture', endDrag);
    root.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); scale(zoom * 1.5); }
      if (event.key === '-') { event.preventDefault(); scale(zoom / 1.5); }
      if (event.key === 'Tab') {
        const controls = [...shadow.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
        const next = (controls.indexOf(shadow.activeElement) + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        event.preventDefault(); controls[next].focus();
      }
    });
    const id = Date.now() + '-' + Math.random().toString(36).slice(2);
    viewer = { host, id, scrollX, scrollY, focus: document.activeElement, overflow: document.documentElement.style.overflow };
    history.pushState({ ...history.state, t3QuestImage: id }, '', location.href);
    document.documentElement.append(host); document.documentElement.style.overflow = 'hidden';
    image.onload = () => { measureFit(); scale(fit, true); hint.textContent = 'Use + to enlarge. Drag to pan. Close or Back returns to the PR.'; };
    image.onerror = () => { hint.textContent = 'Image could not load. Close to return to the PR and retry.'; };
    const observer = new ResizeObserver(() => { if (image.naturalWidth) { const wasFit = Math.abs(zoom - fit) < .001; measureFit(); if (wasFit) scale(fit, true); } });
    observer.observe(stage);
    viewer.observer = observer;
    image.src = url; closeButton.focus({ preventScroll: true });
  }, true);
})();
