// files.js: 문서에 붙인 원본 파일(PDF·한글·엑셀) 다루기. 브라우저 저장소(IndexedDB)에 보관, 글자 뽑기(검색용), PDF 화면 보기.
(function () {
  /* ── 보관: 시연 모드에서는 이 브라우저의 IndexedDB ── */
  const DB = 'gil-files', STORE = 'files';
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function put(id, blob) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(blob, id); t.oncomplete = () => res(id); t.onerror = () => rej(t.error); }); }
  async function get(id) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(id); t.onsuccess = () => res(t.result || null); t.onerror = () => rej(t.error); }); }
  async function clear() { try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch (e) { } }

  const typeOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name || ''); const e = m ? m[1].toLowerCase() : ''; return ['pdf', 'hwp', 'hwpx', 'xlsx'].includes(e) ? e : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e) ? 'img' : e === 'xls' ? 'xls' : (e === 'html' || e === 'htm') ? 'html' : 'etc'; };

  /* ── pdf.js 불러오기 (필요할 때만) ── */
  const PDFJS = new URL('vendor/pdfjs/', location.href).href;
  let pdfjsP = null;
  function pdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsP) pdfjsP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = () => rej(new Error('PDF 보기 도구를 불러오지 못했어요'));
      document.head.appendChild(s);
    });
    return pdfjsP;
  }
  // PDF 열기: 글꼴이 안 들어 있는 한글 PDF도 원본처럼 보이게 문자표(cmaps)·기본 글꼴(standard_fonts)을 함께 준다
  function openPdf(lib, src) {
    const o = { cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/' };
    if (location.protocol === 'file:') { o.CMapReaderFactory = FileCMaps; o.StandardFontDataFactory = FileFonts; }
    return lib.getDocument(Object.assign(o, src)).promise;
  }
  // 파일로 연 화면(file://)은 브라우저가 cmaps 등 파일 읽기를 막는다 → 같은 내용을 담은 pdf.assets.js 로 읽는다 (필요할 때 한 번만)
  let assetsP = null;
  function pdfAsset(path) {
    if (!assetsP) assetsP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/pdfjs/pdf.assets.js';
      s.onload = () => res(window.PDFJS_ASSETS || {}); s.onerror = () => { assetsP = null; rej(new Error('PDF 글꼴 자료를 불러오지 못했어요')); };
      document.head.appendChild(s);
    });
    return assetsP.then((A) => { if (!A[path]) throw new Error('PDF 글꼴 자료 없음: ' + path); return Uint8Array.from(atob(A[path]), (c) => c.charCodeAt(0)); });
  }
  class FileCMaps { fetch({ name }) { return pdfAsset('cmaps/' + name + '.bcmap').then((cMapData) => ({ cMapData, compressionType: window.pdfjsLib.CMapCompressionType.BINARY })); } }
  class FileFonts { fetch({ filename }) { return pdfAsset('standard_fonts/' + filename); } }

  /* ── 글자 뽑기 (검색용) ── */
  async function extractText(name, bytes) {
    const t = typeOf(name);
    try {
      if (t === 'pdf') {
        const lib = await pdfjs(); const doc = await openPdf(lib, { data: new Uint8Array(bytes.slice(0)) });
        try {
          const pages = [];
          for (let i = 1; i <= doc.numPages; i++) { const c = await (await doc.getPage(i)).getTextContent(); pages.push(c.items.map((x) => x.str).join(' ')); }
          return pages.map((p, i) => `[${i + 1}쪽] ${p}`).join('\n');
        } finally { doc.destroy(); }
      }
      if (t === 'hwpx' || t === 'xlsx') {
        const files = await HwpxEditor._unzip(new Uint8Array(bytes));
        const dec = new TextDecoder(); let s = '';
        files.filter((f) => (t === 'hwpx' ? /Contents\/section\d+\.xml$/ : /sharedStrings\.xml$|worksheets\/sheet\d+\.xml$/).test(f.name))
          .forEach((f) => { s += ' ' + (dec.decode(f.data).match(/<(?:hp:t|t)(?:\s[^>]*)?>([^<]*)</g) || []).map((x) => x.replace(/^<[^>]+>/, '').replace(/<$/, '')).join(' '); });
        return s.replace(/\s+/g, ' ').trim();
      }
    } catch (e) { console.warn('글자 뽑기 실패', e); }
    return '';
  }

  /* ── PDF 화면 보기: 쪽마다 그림으로, 보이는 쪽만 그린다 ── */
  let lastDoc = null;
  async function pdfView(host, bytesOrUrl, opts) {
    opts = opts || {};
    const lib = await pdfjs();
    // 바이트는 복사해서 넘긴다 (pdf.js가 넘겨받은 버퍼를 비워서 '파일 받기'가 빈 파일이 되지 않게)
    const src = typeof bytesOrUrl === 'string' ? { url: bytesOrUrl } : { data: new Uint8Array(bytesOrUrl.slice(0)) };
    const doc = await openPdf(lib, src);
    if (lastDoc) lastDoc.destroy(); lastDoc = doc; // 앞서 연 PDF는 정리
    const outline = await doc.getOutline().catch(() => null); // 책갈피(목차)
    const hasToc = !!(outline && outline.length);
    host.style.position = 'relative';
    host.innerHTML = `<div class="pv-bar">
      <button type="button" class="btn sm ghost" data-a="prev" aria-label="이전 쪽">‹</button>
      <label class="pv-page"><input class="input" id="pvNum" inputmode="numeric" value="${opts.page || 1}" aria-label="쪽"> / ${doc.numPages}쪽</label>
      <button type="button" class="btn sm ghost" data-a="next" aria-label="다음 쪽">›</button>
      ${hasToc ? '<button type="button" class="btn sm ghost" id="pvTocBtn" aria-expanded="false" aria-controls="pvToc">목차</button>' : ''}
      <form class="pv-find" role="search"><label class="sr-only" for="pvFind">이 문서에서 찾기</label><input class="input" id="pvFind" placeholder="이 문서에서 찾기" autocomplete="off" enterkeyhint="search"><span class="pv-cnt" id="pvCnt" aria-live="polite"></span><button type="button" class="btn sm ghost" data-f="prev" aria-label="이전 찾은 곳">▲</button><button type="submit" class="btn sm ghost" aria-label="다음 찾은 곳">▼</button></form>
      <span class="pv-hits" id="pvHits"></span>
    </div>${hasToc ? '<nav class="pv-toc" id="pvToc" aria-label="PDF 목차" hidden></nav>' : ''}<div class="pv-pages" id="pvPages">${Array.from({ length: doc.numPages }, (_, i) => `<div class="pv-pg" data-p="${i + 1}"><span class="pv-no">${i + 1}</span></div>`).join('')}</div>`;
    const wrap = host.querySelector('#pvPages');
    const pages = Array.from(wrap.children);
    const done = new Set();
    // 쪽마다 크기·회전이 다를 수 있어 쪽별 비율을 미리 잰다 (가로 쪽, /Rotate 쪽도 원본 비율 그대로)
    const ratios = await Promise.all(pages.map((_, i) => doc.getPage(i + 1).then((p) => { const v = p.getViewport({ scale: 1 }); return v.height / v.width; })));
    const layout = () => { const w = Math.min(wrap.clientWidth - 24, 900); pages.forEach((p, i) => { p.style.width = w + 'px'; p.style.height = Math.round(w * ratios[i]) + 'px'; }); return w; };
    let width = layout(), dpr = window.devicePixelRatio || 1;
    const MAX_PX = 16777216; // 캔버스 한 장 최대 픽셀 (넘으면 브라우저가 못 그림)
    let gen = 0; // 크기가 바뀌면 1 늘려서, 그 전에 시작한 그리기 결과는 버린다
    async function draw(n) {
      if (done.has(n)) return; done.add(n);
      const g = gen;
      try {
        const page = await doc.getPage(n);
        addLinks(n, page).catch((e) => console.warn('PDF 링크 읽기 실패', n, e));
        const css = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        const k = Math.min(dpr, Math.sqrt(MAX_PX / (css.width * css.height))); // 고해상도 화면은 픽셀을 늘려 글자를 또렷하게
        const vp = page.getViewport({ scale: css.scale * k });
        const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        c.style.cssText = 'display:block;width:100%;height:100%';
        // 주석·양식 칸은 PDF에 든 외관(appearance) 그대로 그림에 함께 그린다
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp, annotationMode: lib.AnnotationMode.ENABLE }).promise;
        if (g !== gen) return;
        pages[n - 1].querySelectorAll('canvas').forEach((x) => x.remove()); pages[n - 1].appendChild(c);
      } catch (e) { if (g === gen) done.delete(n); console.warn('PDF 쪽 그리기 실패', n, e); }
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) draw(+e.target.dataset.p); }), { root: wrap, rootMargin: '600px 0px' });
    pages.forEach((p) => io.observe(p));
    const num = host.querySelector('#pvNum');
    // 쪽 이동은 PDF 칸 안에서만 (바깥 화면은 움직이지 않게)
    const go = (n) => { n = Math.max(1, Math.min(doc.numPages, n)); num.value = n; wrap.scrollTop = pages[n - 1].offsetTop - wrap.offsetTop - 12; draw(n); };
    wrap.addEventListener('scroll', () => { const top = wrap.scrollTop + pages[0].offsetTop + 40; let i = 0; while (i + 1 < pages.length && pages[i + 1].offsetTop <= top) i++; num.value = i + 1; }, { passive: true });

    /* ── 링크·목차: 문서 안 이동과 바깥 주소 ── */
    const smooth = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    // 목적지(이름 또는 [쪽, 방식, ...]) → { n: 쪽 번호, y: 쪽 위에서 몇 %(0~1, 없으면 null) }
    async function resolveDest(dest) {
      try {
        if (typeof dest === 'string') dest = await doc.getDestination(dest);
        if (!Array.isArray(dest) || !dest.length) return null;
        const i = Number.isInteger(dest[0]) ? dest[0] : await doc.getPageIndex(dest[0]);
        if (!(i >= 0 && i < doc.numPages)) return null;
        const mode = dest[1] && dest[1].name; let x = 0, top = null;
        if (mode === 'XYZ') { x = dest[2]; top = dest[3]; } else if (mode === 'FitH' || mode === 'FitBH') top = dest[2]; else if (mode === 'FitR') { x = dest[2]; top = dest[5]; }
        let y = null;
        if (typeof top === 'number') { const v = (await doc.getPage(i + 1)).getViewport({ scale: 1 }); y = Math.max(0, Math.min(1, v.convertToViewportPoint(x || 0, top)[1] / v.height)); }
        return { n: i + 1, y };
      } catch (e) { return null; }
    }
    const cur = () => +num.value || 1;
    const NAV = { NextPage: () => ({ n: Math.min(doc.numPages, cur() + 1) }), PrevPage: () => ({ n: Math.max(1, cur() - 1) }), FirstPage: () => ({ n: 1 }), LastPage: () => ({ n: doc.numPages }) };
    const jump = (t) => {
      if (!t) return; const p = pages[t.n - 1];
      const top = p.offsetTop - wrap.offsetTop - 12 + (t.y != null ? t.y * p.offsetHeight : 0), far = wrap.clientHeight * 2;
      // 먼 곳은 바로 근처로 옮긴 뒤 마지막 한 화면만 부드럽게 (긴 문서에서 오래 걸리지 않게)
      if (smooth && Math.abs(top - wrap.scrollTop) > far) wrap.scrollTop = top - Math.sign(top - wrap.scrollTop) * wrap.clientHeight;
      wrap.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
      num.value = t.n; draw(t.n);
    };
    // 바깥 주소는 http·https·mailto 만 연다
    const safeUrl = (u) => { try { const x = new URL(u); return /^(https?|mailto):$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };
    // 쪽 위에 링크 칸을 % 위치로 덮는다 (다시 그리거나 크기가 바뀌어도 그대로 맞음)
    const linked = new Set();
    async function addLinks(n, page) {
      if (linked.has(n)) return; linked.add(n);
      const anns = (await page.getAnnotations({ intent: 'display' })).filter((a) => a.subtype === 'Link');
      if (!anns.length) return;
      const v = page.getViewport({ scale: 1 }), box = document.createElement('div'); box.className = 'pv-links';
      for (const a of anns) {
        const r = v.convertToViewportRectangle(a.rect);
        const x = Math.min(r[0], r[2]), y = Math.min(r[1], r[3]), w = Math.abs(r[2] - r[0]), h = Math.abs(r[3] - r[1]);
        if (w < 1 || h < 1) continue;
        const el = document.createElement('a');
        el.style.cssText = `left:${(x / v.width) * 100}%;top:${(y / v.height) * 100}%;width:${(w / v.width) * 100}%;height:${(h / v.height) * 100}%`;
        const url = safeUrl(a.url || a.unsafeUrl);
        if (url) {
          el.href = url; el.target = '_blank'; el.rel = 'noopener noreferrer'; el.title = url;
          el.setAttribute('aria-label', url.startsWith('mailto:') ? '메일 쓰기: ' + url.slice(7) : '새 창에서 열기: ' + url);
        } else if (a.dest || NAV[a.action]) {
          const t = a.dest ? resolveDest(a.dest) : null;
          el.href = '#'; el.setAttribute('aria-label', '문서 안 다른 곳으로 이동');
          if (t) t.then((d) => { if (d) { el.setAttribute('aria-label', d.n + '쪽으로 이동'); el.title = d.n + '쪽으로'; } });
          el.addEventListener('click', async (e) => { e.preventDefault(); jump(t ? await t : NAV[a.action]()); });
        } else continue;
        box.appendChild(el);
      }
      if (box.children.length) pages[n - 1].appendChild(box);
    }
    // 목차: 단추를 누르면 펼쳐지는 칸 (휴대폰에서는 가로 꽉 차게)
    if (hasToc) {
      const btn = host.querySelector('#pvTocBtn'), panel = host.querySelector('#pvToc'), bar = host.querySelector('.pv-bar');
      const setOpen = (on) => {
        panel.hidden = !on; btn.setAttribute('aria-expanded', on);
        if (on) { const top = bar.offsetHeight + 4; panel.style.top = top + 'px'; panel.style.maxHeight = Math.max(160, host.clientHeight - top - 8) + 'px'; (panel.querySelector('.pv-toc-item:not(:disabled)') || btn).focus(); }
      };
      const list = (items, depth) => {
        const ul = document.createElement('ul');
        for (const it of items) {
          const li = document.createElement('li'), row = document.createElement('div'); row.className = 'pv-toc-row';
          const kids = it.items && it.items.length ? list(it.items, depth + 1) : null;
          const b = document.createElement('button'); b.type = 'button'; b.className = 'pv-toc-item'; b.textContent = it.title || '(제목 없음)';
          let tog = null;
          if (kids) {
            // 처음엔 맨 위 단계와 '하나뿐인 묶음'만 펼쳐 둔다
            const open = depth === 0 || items.length === 1; kids.hidden = !open;
            tog = document.createElement('button'); tog.type = 'button'; tog.className = 'pv-toc-tog'; tog.textContent = '▸';
            tog.setAttribute('aria-expanded', open); tog.setAttribute('aria-label', (it.title || '') + ' 하위 목차');
            tog.onclick = () => { kids.hidden = !kids.hidden; tog.setAttribute('aria-expanded', !kids.hidden); };
          } else { tog = document.createElement('span'); tog.className = 'pv-toc-tog'; }
          const url = safeUrl(it.url || it.unsafeUrl);
          if (url || it.dest || NAV[it.action]) b.onclick = async () => { setOpen(false); if (url) window.open(url, '_blank', 'noopener,noreferrer'); else jump(it.dest ? await resolveDest(it.dest) : NAV[it.action]()); };
          else if (kids) b.onclick = () => tog.click(); else b.disabled = true;
          row.append(tog, b); li.appendChild(row); if (kids) li.appendChild(kids); ul.appendChild(li);
        }
        return ul;
      };
      panel.appendChild(list(outline, 0));
      btn.onclick = () => setOpen(panel.hidden);
      panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
      host.addEventListener('pointerdown', (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
    }

    host.querySelector('[data-a="prev"]').onclick = () => go(+num.value - 1);
    host.querySelector('[data-a="next"]').onclick = () => go(+num.value + 1);
    num.addEventListener('change', () => go(+num.value || 1));
    /* ── 이 문서에서 찾기: 띄어쓰기 상관없이 찾고, 찾은 곳을 노랗게 칠해 차례로 옮겨 다닌다 ── */
    // 쪽마다 글 조각과 위치(쪽 위 % 자리)를 한 번만 읽어 둔다
    const textOf = new Map();
    function pageText(n) {
      if (!textOf.has(n)) textOf.set(n, readText(n).catch(() => ({ s: '', parts: [] })));
      return textOf.get(n);
    }
    async function readText(n) {
      const page = await doc.getPage(n), v = page.getViewport({ scale: 1 });
      const items = (await page.getTextContent()).items.filter((x) => x.str);
      let s = ''; const parts = [];
      for (const it of items) {
        const c = it.str.replace(/\s+/g, ''); if (!c) continue;
        const h = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
        const r = v.convertToViewportRectangle([it.transform[4], it.transform[5] - h * 0.22, it.transform[4] + (it.width || h * c.length), it.transform[5] + h * 0.92]);
        parts.push({ a: s.length, b: s.length + c.length, x: Math.min(r[0], r[2]) / v.width, y: Math.min(r[1], r[3]) / v.height, w: Math.abs(r[2] - r[0]) / v.width, h: Math.abs(r[3] - r[1]) / v.height });
        s += c;
      }
      return { s: s.toLowerCase(), parts };
    }
    const findIn = host.querySelector('#pvFind'), cntEl = host.querySelector('#pvCnt');
    let hits = [], hi = -1, findGen = 0;
    const clearMarks = () => host.querySelectorAll('.pv-hl').forEach((x) => x.remove());
    // 찾은 곳 하나 → 쪽 위 칠할 상자들 (글 조각 안에서 글자 비율로 자른다)
    const boxesOf = (t, a, b) => t.parts.filter((p) => p.b > a && p.a < b).map((p) => { const L = p.b - p.a, s0 = (Math.max(a, p.a) - p.a) / L, s1 = (Math.min(b, p.b) - p.a) / L; return { x: p.x + p.w * s0, y: p.y, w: p.w * (s1 - s0), h: p.h }; });
    const paint = () => {
      clearMarks();
      hits.forEach((m, i) => m.boxes.forEach((r) => {
        const d = document.createElement('div'); d.className = 'pv-hl' + (i === hi ? ' on' : '');
        d.style.cssText = `left:${(r.x * 100).toFixed(3)}%;top:${(r.y * 100).toFixed(3)}%;width:${(r.w * 100).toFixed(3)}%;height:${(r.h * 100).toFixed(3)}%`;
        pages[m.n - 1].appendChild(d);
      }));
    };
    const show = (i) => {
      if (!hits.length) return;
      hi = (i + hits.length) % hits.length; const m = hits[hi];
      cntEl.textContent = `${hi + 1}/${hits.length}`;
      paint(); jump({ n: m.n, y: Math.max(0, m.boxes[0].y - 0.08) });
    };
    async function find(q, from) {
      const my = ++findGen;
      findIn.dataset.q = String(q || '');
      const raw = String(q || '').trim(); hits = []; hi = -1; clearMarks();
      if (!raw) { cntEl.textContent = ''; return; }
      cntEl.textContent = '찾는 중…';
      // 친 그대로 → 안 나오면 한/영 자판을 바꿔 친 경우도 (예: gkrtk → 학사)
      const tries = [raw].concat(window.Search && Search.variants ? Search.variants(raw).slice(1) : []).map((x) => x.replace(/\s+/g, '').toLowerCase()).filter((x, i, a) => x && !/^[ㄱ-ㅎ]+$/.test(x) && a.indexOf(x) === i);
      // 쪽 글은 여러 쪽씩 한꺼번에 읽고, 첫 곳을 찾으면 바로 보여 준 뒤 나머지를 센다
      let shown = false;
      for (const w of tries) {
        for (let n = 1; n <= doc.numPages; n += 8) {
          const batch = await Promise.all(Array.from({ length: Math.min(8, doc.numPages - n + 1) }, (_, j) => pageText(n + j)));
          if (my !== findGen) return;
          batch.forEach((t, j) => { let k = t.s.indexOf(w); while (k >= 0) { hits.push({ n: n + j, boxes: boxesOf(t, k, k + w.length) }); k = t.s.indexOf(w, k + w.length); } });
          if (!shown && hits.length && (!from || hits.some((m) => m.n >= from))) { shown = true; show(from ? Math.max(0, hits.findIndex((m) => m.n >= from)) : 0); }
          if (shown) cntEl.textContent = `${hi + 1}/${hits.length}…`;
        }
        if (hits.length) break;
      }
      if (!hits.length) { cntEl.textContent = '없음'; return; }
      if (!shown) show(0); else { cntEl.textContent = `${hi + 1}/${hits.length}`; paint(); }
    }
    // 열고 조금 뒤 쪽 글을 미리 읽어 둔다 (찾기가 바로 되게)
    setTimeout(async () => { for (let n = 1; n <= doc.numPages && host.isConnected; n += 4) { await Promise.all(Array.from({ length: Math.min(4, doc.numPages - n + 1) }, (_, j) => pageText(n + j))); } }, 2500);
    let ft = 0;
    findIn.addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => find(findIn.value), 350); });
    host.querySelector('.pv-find').addEventListener('submit', (e) => { e.preventDefault(); if (!hits.length || findIn.dataset.q !== findIn.value) { findIn.dataset.q = findIn.value; find(findIn.value); } else show(hi + 1); });
    host.querySelector('[data-f="prev"]').onclick = () => show(hi - 1);
    findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); show(hi - 1); } if (e.key === 'Escape') { findIn.value = ''; find(''); } });
    // 검색 결과에서 왔으면 그 낱말로 바로 찾는다 (규정집처럼 범위가 있으면 그 범위의 첫 곳부터)
    setTimeout(() => go(opts.page || 1), 50);
    if (opts.q) { findIn.value = opts.q; findIn.dataset.q = opts.q; setTimeout(() => find(opts.q, opts.from || opts.page), 300); }
    // 창 크기·화면 배율(확대)이 바뀌면 다시 그린다. 기존 그림은 새 그림이 나올 때까지 둔다
    const onResize = () => {
      if (!host.isConnected) { io.disconnect(); return window.removeEventListener('resize', onResize); }
      const w = layout(), d = window.devicePixelRatio || 1;
      if (Math.abs(w - width) > 40 || d !== dpr) { width = w; dpr = d; gen++; done.clear(); pages.forEach((p) => { io.unobserve(p); io.observe(p); }); }
    };
    window.addEventListener('resize', onResize);
    return { doc, go };
  }

  // 미리보기 그림용: 첫 쪽만 폭 w 로 그린 캔버스 (보던 PDF 는 건드리지 않는다)
  async function pdfFirstPage(bytes, w) {
    const lib = await pdfjs();
    const doc = await openPdf(lib, { data: new Uint8Array(bytes.slice(0)) });
    try {
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: w / page.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: x, viewport: vp, annotationMode: lib.AnnotationMode.ENABLE }).promise;
      return c;
    } finally { doc.destroy(); }
  }
  window.GilFiles = { put, get, clear, typeOf, extractText, pdfView, pdfjs, pdfFirstPage };
})();
