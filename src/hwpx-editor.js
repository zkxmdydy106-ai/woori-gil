// hwpx-editor.js: 학교 한글 양식(.hwpx)을 화면에 원래 표 모양으로 그리고, 칸을 바로 고친 뒤 인쇄하거나 고친 내용이 들어간 .hwpx 로 저장한다.
// 외부 라이브러리 없이 동작: zip 풀기는 브라우저 기본 기능(DecompressionStream), 저장은 압축하지 않는 zip 으로 만든다.
(function () {
  const HPNS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
  const CHECKS = /[□▢■☐☑▣]/g;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── zip 읽기·쓰기 ── */
  const b64ToBytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function unzip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = bytes.length - 22;
    while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = [];
    const dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lxlen;
      const raw = bytes.subarray(start, start + csize);
      files.push({ name, data: method === 0 ? raw.slice() : await inflateRaw(raw) });
      p += 46 + nlen + xlen + clen;
    }
    return files;
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zipStored(files) {
    const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + size;
    }
    const csize = central.reduce((s, u) => s + u.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/hwp+zip' });
  }

  /* ── 화면에 그리기 ── */
  function textHtml(text) {
    return esc(text).replace(/\t/g, '    ').replace(CHECKS, (c) => `<span class="ck" contenteditable="false" data-o="${c}">${c}</span>`).replace(/\n/g, '<br>');
  }
  function pHtml(b) {
    const st = [`text-align:${b.align === 'distribute' ? 'justify' : b.align}`, `font-size:${(b.size * 1.333).toFixed(1)}px`];
    if (b.bold) st.push('font-weight:700');
    if (b.left) st.push(`padding-left:${b.left.toFixed(1)}px`);
    if (b.color && b.color !== '#000000') st.push(`color:${b.color}`);
    return `<div class="hp${b.serif ? ' serif' : ''}" contenteditable="true" spellcheck="false" data-pi="${b.pi}" style="${st.join(';')}">${textHtml(b.text) || '<br>'}</div>`;
  }
  function blocksHtml(blocks) { return blocks.map((b) => (b.t === 'tbl' ? tblHtml(b) : pHtml(b))).join(''); }
  function tblHtml(t) {
    const cols = t.cols.map((w) => w.toFixed(1) + 'px').join(' ');
    const rows = t.rows.map((h) => `minmax(${Math.max(14, h).toFixed(1)}px,auto)`).join(' ');
    const cells = t.cells.map((c) => {
      const bw = (n) => (n ? (n >= 2 ? '2px' : '1px') + ' solid #111' : '0');
      const st = [`grid-column:${c.c + 1}/span ${c.cs}`, `grid-row:${c.r + 1}/span ${c.rs}`, `border-left:${bw(c.b.l)}`, `border-right:${bw(c.b.r)}`, `border-top:${bw(c.b.t)}`, `border-bottom:${bw(c.b.b)}`,
        `justify-content:${c.va === 'top' ? 'flex-start' : c.va === 'bottom' ? 'flex-end' : 'center'}`];
      if (c.fill) st.push(`background:${c.fill}`);
      return `<div class="htc" style="${st.join(';')}">${blocksHtml(c.body)}</div>`;
    }).join('');
    return `<div class="htbl" style="grid-template-columns:${cols};grid-template-rows:${rows}">${cells}</div>`;
  }
  function render(host, tpl) {
    const pg = tpl.page;
    host.innerHTML = `<div class="hwpx-scale"><div class="hwpx-page" style="width:${pg.w}px;min-height:${pg.h}px;padding:${pg.mt}px ${pg.mr}px ${pg.mb}px ${pg.ml}px">${blocksHtml(tpl.blocks)}</div></div>`;
    const scale = host.querySelector('.hwpx-scale'), page = host.querySelector('.hwpx-page');
    const fit = () => { const w = host.clientWidth; const z = Math.min(1, (w - 2) / pg.w); scale.style.zoom = z; };
    fit();
    // 체크 칸 누르면 ■ ↔ □
    page.addEventListener('click', (e) => {
      const ck = e.target.closest('.ck'); if (!ck) return;
      ck.textContent = ck.textContent === '■' ? ck.dataset.o === '■' ? '□' : ck.dataset.o : '■';
      ck.classList.toggle('on', ck.textContent === '■');
    });
    // 붙여넣기는 글자만
    page.addEventListener('paste', (e) => {
      if (!e.target.closest('.hp')) return;
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, t);
    });
    return { fit, page };
  }

  // 화면 글자 → 문단 글자 (체크 칸 상태, 줄바꿈 포함)
  function textOf(el) {
    let s = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeName === 'BR') s += '\n';
      else if (n.classList && n.classList.contains('ck')) s += n.textContent;
      else { const inner = textOf(n); s += (n.nodeName === 'DIV' || n.nodeName === 'P') && s && !s.endsWith('\n') ? '\n' + inner : inner; }
    });
    return s;
  }
  function originals(tpl) {
    const map = {};
    const walk = (bs) => bs.forEach((b) => { if (b.t === 'p') map[b.pi] = b.text.replace(/\t/g, '    '); else b.cells.forEach((c) => walk(c.body)); });
    walk(tpl.blocks);
    return map;
  }
  function edits(page, tpl) {
    const orig = originals(tpl), out = {};
    page.querySelectorAll('.hp[data-pi]').forEach((el) => {
      const t = textOf(el).replace(/\n$/, '');
      if (t !== orig[el.dataset.pi]) out[el.dataset.pi] = t;
    });
    return out;
  }
  function reset(host, tpl) { return render(host, tpl); }

  /* ── 고친 내용이 들어간 .hwpx 만들기 ── */
  async function exportHwpx(tpl, changes) {
    const files = await unzip(b64ToBytes(tpl.zip));
    const sec = files.find((f) => f.name === 'Contents/section0.xml');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(sec.data), 'application/xml');
    const ps = doc.getElementsByTagNameNS(HPNS, 'p');
    for (const [pi, text] of Object.entries(changes)) {
      const p = ps[+pi]; if (!p) continue;
      const runs = Array.from(p.children).filter((n) => n.localName === 'run');
      let ts = [];
      runs.forEach((r) => Array.from(r.children).forEach((n) => { if (n.localName === 't') ts.push(n); }));
      if (!ts.length) {
        let run = runs[runs.length - 1];
        if (!run) { run = doc.createElementNS(HPNS, 'hp:run'); run.setAttribute('charPrIDRef', '0'); p.insertBefore(run, p.firstChild); }
        const t = doc.createElementNS(HPNS, 'hp:t'); run.appendChild(t); ts = [t];
      }
      ts.forEach((t, i) => { while (t.firstChild) t.removeChild(t.firstChild); if (i) return; });
      text.split('\n').forEach((line, i) => {
        if (i) ts[0].appendChild(doc.createElementNS(HPNS, 'hp:lineBreak'));
        ts[0].appendChild(doc.createTextNode(line));
      });
      // 줄 배치 정보는 지워서 한글이 다시 계산하게 한다
      Array.from(p.children).filter((n) => n.localName === 'linesegarray').forEach((n) => p.removeChild(n));
    }
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + new XMLSerializer().serializeToString(doc.documentElement);
    sec.data = new TextEncoder().encode(xml);
    const mt = files.findIndex((f) => f.name === 'mimetype');
    if (mt > 0) files.unshift(files.splice(mt, 1)[0]);
    return zipStored(files);
  }

  window.HwpxEditor = { render, reset, edits, exportHwpx, _unzip: unzip, _zip: zipStored };
})();
