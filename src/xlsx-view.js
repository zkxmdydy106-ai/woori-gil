// xlsx-view.js: 엑셀 양식(.xlsx)을 화면에 원래 서식대로 그리고, 칸을 고치면 수식을 다시 계산해 보여 준다. 그대로 인쇄하거나 고친 .xlsx 로 저장한다.
// 외부 라이브러리 없음. zip 은 HwpxEditor 의 도구를 함께 쓴다.
(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const parse = (bytes) => new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  const kids = (el, name) => (el ? Array.from(el.children).filter((n) => n.localName === name) : []);
  const kid = (el, name) => kids(el, name)[0] || null;
  const all = (el, name) => (el ? Array.from(el.getElementsByTagNameNS('*', name)) : []);
  const on = (el) => !!el && !/^(0|false)$/i.test(el.getAttribute('val') ?? '1');   // <b/>, <b val="0"/>
  const xtext = (s) => s.replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const pxs = (pt) => +(pt * 4 / 3).toFixed(2) + 'px';

  /* ── 주소 ── */
  const colNum = (s) => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const parseRef = (ref) => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref); return m ? { r: +m[2], c: colNum(m[1]) } : null; };
  function parseRange(s) {
    s = String(s).replace(/\$/g, '').replace(/^.*!/, '').toUpperCase();
    const [a, b] = s.split(':');
    if (/^[A-Z]+$/.test(a)) return { r1: 1, c1: colNum(a), r2: 1048576, c2: colNum(b || a) };   // 열 전체 (A:A)
    if (/^\d+$/.test(a)) return { r1: +a, c1: 1, r2: +(b || a), c2: 16384 };                   // 행 전체 (1:3)
    const p = parseRef(a), q = parseRef(b || a);
    if (!p || !q) return { r1: 1, c1: 1, r2: 1, c2: 1 };
    return { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) };
  }
  const inRg = (g, r, c) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;

  /* ── 색: 테마 색의 밝기(tint)는 엑셀처럼 HSL 밝기로 바꾼다 ── */
  function rgb2hsl(hex) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function hsl2hex(h, s, l) {
    const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    let r = l, g = l, b = l;
    if (s) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
    return [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function tint(hex, t) { if (!t) return hex; const [h, s, l] = rgb2hsl(hex); return hsl2hex(h, s, t < 0 ? l * (1 + t) : l * (1 - t) + t); }
  const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  function themeColors(doc) {
    const scheme = all(doc, 'clrScheme')[0]; const map = {};
    if (scheme) Array.from(scheme.children).forEach((el) => { const c = el.firstElementChild; if (c) map[el.localName] = (c.getAttribute('lastClr') || c.getAttribute('val') || '').toUpperCase(); });
    const def = { lt1: 'FFFFFF', dk1: '000000', lt2: 'E7E6E6', dk2: '44546A', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
    const out = THEME_ORDER.map((k) => map[k] || def[k]);
    out.scheme = Object.assign({}, def, map, { bg1: map.lt1 || 'FFFFFF', tx1: map.dk1 || '000000', bg2: map.lt2 || def.lt2, tx2: map.dk2 || def.dk2 });
    out.major = (all(doc, 'majorFont')[0] && (all(all(doc, 'majorFont')[0], 'font').find((f) => f.getAttribute('script') === 'Hang') || {}).getAttribute) ? all(all(doc, 'majorFont')[0], 'font').find((f) => f.getAttribute('script') === 'Hang').getAttribute('typeface') : '';
    return out;
  }
  const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
  function colorOf(el, C) {
    if (!el || el.getAttribute('auto') === '1') return null;
    let hex = null;
    const rgb = el.getAttribute('rgb'), th = el.getAttribute('theme'), ix = el.getAttribute('indexed');
    if (rgb) hex = rgb.slice(-6).toUpperCase();
    else if (th != null) hex = C.theme[+th];
    else if (ix != null) { const i = +ix; if (i >= 64) return null; hex = (C.indexed || INDEXED)[i]; }
    if (!hex) return null;
    return '#' + tint(hex, parseFloat(el.getAttribute('tint') || '0'));
  }
  // 도형 색(DrawingML): srgbClr / schemeClr + lumMod·lumOff 등
  function dmlColor(el, C) {
    const c = el && Array.from(el.children).find((n) => /Clr$/.test(n.localName));
    if (!c) return null;
    let hex = c.localName === 'srgbClr' ? c.getAttribute('val') : c.localName === 'sysClr' ? c.getAttribute('lastClr') || '000000' : c.localName === 'schemeClr' ? C.theme.scheme[c.getAttribute('val')] || (c.getAttribute('val') === 'phClr' ? C.ph : null) : c.localName === 'prstClr' ? ({ black: '000000', white: 'FFFFFF', red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00' }[c.getAttribute('val')] || '000000') : null;
    if (!hex) return null;
    let [h, s, l] = rgb2hsl(hex.toUpperCase()); let a = 1;
    Array.from(c.children).forEach((m) => {
      const v = +m.getAttribute('val') / 100000;
      if (m.localName === 'lumMod') l *= v; else if (m.localName === 'lumOff') l += v; else if (m.localName === 'alpha') a = v;
      else if (m.localName === 'shade') l *= v; else if (m.localName === 'tint') l = l * v + (1 - v);
    });
    hex = hsl2hex(h, s, Math.max(0, Math.min(1, l)));
    if (a < 1) { const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16)); return `rgba(${r},${g},${b},${+a.toFixed(3)})`; }
    return '#' + hex;
  }

  /* ── 날짜: 엑셀 1900 날짜 체계 (1900-02-29 버그 포함) ── */
  const DAY0 = Date.UTC(1899, 11, 30);
  function serialParts(n) {
    const d = Math.floor(n), w = ((d % 7) + 6) % 7;
    if (d === 60) return { y: 1900, m: 2, d: 29, w };
    if (d <= 0) return { y: 1900, m: 1, d: 0, w };
    const t = new Date(DAY0 + (d < 60 ? d + 1 : d) * 86400000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w };
  }
  const ymd = (y, m, d) => { if (y >= 0 && y < 1900) y += 1900; const n = Math.round((Date.UTC(y, m - 1, d) - DAY0) / 86400000); return n < 61 ? n - 1 : n; };
  const serialToDate = (n) => { const p = serialParts(n); return new Date(Date.UTC(p.y, p.m - 1, p.d)); };
  const dateToSerial = (d) => ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  function parseDate(t) {
    t = String(t).trim();
    const yNow = new Date().getFullYear();
    let m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\.?$/.exec(t) || /^(\d{4})(\d{2})(\d{2})$/.exec(t);
    let y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/.exec(t))) { y = 2000 + +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\.?$/.exec(t))) { y = yNow; mo = +m[1]; d = +m[2]; }
    else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return ymd(y, mo, d);
  }
  function parseTime(t) {
    const m = /^(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?\s*(AM|PM|오전|오후)?$/i.exec(String(t).trim());
    if (!m) return null;
    let h = +m[2]; const ap = (m[1] || m[5] || '').toUpperCase();
    if (ap === 'PM' || ap === '오후') { if (h < 12) h += 12; } else if ((ap === 'AM' || ap === '오전') && h === 12) h = 0;
    return (h * 3600 + +m[3] * 60 + (m[4] ? +m[4] : 0)) / 86400;
  }

  /* ── 표시 형식 ── */
  const BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 5: '"₩"#,##0;\\-"₩"#,##0', 6: '"₩"#,##0;[Red]\\-"₩"#,##0', 7: '"₩"#,##0.00;\\-"₩"#,##0.00', 8: '"₩"#,##0.00;[Red]\\-"₩"#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm', 27: 'yyyy"年" mm"月" dd"日"', 28: 'mm-dd', 29: 'mm-dd', 30: 'mm-dd-yy', 31: 'yyyy"년" mm"월" dd"일"', 32: 'h"시" mm"분"', 33: 'h"시" mm"분" ss"초"', 34: 'yyyy-mm-dd', 35: 'yyyy-mm-dd', 36: 'yyyy"年" mm"月" dd"日"', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 41: '_-* #,##0_-;-* #,##0_-;_-* "-"_-;_-@_-', 42: '_-"₩"* #,##0_-;-"₩"* #,##0_-;_-"₩"* "-"_-;_-@_-', 43: '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-', 44: '_-"₩"* #,##0.00_-;-"₩"* #,##0.00_-;_-"₩"* "-"??_-;_-@_-', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@', 50: 'yyyy"年" mm"月" dd"日"', 51: 'mm-dd', 52: 'yyyy-mm-dd', 53: 'yyyy-mm-dd', 54: 'mm-dd', 55: 'yyyy-mm-dd', 56: 'yyyy-mm-dd', 57: 'yyyy"年" mm"月" dd"日"', 58: 'mm-dd' };
  const NCOL = { black: '#000000', blue: '#0000FF', cyan: '#00FFFF', green: '#00FF00', magenta: '#FF00FF', red: '#FF0000', white: '#FFFFFF', yellow: '#FFFF00' };
  const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad2 = (n) => String(n).padStart(2, '0');
  // 15자리 유효숫자로 반올림한 뒤 소수 dec 자리 문자열 [정수부, 소수부]
  function roundStr(x, dec) {
    const p = Math.pow(10, dec);
    let r = Math.round(Number((x * p).toPrecision(15)));
    let s = r >= 1e21 ? x.toFixed(dec).replace('.', '') : String(r);
    s = s.padStart(dec + 1, '0');
    return [s.slice(0, s.length - dec), s.slice(s.length - dec)];
  }
  // 일반 형식: 11자 안에서 가장 정확하게 (엑셀과 같은 규칙)
  function genStr(v) {
    if (!isFinite(v)) return '#NUM!';
    if (v === 0) return '0';
    const a = Math.abs(v), sg = v < 0 ? '-' : '';
    const e = Math.floor(Math.log10(Number(a.toPrecision(15))));
    const sci = () => { const ed = Math.abs(e) >= 100 ? 4 : 5; let m = Number((a / Math.pow(10, e)).toPrecision(15)); let ee = e; let [i, d] = roundStr(m, ed); if (i.length > 1) { ee++; [i, d] = roundStr(a / Math.pow(10, ee), ed); } d = d.replace(/0+$/, ''); return sg + i + (d ? '.' + d : '') + 'E' + (ee < 0 ? '-' : '+') + pad2(Math.abs(ee)); };
    if (e >= 11) return sci();
    const intD = Math.max(1, e + 1), dec = Math.max(0, 10 - intD);
    let [i, d] = roundStr(a, dec);
    if (i.length > 11) return sci();
    d = d.replace(/0+$/, '');
    const s = sg + i + (d ? '.' + d : '');
    if (e < 0 && Number(a.toPrecision(15)) !== Number(i + '.' + (d || '0'))) {
      const sigDec = dec + e + 1, sigSci = Math.abs(e) >= 100 ? 5 : 6;
      if (sigSci > sigDec) return sci();
    }
    return s;
  }
  // 숫자 → 한자/한글 수 ([DBNum1] 一二三, [DBNum2] 壹貳參, [DBNum4] 일이삼)
  function hanNum(n, t) {
    const D = t === 2 ? '零壹貳參肆伍陸柒捌玖' : t === 4 ? '영일이삼사오육칠팔구' : '〇一二三四五六七八九';
    const U = t === 2 ? ['', '拾', '佰', '仟'] : t === 4 ? ['', '십', '백', '천'] : ['', '十', '百', '千'];
    const B = t === 4 ? ['', '만', '억', '조'] : ['', '萬', '億', '兆'];
    if (!Number.isInteger(n) || n < 0 || n >= 1e16) return null;
    if (n === 0) return D[0];
    let s = '', g = 0;
    while (n > 0) {
      const q = n % 10000; n = Math.floor(n / 10000);
      if (q) { let p = ''; String(q).padStart(4, '0').split('').forEach((ch, i) => { if (ch !== '0') p += D[+ch] + U[3 - i]; }); s = p + B[g] + s; }
      g++;
    }
    return s;
  }
  function splitSec(code) {
    const out = []; let cur = '', q = false, b = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch === '\\' && !q) { cur += ch + (code[i + 1] || ''); i++; continue; }
      if (ch === '"') q = !q; else if (!q && ch === '[') b = true; else if (!q && ch === ']') b = false;
      if (ch === ';' && !q && !b) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
  function compileSec(s) {
    const sec = { toks: [], cond: null, color: null, ko: false, db: 0 };
    const T = sec.toks, lit = (t) => T.push({ k: 'lit', t });
    let i = 0;
    while (i < s.length) {
      const ch = s[i], rest = s.slice(i); let m;
      if (ch === '"') { let j = s.indexOf('"', i + 1); if (j < 0) j = s.length; lit(s.slice(i + 1, j)); i = j + 1; continue; }
      if (ch === '\\') { lit(s[i + 1] || ''); i += 2; continue; }
      if (ch === '_') { lit(' '); i += 2; continue; }                 // 글자 하나 폭의 빈칸
      if (ch === '*') { T.push({ k: 'fill', t: s[i + 1] || ' ' }); i += 2; continue; }   // 남는 폭 채우기
      if (ch === '[') {
        let j = s.indexOf(']', i); if (j < 0) j = s.length;
        const b = s.slice(i + 1, j); i = j + 1;
        if (NCOL[b.toLowerCase()]) sec.color = NCOL[b.toLowerCase()];
        else if ((m = /^color\s*(\d+)$/i.exec(b))) sec.color = '#' + (INDEXED[+m[1] + 7] || '000000');
        else if ((m = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i.exec(b))) sec.cond = { op: m[1], v: parseFloat(m[2]) };
        else if ((m = /^\$([^-]*)(?:-([0-9a-z-]+))?$/i.exec(b))) {
          if (m[1]) lit(m[1]);
          const loc = (m[2] || '').toLowerCase();
          if (/412$/.test(loc) || /^ko/.test(loc)) sec.ko = true;
          if (/f800$/.test(loc)) sec.sys = 'yyyy"년" m"월" d"일" dddd'; else if (/f400$/.test(loc)) sec.sys = 'AM/PM h:mm:ss';
        }
        else if ((m = /^dbnum(\d)$/i.exec(b))) sec.db = +m[1];
        else if (/^(h+|m+|s+)$/i.test(b)) T.push({ k: 'el', t: b[0].toLowerCase(), n: b.length });
        continue;
      }
      if ((m = /^(general|g\/표준)/i.exec(rest))) { T.push({ k: 'gen' }); i += m[0].length; continue; }
      if ((m = /^(am\/pm|a\/p|오전\/오후)/i.exec(rest))) { T.push({ k: 'ap', t: m[0] }); i += m[0].length; continue; }
      if (/^[eE][+-]/.test(rest) && T.some((t) => t.k === 'ph')) { T.push({ k: 'E', t: rest[1] }); i += 2; continue; }
      if ((m = /^(y+|e+|g+|m+|d+|a{3,4}|h+|s+)/i.exec(rest))) { T.push({ k: 'dt', t: m[0].toLowerCase() }); i += m[0].length; continue; }
      if ('0#?'.includes(ch)) { T.push({ k: 'ph', t: ch }); i++; continue; }
      if ('.,%/@'.includes(ch)) { T.push({ k: ch }); i++; continue; }
      if (/[1-9]/.test(ch) && T.length && T[T.length - 1].k === '/') { m = /^\d+/.exec(rest); T.push({ k: 'den', t: m[0] }); i += m[0].length; continue; }
      lit(ch); i++;
    }
    if (sec.sys) { const s2 = compileSec(sec.sys); s2.ko = true; s2.color = sec.color; s2.cond = sec.cond; return s2; }
    sec.date = T.some((t) => t.k === 'dt' || t.k === 'el' || t.k === 'ap');
    sec.text = T.some((t) => t.k === '@');
    sec.gen = T.some((t) => t.k === 'gen');
    if (sec.date) {
      for (let k = 0; k < T.length; k++) {
        const t = T[k];
        if (t.k === '.' && T[k + 1] && T[k + 1].k === 'ph') {
          let p = k - 1; while (p >= 0 && T[p].k === 'lit') p--;
          if (p >= 0 && ((T[p].k === 'dt' && T[p].t[0] === 's') || (T[p].k === 'el' && T[p].t === 's'))) { let n = 0; while (T[k + 1 + n] && T[k + 1 + n].k === 'ph') n++; T.splice(k, n + 1, { k: 'fs', n }); continue; }
        }
        // 날짜의 / 는 지역 날짜 구분 기호 (한국: -)
        if (['.', ',', '/', '%', 'ph', 'den', 'E'].includes(t.k)) T[k] = { k: 'lit', t: t.k === 'ph' || t.k === 'den' ? t.t : t.k === 'E' ? 'E' + t.t : t.k === '/' ? '-' : t.k };
      }
      // m 이 분인지 달인지: 앞에 시(h), 뒤에 초(s)가 오면 분
      const dt = T.filter((t) => t.k === 'dt' || t.k === 'el');
      dt.forEach((t, k) => {
        if (t.k !== 'dt' || t.t[0] !== 'm' || t.t.length > 2) return;
        const p = dt[k - 1], n = dt[k + 1];
        if ((p && p.t[0] === 'h') || (n && n.t[0] === 's')) t.min = true;
      });
      return sec;
    }
    const ph = T.map((t, k) => (t.k === 'ph' ? k : -1)).filter((k) => k >= 0);
    sec.ip = []; sec.dp = []; sec.ep = []; sec.np = []; sec.dn = []; sec.pct = T.filter((t) => t.k === '%').length; sec.scale = 0;
    if (!ph.length) return sec;
    const eI = T.findIndex((t) => t.k === 'E');
    const sI = T.findIndex((t, k) => t.k === '/' && k > ph[0]);
    const dotI = T.findIndex((t) => t.k === '.');
    if (sI >= 0) {
      // 분수: [정수부] 분자/분모
      let k = sI - 1; while (k >= 0 && T[k].k === 'ph') sec.np.unshift(k--);
      for (let j = sI + 1; j < T.length && (T[j].k === 'ph' || T[j].k === 'den'); j++) sec.dn.push(j);
      sec.ip = ph.filter((j) => j < (sec.np[0] ?? sI));
      sec.frac = sI;
      T.forEach((t, j) => { if (t.k === '.') T[j] = { k: 'lit', t: '.' }; });
    } else {
      sec.dotI = dotI >= 0 && (eI < 0 || dotI < eI) ? dotI : -1;
      const endM = eI >= 0 ? eI : T.length;
      ph.forEach((j) => { if (j > eI && eI >= 0) sec.ep.push(j); else if (sec.dotI >= 0 && j > sec.dotI) sec.dp.push(j); else if (j < endM) sec.ip.push(j); });
      T.forEach((t, j) => { if (t.k === '.' && j !== sec.dotI) T[j] = { k: 'lit', t: '.' }; });
    }
    // 쉼표: 자리표시 사이 = 천 단위 구분, 마지막 자리표시 바로 뒤 = 1000 으로 나눔
    const mant = sec.ip.concat(sec.dp); const lastM = mant.length ? Math.max(...mant) : -1;
    T.forEach((t, j) => {
      if (t.k !== ',') return;
      let a = j - 1; while (a >= 0 && (T[a].k === ',' || T[a].k === 'sc')) a--;
      if (a === lastM && lastM >= 0) { t.k = 'sc'; sec.scale++; return; }
      const before = sec.ip.some((x) => x < j), after = sec.ip.some((x) => x > j);
      if (before && after) { t.k = 'gp'; sec.group = true; } else T[j] = { k: 'lit', t: ',' };
    });
    // 정수 자리표시 사이에 글자가 끼어 있는지 (000-0000 같은 꼴)
    sec.contig = sec.ip.length < 2 || T.slice(sec.ip[0], sec.ip[sec.ip.length - 1]).every((t) => t.k === 'ph' || t.k === 'gp');
    return sec;
  }
  const fmtCache = new Map();
  function compileFmt(code) {
    let f = fmtCache.get(code);
    if (!f) { f = splitSec(code).map(compileSec); fmtCache.set(code, f); }
    return f;
  }
  const condOk = (c, v) => (c.op === '<' ? v < c.v : c.op === '>' ? v > c.v : c.op === '<=' ? v <= c.v : c.op === '>=' ? v >= c.v : c.op === '<>' ? v !== c.v : v === c.v);
  function fmtNumSec(x, sec, text) {
    const T = sec.toks, out = new Array(T.length).fill(null);
    let expNeg = false;
    const dflt = (t) => (t === '0' ? '0' : t === '?' ? ' ' : '');
    const fillInt = (ipS) => {
      const P = sec.ip; let digits = ipS === '0' ? '' : ipS;
      if (!P.length) { if (sec.dotI >= 0 && digits) out[sec.dotI] = digits + '.'; return; }
      const asg = []; let rem = digits;
      for (let k = P.length - 1; k >= 0; k--) {
        if (k === 0) asg[0] = rem.length ? rem : dflt(T[P[0]].t);
        else if (rem.length) { asg[k] = rem.slice(-1); rem = rem.slice(0, -1); } else asg[k] = dflt(T[P[k]].t);
      }
      if (sec.contig && sec.group) {
        const j = asg.join(''), lead = /^ */.exec(j)[0];
        P.forEach((p, k) => { out[p] = k ? '' : lead + j.slice(lead.length).replace(/\B(?=(\d{3})+(?!\d))/g, ','); });
      } else P.forEach((p, k) => { out[p] = asg[k]; });
    };
    const fillDec = (dpS) => {
      const P = sec.dp; let end = P.length;
      while (end > 0 && dpS[end - 1] === '0' && T[P[end - 1]].t !== '0') end--;
      P.forEach((p, k) => { out[p] = k < end ? dpS[k] : T[p].t === '?' ? ' ' : ''; });
    };
    x = x * Math.pow(100, sec.pct) / Math.pow(1000, sec.scale);
    if (sec.ep.length) {
      const ni = Math.max(1, sec.ip.length), eng = sec.ip.length > 1 && T[sec.ip[0]].t === '#';
      let e = x === 0 ? 0 : Math.floor(Math.log10(x));
      e = eng ? Math.floor(e / ni) * ni : e - (ni - 1);
      let [i, d] = roundStr(x / Math.pow(10, e), sec.dp.length);
      if (!eng && i.length > ni) { e++; [i, d] = roundStr(x / Math.pow(10, e), sec.dp.length); }
      fillInt(i); fillDec(d);
      expNeg = e < 0;
      const en = sec.ep.filter((p) => T[p].t === '0').length;
      sec.ep.forEach((p, k) => { out[p] = k ? '' : String(Math.abs(e)).padStart(en, '0'); });
    } else if (sec.frac != null) {
      const hasInt = sec.ip.length > 0;
      let ip = hasInt ? Math.floor(x) : 0; const f = hasInt ? x - ip : x;
      const fixed = sec.dn.length && T[sec.dn[0]].k === 'den' ? +T[sec.dn[0]].t : 0;
      const maxD = Math.pow(10, Math.max(1, sec.dn.length)) - 1;
      let n = 0, d = 1;
      if (fixed) { d = fixed; n = Math.round(f * d); } else { let be = Infinity; for (let dd = 1; dd <= maxD; dd++) { const nn = Math.round(f * dd), er = Math.abs(f - nn / dd); if (er < be - 1e-12) { be = er; n = nn; d = dd; } } }
      if (hasInt && n === d) { ip += 1; n = 0; }
      fillInt(String(ip));
      const nl = sec.np.length, dl = sec.dn.length;
      if (n === 0 && hasInt) {
        if (ip === 0) out[sec.ip[sec.ip.length - 1]] = '0';
        sec.np.forEach((p) => { out[p] = ' '; }); out[sec.frac] = ' '; sec.dn.forEach((p) => { out[p] = T[p].k === 'den' ? ' '.repeat(T[p].t.length) : ' '; });
      } else {
        sec.np.forEach((p, k) => { out[p] = k ? '' : String(n).padStart(nl, ' '); });
        sec.dn.forEach((p, k) => { out[p] = k ? '' : T[p].k === 'den' ? T[p].t : String(d).padEnd(dl, ' '); });
      }
    } else {
      const [i, d] = roundStr(x, sec.dp.length);
      fillInt(i); fillDec(d);
    }
    let s = '', fillAt = -1, fillCh = '';
    T.forEach((t, k) => {
      switch (t.k) {
        case 'lit': s += t.t; break;
        case 'ph': case 'den': s += out[k] ?? (t.k === 'den' ? t.t : ''); break;
        case '.': s += out[k] ?? '.'; break;
        case 'gp': case 'sc': break;
        case ',': s += ','; break;
        case '%': s += '%'; break;
        case 'E': s += 'E' + (expNeg ? '-' : t.t === '+' ? '+' : ''); break;
        case '/': s += out[k] ?? '/'; break;
        case 'fill': fillAt = s.length; fillCh = t.t; break;
        case '@': s += text == null ? '' : text; break;
        case 'gen': s += genStr(x); break;
        case 'dt': s += t.t; break;
      }
    });
    return { s, fillAt, fillCh };
  }
  function fmtDateSec(v, sec) {
    const T = sec.toks;
    if (v < 0 || v >= 2958466) return { s: '#'.repeat(10), fillAt: -1 };
    const fsN = Math.max(0, ...T.filter((t) => t.k === 'fs').map((t) => t.n));
    const unit = Math.pow(10, fsN);
    let days = Math.floor(v); let ts = Math.round((v - days) * 86400 * unit) / unit;
    if (ts >= 86400) { days += 1; ts -= 86400; }
    const P = serialParts(days), H = Math.floor(ts / 3600), Mi = Math.floor((ts % 3600) / 60), S = ts % 60;
    const tot = Math.round(v * 86400 * unit) / unit;
    const h12 = T.some((t) => t.k === 'ap');
    let s = '';
    for (const t of T) {
      if (t.k === 'lit') s += t.t;
      else if (t.k === 'fs') s += '.' + (S - Math.floor(S)).toFixed(t.n).slice(2);
      else if (t.k === 'el') { const n = t.t === 'h' ? Math.floor(tot / 3600) : t.t === 'm' ? Math.floor(tot / 60) : Math.floor(tot); s += String(n).padStart(t.n, '0'); }
      else if (t.k === 'ap') { const pm = H >= 12; s += /^오/.test(t.t) || sec.ko && /^am\/pm$/i.test(t.t) ? (pm ? '오후' : '오전') : /^a\/p$/.test(t.t) ? (pm ? 'p' : 'a') : /^A\/P$/.test(t.t) ? (pm ? 'P' : 'A') : t.t === 'am/pm' ? (pm ? 'pm' : 'am') : (pm ? 'PM' : 'AM'); }
      else if (t.k === 'dt') {
        const c = t.t, n = c.length;
        switch (c[0]) {
          case 'y': s += n <= 2 ? pad2(P.y % 100) : P.y; break;
          case 'e': s += P.y; break;
          case 'g': break;
          case 'm':
            if (t.min) s += n === 1 ? Mi : pad2(Mi);
            else s += n === 1 ? P.m : n === 2 ? pad2(P.m) : sec.ko ? P.m + '월' : n === 3 ? MON_EN[P.m - 1].slice(0, 3) : n === 4 ? MON_EN[P.m - 1] : MON_EN[P.m - 1][0];
            break;
          case 'd': s += n === 1 ? P.d : n === 2 ? pad2(P.d) : sec.ko ? WD[P.w] + (n > 3 ? '요일' : '') : n === 3 ? WD_EN[P.w].slice(0, 3) : WD_EN[P.w]; break;
          case 'a': s += WD[P.w] + (n > 3 ? '요일' : ''); break;
          case 'h': { const hh = h12 ? H % 12 || 12 : H; s += n === 1 ? hh : pad2(hh); break; }
          case 's': s += n === 1 ? Math.floor(S) : pad2(Math.floor(S)); break;
        }
      }
    }
    return { s, fillAt: -1 };
  }
  // 값 + 형식 → { t: 글자, color, fillAt, fillCh }
  function fmtParts(v, fmt) {
    if (v == null || v === '') return { t: '' };
    if (typeof v === 'object' && v.err) return { t: v.err };
    if (typeof v === 'boolean') return { t: v ? 'TRUE' : 'FALSE' };
    const secs = compileFmt(fmt || 'General');
    if (typeof v === 'string') {
      const ts = secs.length >= 4 ? secs[3] : secs.find((s) => s.text);
      if (!ts) return { t: v };
      const r = fmtNumSec(0, Object.assign({}, ts, { ip: [], dp: [], ep: [], np: [], dn: [], pct: 0, scale: 0, frac: null, dotI: -1 }), v);
      return { t: r.s, fillAt: r.fillAt, fillCh: r.fillCh, color: ts.color };
    }
    let sec, x = v, neg = false;
    const conds = secs.filter((s) => s.cond).length;
    if (conds) {
      sec = secs.find((s) => s.cond && condOk(s.cond, v));
      if (!sec) { const rest = secs.filter((s) => !s.cond && !(s.text && !s.ip.length)); sec = rest[0] || secs[secs.length - 1]; }
      neg = v < 0 && (sec === secs[0] || !sec.cond || sec.cond.op === '<' && sec.cond.v <= 0 ? sec !== secs[1] : false);
      if (sec === secs[1] && !(sec.cond && sec.cond.v > 0)) neg = false;
      x = Math.abs(v);
      if (v < 0 && sec === secs[0] && !sec.cond) neg = true;
    } else {
      const n = secs.filter((s) => !(s.text && secs.length >= 4 && s === secs[3])).length;
      if (v > 0 || (v === 0 && n < 3)) sec = secs[0];
      else if (v < 0) { if (n >= 2) { sec = secs[1]; x = -v; } else { sec = secs[0]; x = -v; neg = true; } }
      else sec = secs[2];
    }
    if (!sec) return { t: '' };
    if (sec.date) { const r = fmtDateSec(v, sec); return { t: r.s, color: sec.color, fillAt: -1 }; }
    if (sec.text && !sec.ip.length && !sec.dp.length && !sec.gen) return { t: genStr(v), color: sec.color };   // 텍스트 형식(@)의 숫자
    if (!sec.ip.length && !sec.dp.length && !sec.ep.length && sec.frac == null && !sec.gen) {
      // 자리표시가 없는 형식 ("많음", "-", ;;;)
      const r = fmtNumSec(x, sec);
      return { t: (neg ? '-' : '') + r.s, color: sec.color, fillAt: r.fillAt < 0 ? -1 : r.fillAt + (neg ? 1 : 0), fillCh: r.fillCh };
    }
    if (sec.db && sec.gen && Number.isInteger(x)) { const h = hanNum(x, sec.db); if (h != null) return { t: (neg ? '-' : '') + h, color: sec.color }; }
    const r = fmtNumSec(x, sec);
    let t = r.s;
    if (neg && /[1-9]/.test(t.replace(/E[+-]\d+/, ''))) t = '-' + t;
    else if (neg && sec.gen) t = '-' + t;
    else neg = false;
    return { t, color: sec.color, fillAt: r.fillAt < 0 ? -1 : r.fillAt + (neg ? 1 : 0), fillCh: r.fillCh };
  }
  function formatValue(v, fmt) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && (!fmt || /^(general|g\/표준)$/i.test(fmt))) return genStr(v);
    return fmtParts(v, fmt).t;
  }
  const isDateFmt = (f) => { if (!f || /^(general|g\/표준)$/i.test(f)) return false; const s = compileFmt(f)[0]; return !!(s && s.date); };

  /* ── 수식 ── */
  const ERR = (e) => ({ err: e });
  const isErr = (v) => v && typeof v === 'object' && v.err;
  const SHEET = `(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_\\u3131-\\uD79D.]+))!)?`;
  function tokenize(s) {
    const out = []; let i = 0;
    const re = {
      ws: /^\s+/, str: /^"((?:[^"]|"")*)"/, err: /^#(?:REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!)/,
      ref: new RegExp('^' + SHEET + '(\\$?[A-Z]{1,3}\\$?\\d+(?::\\$?[A-Z]{1,3}\\$?\\d+)?)(?![A-Za-z0-9_(])'),
      col: new RegExp('^' + SHEET + '(\\$?[A-Z]{1,3}:\\$?[A-Z]{1,3})(?![A-Za-z0-9_(])'),
      row: new RegExp('^' + SHEET + '(\\$?\\d+:\\$?\\d+)(?![A-Za-z0-9_(.])'),
      num: /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/, fn: /^((?:_xlfn\.|_xlws\.|_xlfn\._xlws\.)?[A-Za-z][A-Za-z0-9_.]*)\(/, name: /^([A-Za-z_\\\u3131-\uD79D][A-Za-z0-9_.\u3131-\uD79D]*)/,
      op: /^(<>|<=|>=|[-+*/^&=<>%,():;{}])/
    };
    while (i < s.length) {
      const r = s.slice(i); let m;
      if ((m = re.ws.exec(r))) { i += m[0].length; continue; }
      if ((m = re.str.exec(r))) { out.push({ t: 'str', v: m[1].replace(/""/g, '"') }); i += m[0].length; continue; }
      if ((m = re.err.exec(r))) { out.push({ t: 'err', v: m[0] }); i += m[0].length; continue; }
      if ((m = re.col.exec(r)) || (m = re.ref.exec(r)) || (m = re.row.exec(r))) { out.push({ t: 'ref', sheet: m[1] ? m[1].replace(/''/g, "'") : m[2] || null, v: m[3].replace(/\$/g, '') }); i += m[0].length; continue; }
      if ((m = re.num.exec(r))) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = re.fn.exec(r))) { out.push({ t: 'fn', v: m[1].toUpperCase().replace(/^(_XLFN\.|_XLWS\.)+/, '') }); i += m[0].length; continue; }
      if (/^(TRUE|FALSE)(?![A-Za-z0-9_(])/i.test(r)) { const b = r.slice(0, 4).toUpperCase() === 'TRUE'; out.push({ t: 'bool', v: b }); i += b ? 4 : 5; continue; }
      if ((m = re.name.exec(r))) { out.push({ t: 'name', v: m[1] }); i += m[0].length; continue; }
      if ((m = re.op.exec(r))) { out.push({ t: 'op', v: m[1] }); i += m[0].length; continue; }
      throw new Error('formula token: ' + r.slice(0, 10));
    }
    return out;
  }
  function parseFormula(s) {
    const tk = tokenize(s.replace(/^=/, '')); let p = 0;
    const peek = () => tk[p], take = () => tk[p++];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    function cmp() { let a = cat(); while (peek() && peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const o = take().v; a = { k: 'bin', o, a, b: cat() }; } return a; }
    function cat() { let a = add(); while (isOp('&')) { take(); a = { k: 'bin', o: '&', a, b: add() }; } return a; }
    function add() { let a = mul(); while (isOp('+') || isOp('-')) { const o = take().v; a = { k: 'bin', o, a, b: mul() }; } return a; }
    function mul() { let a = pow(); while (isOp('*') || isOp('/')) { const o = take().v; a = { k: 'bin', o, a, b: pow() }; } return a; }
    function pow() { let a = un(); while (isOp('^')) { take(); a = { k: 'bin', o: '^', a, b: un() }; } return a; }
    function un() { if (isOp('-')) { take(); return { k: 'neg', a: un() }; } if (isOp('+')) { take(); return un(); } let a = prim(); while (isOp('%')) { take(); a = { k: 'pct', a }; } return a; }
    function arrConst() {
      const rows = [[]];
      while (!isOp('}')) {
        const t = take(); if (!t) throw new Error('missing }');
        if (t.t === 'op' && t.v === ',') continue;
        if (t.t === 'op' && t.v === ';') { rows.push([]); continue; }
        let v; if (t.t === 'op' && t.v === '-') { v = -take().v; } else v = t.t === 'err' ? ERR(t.v) : t.v;
        rows[rows.length - 1].push(v);
      }
      take();
      return { k: 'v', v: { arr: rows } };
    }
    function prim() {
      const t = take(); if (!t) throw new Error('formula end');
      if (t.t === 'num' || t.t === 'str' || t.t === 'bool') return { k: 'v', v: t.v };
      if (t.t === 'err') return { k: 'v', v: ERR(t.v) };
      if (t.t === 'ref') return { k: 'ref', sheet: t.sheet, ref: t.v };
      if (t.t === 'name') return { k: 'name', v: t.v };
      if (t.t === 'fn') {
        const args = [];
        if (!isOp(')')) { do { if (isOp(',') || isOp(')')) args.push({ k: 'v', v: null, empty: true }); else args.push(cmp()); } while (isOp(',') && take()); }
        if (!isOp(')')) throw new Error('missing )'); take();
        return { k: 'fn', f: t.v, args };
      }
      if (t.t === 'op' && t.v === '{') return arrConst();
      if (t.t === 'op' && t.v === '(') { const e = cmp(); if (isOp(')')) take(); return e; }
      throw new Error('unexpected ' + t.v);
    }
    return cmp();
  }
  // 공유 수식·조건부 서식: 기준 칸에서 떨어진 만큼 상대 주소를 옮긴다
  function shiftFormula(f, dr, dc) {
    if (!dr && !dc) return f;
    return f.replace(/("(?:[^"]|"")*")|((?:'[^']+'|[A-Za-z0-9_\u3131-\uD79D.]+)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g, (m, q, sh, ca, col, ra, row) =>
      q ? q : (sh || '') + ca + (ca ? col : colName(colNum(col) + dc)) + ra + (ra ? row : +row + dr));
  }
  // 숫자 → 글자 (엑셀처럼 15자리)
  const numStr = (v) => { if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v); const s = String(Number(v.toPrecision(15))); return s.replace(/e([+-])(\d)$/, 'E$10$2').replace('e', 'E'); };

  /* ── 통합 문서 열기 ── */
  async function load(src) {
    const bytes = typeof src === 'string' ? Uint8Array.from(atob(src), (c) => c.charCodeAt(0)) : new Uint8Array(src);
    const files = await HwpxEditor._unzip(bytes);
    const F = Object.fromEntries(files.map((f) => [f.name, f]));
    // 하이퍼링크 관계만 (relsOf 는 바깥 주소를 버리므로 따로 읽는다)
    const linkRelsOf = (path) => {
      const rp = path.replace(/([^/]+)$/, '_rels/$1.rels'); if (!F[rp]) return {};
      return Object.fromEntries(all(parse(F[rp].data), 'Relationship').filter((r) => /\/hyperlink$/.test(r.getAttribute('Type') || '')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target') || '']));
    };
    const relsOf = (path) => {
      const rp = path.replace(/([^/]+)$/, '_rels/$1.rels'); if (!F[rp]) return {};
      const dir = path.replace(/[^/]+$/, '');
      return Object.fromEntries(all(parse(F[rp].data), 'Relationship').map((r) => {
        let t = r.getAttribute('Target');
        if (r.getAttribute('TargetMode') === 'External') return [r.getAttribute('Id'), null];
        t = t.startsWith('/') ? t.slice(1) : dir + t;
        while (/[^/]+\/\.\.\//.test(t)) t = t.replace(/[^/]+\/\.\.\//, '');
        return [r.getAttribute('Id'), t];
      }));
    };
    const wb = parse(F['xl/workbook.xml'].data);
    const relMap = relsOf('xl/workbook.xml');
    const theme = F['xl/theme/theme1.xml'] ? themeColors(parse(F['xl/theme/theme1.xml'].data)) : themeColors(null);
    const st = parse(F['xl/styles.xml'].data);
    const custIdx = kids(kid(kid(st.documentElement, 'colors'), 'indexedColors'), 'rgbColor').map((c) => (c.getAttribute('rgb') || '').slice(-6).toUpperCase());
    const C = { theme, indexed: custIdx.length ? INDEXED.map((x, i) => custIdx[i] || x) : null };
    const fontOf = (f, base) => {
      if (!f) return base;
      const g = (n) => kid(f, n), u = g('u');
      return {
        name: ((g('name') || g('rFont')) || { getAttribute: () => null }).getAttribute('val') || (base ? base.name : ''),
        sz: g('sz') ? parseFloat(g('sz').getAttribute('val')) : base ? base.sz : 11,
        b: on(g('b')), i: on(g('i')), s: on(g('strike')), u: u && on(u) !== false && (u.getAttribute('val') || 'single') !== 'none' ? u.getAttribute('val') || 'single' : null,
        va: g('vertAlign') ? g('vertAlign').getAttribute('val') : null,
        color: g('color') ? colorOf(g('color'), C) : base ? base.color : null
      };
    };
    // 공유 문자열 (서식이 섞인 글은 조각(run)도 함께 기억)
    const ss = [], ssRich = [];
    if (F['xl/sharedStrings.xml']) all(parse(F['xl/sharedStrings.xml'].data), 'si').forEach((si, i) => {
      const runs = kids(si, 'r');
      ss.push(xtext(all(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('')));
      if (runs.length) ssRich[i] = runs.map((r) => ({ t: xtext(all(r, 't').map((t) => t.textContent).join('')), rPr: kid(r, 'rPr') }));
    });
    const numFmts = Object.assign({}, BUILTIN);
    kids(kid(st.documentElement, 'numFmts'), 'numFmt').forEach((n) => { numFmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
    const fonts = kids(kid(st.documentElement, 'fonts'), 'font').map((f) => fontOf(f, null));
    const fillOf = (f) => {
      const pf = kid(f, 'patternFill'), gf = kid(f, 'gradientFill');
      if (gf) {
        const stops = kids(gf, 'stop').map((s) => `${colorOf(kid(s, 'color'), C) || '#FFFFFF'} ${+(parseFloat(s.getAttribute('position')) * 100).toFixed(2)}%`);
        if (gf.getAttribute('type') === 'path') {
          const L = +(gf.getAttribute('left') || 0), R = +(gf.getAttribute('right') || 0), Tp = +(gf.getAttribute('top') || 0), B = +(gf.getAttribute('bottom') || 0);
          return { image: `radial-gradient(farthest-corner at ${((L + R) / 2) * 100}% ${((Tp + B) / 2) * 100}%, ${stops.join(', ')})`, color: null };
        }
        return { image: `linear-gradient(${+(gf.getAttribute('degree') || 0) + 90}deg, ${stops.join(', ')})`, color: null };
      }
      if (!pf) return null;
      const pt = pf.getAttribute('patternType') || 'none';
      if (pt === 'none') return null;
      const fg = colorOf(kid(pf, 'fgColor'), C), bg = colorOf(kid(pf, 'bgColor'), C);
      if (pt === 'solid') return { color: fg || bg || '#000000' };
      return { color: bg || '#FFFFFF', image: patternUrl(pt, fg || '#000000', bg || '#FFFFFF') };
    };
    const fills = kids(kid(st.documentElement, 'fills'), 'fill').map(fillOf);
    const borderOf = (b) => {
      if (!b) return {};
      const side = (n) => { const e = kid(b, n); const s = e && e.getAttribute('style'); if (!s || s === 'none') return null; return { s, c: colorOf(kid(e, 'color'), C) || '#000000' }; };
      const d = side('diagonal');
      return { l: side('left') || side('start'), r: side('right') || side('end'), t: side('top'), b: side('bottom'), d: d && (b.getAttribute('diagonalUp') === '1' || b.getAttribute('diagonalDown') === '1') ? Object.assign(d, { up: b.getAttribute('diagonalUp') === '1', down: b.getAttribute('diagonalDown') === '1' }) : null };
    };
    const borders = kids(kid(st.documentElement, 'borders'), 'border').map(borderOf);
    const styleXfs = kids(kid(st.documentElement, 'cellStyleXfs'), 'xf');
    const font0 = fonts[+((styleXfs[0] && styleXfs[0].getAttribute('fontId')) || 0)] || fonts[0] || { name: '맑은 고딕', sz: 11 };
    const xfs = kids(kid(st.documentElement, 'cellXfs'), 'xf').map((x) => {
      const al = kid(x, 'alignment'), a = (n) => al && al.getAttribute(n);
      return {
        fmt: numFmts[x.getAttribute('numFmtId') || '0'] || 'General', font: fonts[+x.getAttribute('fontId') || 0] || font0, fill: fills[+x.getAttribute('fillId') || 0] || null,
        border: borders[+x.getAttribute('borderId') || 0] || {}, h: a('horizontal'), v: a('vertical'), wrap: a('wrapText') === '1' || a('wrapText') === 'true',
        indent: +(a('indent') || 0), rot: +(a('textRotation') || 0), shrink: a('shrinkToFit') === '1' || a('shrinkToFit') === 'true',
        locked: !(kid(x, 'protection') && /^(0|false)$/.test(kid(x, 'protection').getAttribute('locked') || ''))
      };
    });
    if (!xfs.length) xfs.push({ fmt: 'General', font: font0, fill: null, border: {}, h: null, v: null, wrap: false, indent: 0, rot: 0, shrink: false, locked: true });
    const dxfs = kids(kid(st.documentElement, 'dxfs'), 'dxf').map((d) => {
      const f = kid(d, 'font'), fi = kid(d, 'fill'), nf = kid(d, 'numFmt');
      let fill;
      if (fi) {
        const pf = kid(fi, 'patternFill');
        if (pf) { const pt = pf.getAttribute('patternType'); const bg = colorOf(kid(pf, 'bgColor'), C), fg = colorOf(kid(pf, 'fgColor'), C); fill = pt && pt !== 'solid' && pt !== 'none' ? { color: bg || '#FFFFFF', image: patternUrl(pt, fg || '#000000', bg || '#FFFFFF') } : pt === 'none' ? null : (bg || fg) ? { color: bg || fg } : undefined; }
        else fill = fillOf(fi);
      }
      const font = f ? {} : null;
      if (f) {
        if (kid(f, 'b')) font.b = on(kid(f, 'b')); if (kid(f, 'i')) font.i = on(kid(f, 'i')); if (kid(f, 'strike')) font.s = on(kid(f, 'strike'));
        if (kid(f, 'u')) font.u = kid(f, 'u').getAttribute('val') || 'single'; if (kid(f, 'color')) font.color = colorOf(kid(f, 'color'), C);
      }
      return { font, fill, border: kid(d, 'border') ? borderOf(kid(d, 'border')) : null, fmt: nf ? nf.getAttribute('formatCode') : null };
    });
    const sheets = [];
    kids(kid(wb.documentElement, 'sheets'), 'sheet').forEach((s, idx) => {
      const rid = s.getAttributeNS(NS_R, 'id') || s.getAttribute('r:id');
      const path = relMap[rid];
      if (!path || !F[path]) return;
      sheets.push({ name: s.getAttribute('name'), hidden: (s.getAttribute('state') || 'visible') !== 'visible', path, idx });
    });
    const names = {};
    all(wb, 'definedName').forEach((d) => {
      const local = d.getAttribute('localSheetId');
      names[(local != null ? local + ':' : '') + d.getAttribute('name')] = d.textContent;
      names[(local != null ? local + ':' : '') + d.getAttribute('name').toUpperCase()] = d.textContent;
    });
    const media = {};
    const mediaUrl = (path) => {
      if (media[path] !== undefined) return media[path];
      const f = F[path]; if (!f) return (media[path] = null);
      const ext = (path.split('.').pop() || '').toLowerCase();
      const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
      return (media[path] = type && typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(new Blob([f.data], { type })) : null);
    };
    const book = { files, F, sheets, xfs, names, wbDoc: wb, dxfs, font0, C, ssRich, fonts };
    for (const sh of sheets) {
      const doc = parse(F[sh.path].data), root = doc.documentElement;
      sh.doc = doc; sh.cells = {}; sh.cols = {}; sh.rows = {}; sh.maxR = 1; sh.maxC = 1;
      kids(kid(root, 'cols'), 'col').forEach((c) => {
        for (let i = +c.getAttribute('min'); i <= Math.min(+c.getAttribute('max'), 16384); i++) sh.cols[i] = { w: c.getAttribute('width') != null ? parseFloat(c.getAttribute('width')) : null, hidden: c.getAttribute('hidden') === '1' || c.getAttribute('hidden') === 'true', s: c.getAttribute('style') != null ? +c.getAttribute('style') : null };
      });
      const fmt = kid(root, 'sheetFormatPr');
      sh.defH = fmt && fmt.getAttribute('defaultRowHeight') ? parseFloat(fmt.getAttribute('defaultRowHeight')) : 15;
      sh.defW = fmt && fmt.getAttribute('defaultColWidth') ? parseFloat(fmt.getAttribute('defaultColWidth')) : null;
      sh.baseW = fmt && fmt.getAttribute('baseColWidth') ? +fmt.getAttribute('baseColWidth') : 8;
      sh.zeroH = !!fmt && fmt.getAttribute('zeroHeight') === '1';
      const sv = all(root, 'sheetView')[0];
      sh.grid = !(sv && (sv.getAttribute('showGridLines') === '0' || sv.getAttribute('showGridLines') === 'false'));
      sh.active = sv && sv.getAttribute('tabSelected') === '1';
      // 시트 보호: 켜져 있으면 '잠금 해제'한 칸만 고칠 수 있다
      const sp = kid(root, 'sheetProtection');
      sh.prot = sp && /^(1|true)$/.test(sp.getAttribute('sheet') || '') ? { selLocked: sp.getAttribute('selectLockedCells') !== '1', selUnlocked: sp.getAttribute('selectUnlockedCells') !== '1' } : null;
      const shared = {};
      kids(kid(root, 'sheetData'), 'row').forEach((row) => {
        const r = +row.getAttribute('r');
        sh.rows[r] = { h: row.getAttribute('ht') && row.getAttribute('customHeight') !== '0' || row.getAttribute('ht') ? parseFloat(row.getAttribute('ht')) : null, hidden: row.getAttribute('hidden') === '1' || row.getAttribute('hidden') === 'true', s: row.getAttribute('customFormat') === '1' ? +(row.getAttribute('s') || 0) : null };
        if (r > sh.maxR) sh.maxR = r;
        kids(row, 'c').forEach((c) => {
          const ref = c.getAttribute('r'); const t = c.getAttribute('t'); const p = parseRef(ref);
          if (!p) return;
          const fEl = kid(c, 'f'), vEl = kid(c, 'v');
          let v = vEl ? vEl.textContent : null, rich = null;
          if (t === 's' && v != null) { rich = ssRich[+v] || null; v = ss[+v]; }
          else if (t === 'inlineStr') { const is = kid(c, 'is'); v = xtext(all(c, 't').filter((x) => x.parentNode.localName !== 'rPh').map((x) => x.textContent).join('')); if (is && kids(is, 'r').length) rich = kids(is, 'r').map((r) => ({ t: xtext(all(r, 't').map((x) => x.textContent).join('')), rPr: kid(r, 'rPr') })); }
          else if (t === 'b') v = v === '1';
          else if (t === 'e') v = ERR(v);
          else if (t === 'str') v = v == null ? '' : xtext(v);
          else if (v != null && v !== '') v = parseFloat(v);
          let f = null, arr = false;
          if (fEl) {
            const ft = fEl.getAttribute('t');
            if (ft === 'shared') {
              const si = fEl.getAttribute('si');
              if (fEl.textContent) { shared[si] = { f: fEl.textContent, r: p.r, c: p.c }; f = fEl.textContent; }
              else if (shared[si]) f = shiftFormula(shared[si].f, p.r - shared[si].r, p.c - shared[si].c);
            } else if (fEl.textContent) { f = fEl.textContent; arr = ft === 'array'; }
          }
          sh.cells[ref] = { r: p.r, c: p.c, v, f, arr, s: +(c.getAttribute('s') || 0), orig: v, rich: rich && rich.map((x) => ({ t: x.t, font: x.rPr ? fontOf(x.rPr, null) : null })) };
          if (p.c > sh.maxC) sh.maxC = p.c;
          if (p.r > sh.maxR) sh.maxR = p.r;
        });
      });
      sh.merges = all(root, 'mergeCell').map((m) => parseRange(m.getAttribute('ref')));
      sh.valid = {};
      all(root, 'dataValidation').forEach((dv) => {
        if (dv.getAttribute('type') !== 'list') return;
        const f1 = (kid(dv, 'formula1') || all(dv, 'f')[0] || { textContent: '' }).textContent;
        // 새 형식(x14)은 sqref 를 속성이 아닌 하위 요소로 둔다
        const sqref = dv.getAttribute('sqref') || (all(dv, 'sqref')[0] || { textContent: '' }).textContent;
        if (!sqref) return;
        sqref.trim().split(/\s+/).forEach((sq) => {
          const rg = parseRange(sq);
          for (let r = rg.r1; r <= Math.min(rg.r2, sh.maxR + 200); r++) for (let c = rg.c1; c <= Math.min(rg.c2, sh.maxC + 50); c++) sh.valid[colName(c) + r] = f1;
        });
      });
      // 조건부 서식 (x14 확장은 건너뜀)
      sh.cf = [];
      kids(root, 'conditionalFormatting').forEach((cfEl) => {
        const ranges = (cfEl.getAttribute('sqref') || '').trim().split(/\s+/).filter(Boolean).map(parseRange);
        if (!ranges.length) return;
        kids(cfEl, 'cfRule').forEach((ru) => {
          const g = (n) => ru.getAttribute(n);
          const rule = { ranges, type: g('type'), op: g('operator'), pr: +(g('priority') || 0), stop: g('stopIfTrue') === '1', dxf: g('dxfId') != null ? dxfs[+g('dxfId')] : null, f: kids(ru, 'formula').map((x) => x.textContent), text: g('text'), rank: +(g('rank') || 10), percent: g('percent') === '1', bottom: g('bottom') === '1', above: g('aboveAverage') !== '0', eq: g('equalAverage') === '1', std: +(g('stdDev') || 0) };
          const cfvo = (e) => ({ type: e.getAttribute('type'), val: e.getAttribute('val') });
          const cs = kid(ru, 'colorScale'); if (cs) rule.scale = { v: kids(cs, 'cfvo').map(cfvo), c: kids(cs, 'color').map((x) => colorOf(x, C) || '#FFFFFF') };
          const db = kid(ru, 'dataBar'); if (db) rule.bar = { v: kids(db, 'cfvo').map(cfvo), c: colorOf(kid(db, 'color'), C) || '#638EC6' };
          sh.cf.push(rule);
        });
      });
      sh.cf.sort((a, b) => a.pr - b.pr);
      // 쪽 설정
      const ps = kid(root, 'pageSetup'), pm = kid(root, 'pageMargins'), po = kid(root, 'printOptions'), spr = kid(kid(root, 'sheetPr'), 'pageSetUpPr');
      const pa = (e, n, d) => (e && e.getAttribute(n) != null ? e.getAttribute(n) : d);
      const brk = (n) => new Set(kids(kid(root, n), 'brk').map((b) => +b.getAttribute('id')));
      sh.page = {
        paper: +pa(ps, 'paperSize', 9), land: pa(ps, 'orientation', '') === 'landscape', scale: +pa(ps, 'scale', 100) || 100,
        fit: pa(spr, 'fitToPage', '0') === '1', fw: +pa(ps, 'fitToWidth', 1), fh: +pa(ps, 'fitToHeight', 1), order: pa(ps, 'pageOrder', 'downThenOver'),
        ml: +pa(pm, 'left', 0.7), mr: +pa(pm, 'right', 0.7), mt: +pa(pm, 'top', 0.75), mb: +pa(pm, 'bottom', 0.75),
        hc: pa(po, 'horizontalCentered', '0') === '1', vc: pa(po, 'verticalCentered', '0') === '1', grid: pa(po, 'gridLines', '0') === '1',
        rb: brk('rowBreaks'), cb: brk('colBreaks')
      };
      const pt = names[sh.idx + ':_xlnm.Print_Titles'];
      if (pt) pt.split(',').forEach((p) => { const m = /!\$?(\d+):\$?(\d+)$/.exec(p); if (m) sh.page.titles = [+m[1], +m[2]]; });
      // 하이퍼링크: 칸마다 바깥 주소(url) 또는 파일 안 위치(loc). 범위로 걸린 링크는 칸마다 펼친다
      const lRels = linkRelsOf(sh.path);
      sh.links = {};
      all(root, 'hyperlink').forEach((h) => {
        const ref = h.getAttribute('ref'); if (!ref) return;
        const rid = h.getAttributeNS(NS_R, 'id') || h.getAttribute('r:id');
        const lk = linkOf(rid ? lRels[rid] : '', h.getAttribute('location'));
        if (!lk) return;
        lk.tip = h.getAttribute('tooltip') || '';
        const rg = parseRange(ref);
        for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + 200); r++) for (let c = rg.c1; c <= Math.min(rg.c2, rg.c1 + 50); c++) sh.links[colName(c) + r] = lk;
      });
      // 그림·도형
      const sRels = relsOf(sh.path);
      sh.draw = [];
      const dEl = kid(root, 'drawing');
      const dPath = dEl && sRels[dEl.getAttributeNS(NS_R, 'id') || dEl.getAttribute('r:id')];
      if (dPath && F[dPath]) {
        const dd = parse(F[dPath].data), dRels = relsOf(dPath);
        Array.from(dd.documentElement.children).forEach((an) => {
          const pos = (e) => e && { c: +kid(e, 'col').textContent + 1, co: +kid(e, 'colOff').textContent, r: +kid(e, 'row').textContent + 1, ro: +kid(e, 'rowOff').textContent };
          const a = { type: an.localName, from: pos(kid(an, 'from')), to: pos(kid(an, 'to')) };
          const ext = kid(an, 'ext'), p = kid(an, 'pos');
          if (ext) a.ext = { cx: +ext.getAttribute('cx'), cy: +ext.getAttribute('cy') };
          if (p) a.pos = { x: +p.getAttribute('x'), y: +p.getAttribute('y') };
          const body = Array.from(an.children).find((n) => ['pic', 'sp', 'cxnSp', 'grpSp', 'graphicFrame'].includes(n.localName));
          if (!body || (!a.from && !a.pos)) return;
          const dLinks = linkRelsOf(dPath);
          a.items = drawItems(body, { C, url: (rid) => dRels[rid] && mediaUrl(dRels[rid]), link: (rid) => linkOf(dLinks[rid], '') }, null);
          sh.draw.push(a);
        });
      }
      const dim = kid(root, 'dimension');
      sh.range = dim ? parseRange(dim.getAttribute('ref')) : { r1: 1, c1: 1, r2: sh.maxR, c2: sh.maxC };
      if (sh.range.r2 > 1048575) sh.range.r2 = sh.maxR;
      if (sh.range.c2 > 16383) sh.range.c2 = sh.maxC;
      const pa2 = names[sh.idx + ':_xlnm.Print_Area'];
      if (pa2) { sh.range = parseRange(pa2.split(',')[0]); sh.printArea = true; }
      else sh.draw.forEach((a) => { const to = a.to || a.from; if (to) { sh.range.r2 = Math.max(sh.range.r2, to.r); sh.range.c2 = Math.max(sh.range.c2, to.c); sh.range.r1 = Math.min(sh.range.r1, a.from.r); sh.range.c1 = Math.min(sh.range.c1, a.from.c); } });
      if (sh.range.r2 > sh.maxR + 2000) sh.range.r2 = sh.maxR;
      if (sh.range.c2 > sh.maxC + 200) sh.range.c2 = sh.maxC;
    }
    const bv = all(wb, 'workbookView')[0];
    book.activeTab = bv ? +(bv.getAttribute('activeTab') || 0) : 0;
    book.mdw = mdwOf(font0);
    let dm = 0; for (let d = 0; d < 10; d++) dm = Math.max(dm, textW(String(d), font0));
    book.numScale = dm ? Math.max(0.85, Math.min(1.05, book.mdw / dm)) : 1;
    return book;
  }

  /* ── 도형 읽기 ── */
  // 링크 정리: 바깥 주소는 http·https·mailto·tel 만 연다 (www. 는 https 로). '#시트!A1' 은 파일 안 위치
  function linkOf(target, location) {
    let u = String(target || '').trim(), loc = String(location || '').trim();
    if (u.charAt(0) === '#') { loc = u.slice(1); u = ''; }
    if (/^www\./i.test(u)) u = 'https://' + u;
    if (u && /^(https?:|mailto:|tel:)/i.test(u)) return { url: u, loc: '' };
    return loc ? { url: '', loc } : null;
  }
  const linkTitle = (lk, editable) => (lk.tip ? lk.tip + ' · ' : '') + (lk.url ? '누르면 새 창으로 열려요: ' + lk.url : '누르면 ' + lk.loc + ' (으)로 가요') + (editable ? ' (고치려면 Ctrl+누르기)' : '');
  const linkAttrs = (lk, editable) => ` data-link="${esc(lk.url || '')}" data-loc="${esc(lk.loc || '')}" title="${esc(linkTitle(lk, editable))}"`;
  // =HYPERLINK("주소", "이름") 또는 =HYPERLINK(A1, ...) 칸의 링크
  function formulaLink(book, sh, cell) {
    if (!cell || !cell.f || !/^\s*HYPERLINK\s*\(/i.test(cell.f)) return null;
    const s = /^\s*HYPERLINK\s*\(\s*"((?:[^"]|"")*)"/i.exec(cell.f);
    if (s) return linkOf(s[1].replace(/""/g, '"'), '');
    const r = /^\s*HYPERLINK\s*\(\s*\$?([A-Z]{1,3})\$?(\d+)\s*[,)]/i.exec(cell.f);
    if (!r) return null;
    const p = parseRef(r[1].toUpperCase() + r[2]);
    return linkOf(String(book.calc.value(sh, p.r, p.c) || ''), '');
  }
  function drawItems(el, X, grp) {
    const xfrm = (e) => { const x = all(e, 'xfrm')[0]; if (!x) return null; const o = kid(x, 'off'), ex = kid(x, 'ext'), co = kid(x, 'chOff'), ce = kid(x, 'chExt'); return { x: o ? +o.getAttribute('x') : 0, y: o ? +o.getAttribute('y') : 0, cx: ex ? +ex.getAttribute('cx') : 0, cy: ex ? +ex.getAttribute('cy') : 0, rot: +(x.getAttribute('rot') || 0) / 60000, fh: x.getAttribute('flipH') === '1', fv: x.getAttribute('flipV') === '1', chx: co ? +co.getAttribute('x') : 0, chy: co ? +co.getAttribute('y') : 0, chcx: ce ? +ce.getAttribute('cx') : 0, chcy: ce ? +ce.getAttribute('cy') : 0 }; };
    const n = el.localName;
    if (n === 'grpSp') {
      const gx = xfrm(kid(el, 'grpSpPr'));
      return Array.from(el.children).filter((c) => ['pic', 'sp', 'cxnSp', 'grpSp'].includes(c.localName)).flatMap((c) => drawItems(c, X, gx));
    }
    const spPr = kid(el, 'spPr');
    const it = { kind: n, xf: spPr ? xfrm(spPr) : null, grp };
    // 그림·도형에 걸린 링크
    const hl = X.link && all(el, 'hlinkClick')[0];
    if (hl) { const lk = X.link(hl.getAttributeNS(NS_R, 'id') || hl.getAttribute('r:id')); if (lk) it.link = lk; }
    if (it.xf && grp && grp.chcx) {
      const sx = grp.cx / grp.chcx, sy = grp.cy / (grp.chcy || 1);
      it.rel = { x: (it.xf.x - grp.chx) * sx, y: (it.xf.y - grp.chy) * sy, cx: it.xf.cx * sx, cy: it.xf.cy * sy };
    }
    if (n === 'pic') {
      const blip = all(el, 'blip')[0];
      it.src = blip && X.url(blip.getAttributeNS(NS_R, 'embed') || blip.getAttribute('r:embed'));
      const sr = all(el, 'srcRect')[0];
      if (sr) it.crop = ['l', 't', 'r', 'b'].map((k) => +(sr.getAttribute(k) || 0) / 100000);
      return it.src ? [it] : [];
    }
    if (n === 'graphicFrame') { it.chart = true; return [it]; }
    // 도형: 채우기·선·글
    const style = kid(el, 'style');
    const ref = (name) => { const r = kid(style, name); if (!r || r.getAttribute('idx') === '0') return null; return dmlColor(r, X.C); };
    const geo = all(spPr, 'prstGeom')[0];
    it.geom = geo ? geo.getAttribute('prst') : 'rect';
    const sf = kid(spPr, 'solidFill'), nf = kid(spPr, 'noFill'), gfl = kid(spPr, 'gradFill');
    it.fill = nf ? null : sf ? dmlColor(sf, X.C) : gfl ? dmlColor(all(gfl, 'gs')[0], X.C) : n === 'cxnSp' ? null : ref('fillRef');
    const ln = kid(spPr, 'ln');
    it.lw = ln && ln.getAttribute('w') ? +ln.getAttribute('w') / 12700 * 4 / 3 : 1;
    it.line = ln && kid(ln, 'noFill') ? null : ln && kid(ln, 'solidFill') ? dmlColor(kid(ln, 'solidFill'), X.C) : ref('lnRef');
    it.dash = ln && kid(ln, 'prstDash') ? kid(ln, 'prstDash').getAttribute('val') : 'solid';
    const fontRef = kid(style, 'fontRef');
    it.tcolor = fontRef ? dmlColor(fontRef, X.C) : null;
    const tx = kid(el, 'txBody');
    if (tx) {
      const bp = kid(tx, 'bodyPr');
      it.anchor = (bp && bp.getAttribute('anchor')) || 't';
      it.ins = ['lIns', 'tIns', 'rIns', 'bIns'].map((k, i) => (bp && bp.getAttribute(k) != null ? +bp.getAttribute(k) : i % 2 ? 45720 : 91440) / 9525);
      it.vert = bp && /vert/.test(bp.getAttribute('vert') || '') && bp.getAttribute('vert') !== 'horz' ? bp.getAttribute('vert') : null;
      it.paras = kids(tx, 'p').map((p) => {
        const ppr = kid(p, 'pPr');
        const runs = Array.from(p.children).filter((r) => r.localName === 'r' || r.localName === 'br' || r.localName === 'fld').map((r) => {
          if (r.localName === 'br') return { br: true };
          const rp = kid(r, 'rPr');
          return { t: (kid(r, 't') || { textContent: '' }).textContent, sz: rp && rp.getAttribute('sz') ? +rp.getAttribute('sz') / 100 : null, b: rp && rp.getAttribute('b') === '1', i: rp && rp.getAttribute('i') === '1', u: rp && rp.getAttribute('u') && rp.getAttribute('u') !== 'none', color: rp && kid(rp, 'solidFill') ? dmlColor(kid(rp, 'solidFill'), X.C) : null, font: rp && (kid(rp, 'ea') || kid(rp, 'latin')) ? (kid(rp, 'ea') || kid(rp, 'latin')).getAttribute('typeface') : null };
        });
        const end = kid(p, 'endParaRPr');
        return { algn: ppr && ppr.getAttribute('algn') || 'l', runs, sz: end && end.getAttribute('sz') ? +end.getAttribute('sz') / 100 : null };
      });
    }
    return [it];
  }

  /* ── 계산 ── */
  function makeCalc(book) {
    let memo = new Map(), busy = new Set();
    const missing = new Set();
    const byName = (n) => { n = String(n).toLowerCase(); return book.sheets.find((s) => s.name.toLowerCase() === n); };
    const parsed = new Map();
    const KEEP = { keep: true };
    let ctx = { arr: false, r: 0, c: 0 };
    const astOf = (f) => { let a = parsed.get(f); if (!a) { a = parseFormula(f); parsed.set(f, a); } return a; };
    const mk = (s2, g) => ({ range: true, sh: s2, r1: g.r1, c1: g.c1, r2: Math.max(g.r1, Math.min(g.r2, s2.maxR)), c2: Math.max(g.c1, Math.min(g.c2, s2.maxC)), rows: g.r2 - g.r1 + 1, cols: g.c2 - g.c1 + 1 });
    function cellValue(sh, r, c) {
      const key = sh.idx + ':' + r + ':' + c;
      if (memo.has(key)) return memo.get(key);
      const cell = sh.cells[colName(c) + r];
      if (!cell) { memo.set(key, null); return null; }
      if (!cell.f) { memo.set(key, cell.v); return cell.v; }
      if (busy.has(key)) return cell.orig != null ? cell.orig : 0;   // 순환 참조: 저장된 값
      busy.add(key);
      const save = ctx; ctx = { arr: !!cell.arr, r, c };
      let v;
      try {
        v = fin(ev(astOf(cell.f), sh));
        // 웹에서 모르는 함수: 엑셀이 저장해 둔 값을 보여 준다
        if (isErr(v) && v.err === '#NAME?' && missing.size && cell.orig != null) v = cell.orig;
      } catch (e) { v = cell.orig != null ? cell.orig : cell.v; }
      ctx = save; busy.delete(key);
      memo.set(key, v);
      return v;
    }
    // 수식 결과: 범위는 엑셀처럼 같은 행/열과 겹치는 칸 하나 (배열 수식은 첫 칸)
    function fin(v) {
      if (v && v.range) v = ctx.arr ? cellValue(v.sh, v.r1, v.c1) : isect(v);
      if (v && v.arr) v = v.arr[0][0];
      if (v && v.range) v = cellValue(v.sh, v.r1, v.c1);
      return v == null ? 0 : v;
    }
    function isect(g) {
      if (g.r1 === g.r2 && g.c1 === g.c2) return cellValue(g.sh, g.r1, g.c1);
      if (g.c1 === g.c2 && ctx.r >= g.r1 && ctx.r <= g.r1 + g.rows - 1) return cellValue(g.sh, ctx.r, g.c1);
      if (g.r1 === g.r2 && ctx.c >= g.c1 && ctx.c <= g.c1 + g.cols - 1) return cellValue(g.sh, g.r1, ctx.c);
      return ERR('#VALUE!');
    }
    const rangeFirst = (g) => cellValue(g.sh, g.r1, g.c1);
    function rangeVals(g) { const out = []; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) out.push(cellValue(g.sh, r, c)); return out; }
    const isMat = (v) => v && (v.arr || (v.range && !(v.r1 === v.r2 && v.c1 === v.c2)));
    function toMat(v) {
      if (v && v.arr) return v.arr;
      if (v && v.range) { const m = []; for (let r = v.r1; r <= v.r2; r++) { const row = []; for (let c = v.c1; c <= v.c2; c++) row.push(cellValue(v.sh, r, c)); m.push(row); } return m; }
      return [[v]];
    }
    function mapN(vals, f) {
      const ms = vals.map(toMat);
      const R = Math.max(...ms.map((m) => m.length)), Cc = Math.max(...ms.map((m) => m[0].length));
      const out = [];
      for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < Cc; j++) row.push(f(ms.map((m) => { const rr = m.length === 1 ? 0 : i, cc = m[0].length === 1 ? 0 : j; return m[rr] && m[rr][cc] !== undefined ? m[rr][cc] : ERR('#N/A'); }))); out.push(row); }
      return { arr: out };
    }
    function resolveName(n, sh) {
      const d = book.names[sh.idx + ':' + n] || book.names[n] || book.names[sh.idx + ':' + n.toUpperCase()] || book.names[n.toUpperCase()];
      if (d == null) return ERR('#NAME?');
      const m = /^(?:'((?:[^']|'')+)'|([^!'(]+))!(\$?[A-Z]+\$?\d*(?::\$?[A-Z]+\$?\d*)?|\$?\d+:\$?\d+)$/.exec(d.trim());
      if (m) { const s2 = byName((m[1] || m[2]).replace(/''/g, "'")); if (!s2) return ERR('#REF!'); const g = parseRange(m[3]); return g.r1 === g.r2 && g.c1 === g.c2 && !m[3].includes(':') ? cellValue(s2, g.r1, g.c1) : mk(s2, g); }
      try { return ev(astOf(d), sh); } catch (e) { return ERR('#NAME?'); }
    }
    const scal = (v) => { if (v && v.range) v = isect(v); if (v && v.arr) v = v.arr[0][0]; return v; };
    const num = (v) => { v = scal(v); if (isErr(v)) throw v; if (v == null || v === '') return 0; if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v === 'number') return v; const n = textNum(v); if (n == null) throw ERR('#VALUE!'); return n; };
    const str = (v) => { v = scal(v); if (isErr(v)) throw v; if (v == null) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (typeof v === 'number') return numStr(v); return String(v); };
    const truthy = (v) => { v = scal(v); if (isErr(v)) throw v; if (typeof v === 'string') { if (/^true$/i.test(v)) return true; if (/^false$/i.test(v)) return false; throw ERR('#VALUE!'); } return !!v; };
    // 글자 → 숫자 ("1,234", "50%", "₩1,000", "2026-03-02", "13:30")
    function textNum(s) {
      s = String(s).trim(); if (!s) return null;
      let t = s.replace(/^[₩$]|원$/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
      let neg = false; if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
      if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(t)) { let n = parseFloat(t); if (t.endsWith('%')) n /= 100; return neg ? -n : n; }
      const d = parseDate(s); if (d != null) return d;
      const tm = parseTime(s); if (tm != null) return tm;
      const dt = /^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)$/i.exec(s);
      if (dt && parseDate(dt[1]) != null && parseTime(dt[2]) != null) return parseDate(dt[1]) + parseTime(dt[2]);
      return null;
    }
    const tyRank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
    function cmp(a, b) {
      a = scal(a); b = scal(b);
      if (isErr(a)) throw a; if (isErr(b)) throw b;
      if (a == null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
      if (b == null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
      if (typeof a !== typeof b) return tyRank(a) - tyRank(b);
      if (typeof a === 'string') { a = a.toLowerCase(); b = b.toLowerCase(); }
      else if (typeof a === 'number') { a = Number(a.toPrecision(15)); b = Number(b.toPrecision(15)); }
      return a < b ? -1 : a > b ? 1 : 0;
    }
    function binop(o, a, b) {
      try {
        switch (o) {
          case '+': case '-': { const x = num(a), y = num(b); const r = o === '+' ? x + y : x - y; return r !== 0 && Math.abs(r) < Math.max(Math.abs(x), Math.abs(y)) * 1e-15 ? 0 : r; }
          case '*': return num(a) * num(b);
          case '/': { const x = num(a), d = num(b); if (d === 0) return ERR('#DIV/0!'); return x / d; }
          case '^': { const r = Math.pow(num(a), num(b)); return isFinite(r) ? r : ERR('#NUM!'); }
          case '&': return str(a) + str(b);
          case '=': return cmp(a, b) === 0; case '<>': return cmp(a, b) !== 0; case '<': return cmp(a, b) < 0;
          case '>': return cmp(a, b) > 0; case '<=': return cmp(a, b) <= 0; case '>=': return cmp(a, b) >= 0;
        }
      } catch (e) { return isErr(e) ? e : ERR('#VALUE!'); }
      return ERR('#VALUE!');
    }
    function ev(n, sh) {
      switch (n.k) {
        case 'v': return n.v;
        case 'ref': {
          const s2 = n.sheet ? byName(n.sheet) : sh; if (!s2) return ERR('#REF!');
          const g = parseRange(n.ref);
          if (g.r1 === g.r2 && g.c1 === g.c2 && !n.ref.includes(':')) return cellValue(s2, g.r1, g.c1);
          return mk(s2, g);
        }
        case 'name': return resolveName(n.v, sh);
        case 'neg': { const a = ev(n.a, sh); if (isMat(a) && (ctx.arr || a.arr)) return mapN([a], ([x]) => binop('-', 0, x)); return binop('-', 0, a); }
        case 'pct': { const a = ev(n.a, sh); if (isMat(a) && (ctx.arr || a.arr)) return mapN([a], ([x]) => binop('/', x, 100)); return binop('/', a, 100); }
        case 'bin': {
          const a = ev(n.a, sh), b = ev(n.b, sh);
          if ((isMat(a) || isMat(b)) && (ctx.arr || (a && a.arr) || (b && b.arr))) return mapN([a, b], ([x, y]) => binop(n.o, x, y));
          return binop(n.o, a, b);
        }
        case 'fn': return fn(n.f, n.args, sh);
      }
      return ERR('#VALUE!');
    }
    const withArr = (f) => { const save = ctx; ctx = Object.assign({}, ctx, { arr: true }); try { return f(); } finally { ctx = save; } };
    // 소수 반올림 (15자리 기준, 0.5 는 0 에서 먼 쪽으로)
    const round = (x, d, mode) => {
      const p = Math.pow(10, d), y = Number((Math.abs(x) * p).toPrecision(15));
      const r = mode === 'down' ? Math.floor(y) : mode === 'up' ? Math.ceil(y) : Math.floor(y + 0.5);
      return (x < 0 ? -r : r) / p;
    };
    const LIFT = new Set(['IF', 'ABS', 'INT', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'LEN', 'LEFT', 'RIGHT', 'MID', 'ISBLANK', 'ISNUMBER', 'ISTEXT', 'ISERROR', 'ISERR', 'ISNA', 'NOT', 'VALUE', 'UPPER', 'LOWER', 'TRIM', 'N', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'MOD', 'IFERROR', 'EXACT', 'SIGN', 'TEXT', 'SQRT', 'POWER', 'DATE', 'ISEVEN', 'ISODD', 'SEARCH', 'FIND', 'SUBSTITUTE', 'CHOOSE']);
    const stats = (xs) => { const n = xs.length, m = sum(xs) / n; return { n, m, ss: xs.reduce((s, x) => s + (x - m) * (x - m), 0) }; };
    function pctile(xs, k, exc) {
      xs = xs.slice().sort((a, b) => a - b); const n = xs.length; if (!n) throw ERR('#NUM!');
      const h = exc ? k * (n + 1) - 1 : k * (n - 1);
      if (h < 0 || h > n - 1 || k < 0 || k > 1) throw ERR('#NUM!');
      const lo = Math.floor(h); return xs[lo] + (h - lo) * ((xs[lo + 1] ?? xs[lo]) - xs[lo]);
    }
    const wild = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i');
    const eqLook = (v, look) => { if (typeof look === 'string' && typeof v === 'string' && /[*?]/.test(look)) return wild(look).test(v); return v != null && v !== '' && cmp(v, look) === 0 || (v == null && look === ''); };
    // 근사 찾기: 엑셀과 같은 이분 탐색 (정렬되지 않은 자료에서도 같은 결과)
    function bsearch(vals, look, desc) {
      let lo = 0, hi = vals.length - 1, res = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1; let v = vals[mid];
        let k = mid; while (v == null && k > lo) v = vals[--k];
        if (v == null || isErr(v) || tyRank(v) !== tyRank(look)) { hi = mid - 1; continue; }
        const c = cmp(v, look);
        if (c === 0) { while (k + 1 < vals.length && vals[k + 1] != null && tyRank(vals[k + 1]) === tyRank(look) && cmp(vals[k + 1], look) === 0) k++; return k; }
        if (desc ? c > 0 : c < 0) { res = k; lo = mid + 1; } else hi = mid - 1;
      }
      return res;
    }
    function fn(f, args, sh) {
      const a = (i) => ev(args[i] || { k: 'v', v: null }, sh);
      const has = (i) => args[i] && !args[i].empty;
      const rg = (i) => { const n = args[i]; if (n && n.k === 'ref') { const s2 = n.sheet ? byName(n.sheet) : sh; if (!s2) throw ERR('#REF!'); return mk(s2, parseRange(n.ref)); } const v = a(i); if (v && v.range) return v; if (isErr(v)) throw v; throw ERR('#VALUE!'); };
      const vals = (i) => { const v = a(i); return v && v.range ? rangeVals(v) : v && v.arr ? v.arr.flat() : [v]; };
      // 숫자 모으기: 범위 안 글자·논리값은 건너뛰고, 직접 쓴 값은 숫자로 바꾼다
      const nums = (list, opt = {}) => {
        const out = [];
        list.forEach((nd) => {
          const v = ev(nd, sh);
          if (v && (v.range || v.arr)) {
            const src = v.range ? (opt.sub ? (() => { const o = []; for (let r = v.r1; r <= v.r2; r++) { if (opt.hid && (v.sh.rows[r] || {}).hidden) continue; for (let c = v.c1; c <= v.c2; c++) { const ce = v.sh.cells[colName(c) + r]; if (ce && ce.f && /^\s*(_xlfn\.)?(SUBTOTAL|AGGREGATE)\(/i.test(ce.f)) continue; o.push(cellValue(v.sh, r, c)); } } return o; })() : rangeVals(v)) : v.arr.flat();
            src.forEach((x) => { if (isErr(x)) { if (!opt.skipErr) throw x; } else if (typeof x === 'number') out.push(x); else if (opt.a && x != null && x !== '') out.push(typeof x === 'boolean' ? +x : 0); });
          } else if (v != null && !(nd.empty)) { if (isErr(v)) { if (!opt.skipErr) throw v; } else out.push(num(v)); }
        });
        return out;
      };
      const multiIdx = (from) => {
        let idx = null;
        for (let i = from; i + 1 < args.length; i += 2) {
          const ok = rangeVals(rg(i)).map((x) => match(x, a(i + 1)));
          idx = idx ? idx.filter((k) => ok[k]) : ok.map((b, k) => (b ? k : -1)).filter((k) => k >= 0);
        }
        return idx || [];
      };
      if (ctx.arr && LIFT.has(f)) {
        const vs = args.map((x) => (x.empty ? null : ev(x, sh)));
        if (vs.some(isMat)) return mapN(vs, (xs) => fn(f, xs.map((x, i) => (args[i].empty ? args[i] : { k: 'v', v: x })), sh));
      }
      try {
        switch (f) {
          case 'IF': { const c = a(0); if (isErr(scal(c))) return scal(c); return truthy(c) ? (has(1) ? a(1) : args[1] ? 0 : true) : (args[2] ? (has(2) ? a(2) : 0) : false); }
          case 'IFERROR': { const v = a(0); const r = scal(v); return isErr(r) ? a(1) : v; }
          case 'IFNA': { const v = a(0); const r = scal(v); return isErr(r) && r.err === '#N/A' ? a(1) : v; }
          case 'AND': case 'OR': case 'XOR': {
            const bs = []; args.forEach((nd, i) => { const v = a(i); (v && (v.range || v.arr) ? (v.range ? rangeVals(v) : v.arr.flat()).filter((x) => typeof x === 'boolean' || typeof x === 'number' || isErr(x)) : [v]).forEach((x) => bs.push(truthy(x))); });
            if (!bs.length) return ERR('#VALUE!');
            return f === 'AND' ? bs.every(Boolean) : f === 'OR' ? bs.some(Boolean) : bs.filter(Boolean).length % 2 === 1;
          }
          case 'NOT': return !truthy(a(0));
          case 'SUM': return sum(nums(args));
          case 'SUMSQ': return sum(nums(args).map((x) => x * x));
          case 'MIN': case 'MAX': { const xs = nums(args); return xs.length ? (f === 'MIN' ? Math.min(...xs) : Math.max(...xs)) : 0; }
          case 'MINA': case 'MAXA': { const xs = nums(args, { a: true }); return xs.length ? (f === 'MINA' ? Math.min(...xs) : Math.max(...xs)) : 0; }
          case 'AVERAGE': case 'AVERAGEA': { const xs = nums(args, { a: f === 'AVERAGEA' }); return xs.length ? sum(xs) / xs.length : ERR('#DIV/0!'); }
          case 'COUNT': return args.reduce((t, nd, i) => { const v = a(i); return t + (v && (v.range || v.arr) ? (v.range ? rangeVals(v) : v.arr.flat()).filter((x) => typeof x === 'number').length : typeof v === 'number' || (typeof v === 'string' && textNum(v) != null) || typeof v === 'boolean' ? 1 : 0); }, 0);
          case 'COUNTA': return args.reduce((t, nd, i) => { const v = a(i); return t + (v && (v.range || v.arr) ? (v.range ? rangeVals(v) : v.arr.flat()).filter((x) => x != null && x !== '' || (x === '' && false)).length + (v.range ? rangeVals(v).filter((x, k) => x === '').length : 0) : nd.empty ? 0 : 1); }, 0);
          case 'COUNTBLANK': return vals(0).filter((v) => v == null || v === '').length;
          case 'PRODUCT': { const xs = nums(args); return xs.length ? xs.reduce((t, v) => t * v, 1) : 0; }
          case 'STDEV': case 'STDEV.S': case 'STDEVA': case 'VAR': case 'VAR.S': case 'VARA': case 'STDEV.P': case 'STDEVP': case 'VAR.P': case 'VARP': {
            const xs = nums(args, { a: /A$/.test(f) }); const p = /P$/.test(f); const { n, ss } = stats(xs);
            if (n - (p ? 0 : 1) <= 0) return ERR('#DIV/0!');
            const v = ss / (n - (p ? 0 : 1)); return /^STDEV/.test(f) ? Math.sqrt(v) : v;
          }
          case 'MODE': case 'MODE.SNGL': { const xs = nums(args); const cnt = new Map(); let best = null, bc = 1; xs.forEach((x) => { const c = (cnt.get(x) || 0) + 1; cnt.set(x, c); if (c > bc || (c === bc && best !== null && c > 1 && xs.indexOf(x) < xs.indexOf(best))) { bc = c; best = x; } }); return best == null ? ERR('#N/A') : best; }
          case 'MEDIAN': { const xs = nums(args).sort((p, q) => p - q); if (!xs.length) return ERR('#NUM!'); const h = xs.length >> 1; return xs.length % 2 ? xs[h] : (xs[h - 1] + xs[h]) / 2; }
          case 'PERCENTILE': case 'PERCENTILE.INC': case 'PERCENTILE.EXC': return pctile(nums([args[0]]), num(a(1)), f === 'PERCENTILE.EXC');
          case 'QUARTILE': case 'QUARTILE.INC': case 'QUARTILE.EXC': { const q = Math.trunc(num(a(1))); if (q < 0 || q > 4) return ERR('#NUM!'); return pctile(nums([args[0]]), q / 4, f === 'QUARTILE.EXC'); }
          case 'PERCENTRANK': case 'PERCENTRANK.INC': {
            const xs = nums([args[0]]).sort((p, q) => p - q), x = num(a(1)), sig = has(2) ? num(a(2)) : 3, n = xs.length;
            if (!n || x < xs[0] || x > xs[n - 1]) return ERR('#N/A');
            let r; const lo = xs.filter((v) => v < x).length;
            if (xs.includes(x)) r = lo / (n - 1); else { const a1 = xs[lo - 1], b1 = xs[lo]; r = (lo - 1 + (x - a1) / (b1 - a1)) / (n - 1); }
            const p = Math.pow(10, sig); return Math.floor(Number((r * p).toPrecision(15))) / p;
          }
          case 'LARGE': case 'SMALL': { const xs = nums([args[0]]).sort((p, q) => (f === 'LARGE' ? q - p : p - q)); const k = Math.ceil(num(a(1)) - 1e-9); return k >= 1 && k <= xs.length ? xs[k - 1] : ERR('#NUM!'); }
          case 'RANK': case 'RANK.EQ': case 'RANK.AVG': {
            const x = num(a(0)); const xs = rangeVals(rg(1)).filter((v) => typeof v === 'number'); const asc = has(2) && num(a(2)) !== 0;
            if (!xs.some((v) => cmp(v, x) === 0)) return ERR('#N/A');
            const better = xs.filter((v) => (asc ? v < x : v > x)).length + 1;
            if (f !== 'RANK.AVG') return better;
            const ties = xs.filter((v) => cmp(v, x) === 0).length; return better + (ties - 1) / 2;
          }
          case 'SUBTOTAL': case 'AGGREGATE': {
            let k = Math.trunc(num(a(0))); const hid = f === 'SUBTOTAL' ? k > 100 : true; k = k % 100;
            const opt = f === 'AGGREGATE' ? Math.trunc(num(a(1))) : 0;
            const list = f === 'AGGREGATE' ? [args[2]] : args.slice(1);
            const xs = nums(list, { sub: true, hid: f === 'SUBTOTAL' ? hid : opt % 2 === 1 || opt === 3 || opt === 5 || opt === 7, skipErr: f === 'AGGREGATE' && [2, 3, 6, 7].includes(opt) });
            const st2 = stats(xs);
            switch (k) {
              case 1: return xs.length ? st2.m : ERR('#DIV/0!'); case 2: return xs.length; case 3: return xs.length;
              case 4: return xs.length ? Math.max(...xs) : 0; case 5: return xs.length ? Math.min(...xs) : 0; case 6: return xs.reduce((t, v) => t * v, 1);
              case 7: return xs.length > 1 ? Math.sqrt(st2.ss / (xs.length - 1)) : ERR('#DIV/0!'); case 8: return xs.length ? Math.sqrt(st2.ss / xs.length) : ERR('#DIV/0!');
              case 9: return sum(xs); case 10: return xs.length > 1 ? st2.ss / (xs.length - 1) : ERR('#DIV/0!'); case 11: return xs.length ? st2.ss / xs.length : ERR('#DIV/0!');
              case 12: { const s2 = xs.slice().sort((p, q) => p - q), h = s2.length >> 1; return s2.length ? (s2.length % 2 ? s2[h] : (s2[h - 1] + s2[h]) / 2) : ERR('#NUM!'); }
              case 13: return fn('MODE', [{ k: 'v', v: { arr: [xs] } }], sh);
              case 14: case 15: { const s2 = xs.slice().sort((p, q) => (k === 14 ? q - p : p - q)); const kk = num(a(3)); return s2[kk - 1] ?? ERR('#NUM!'); }
              case 16: return pctile(xs, num(a(3))); case 17: return pctile(xs, num(a(3)) / 4);
            }
            return ERR('#VALUE!');
          }
          case 'ROUND': return round(num(a(0)), Math.trunc(num(a(1))));
          case 'ROUNDDOWN': return round(num(a(0)), Math.trunc(num(a(1))), 'down');
          case 'ROUNDUP': return round(num(a(0)), Math.trunc(num(a(1))), 'up');
          case 'TRUNC': return round(num(a(0)), has(1) ? Math.trunc(num(a(1))) : 0, 'down');
          case 'INT': return Math.floor(Number(num(a(0)).toPrecision(15)));
          case 'MROUND': { const x = num(a(0)), m = num(a(1)); if (m === 0) return 0; if (x * m < 0) return ERR('#NUM!'); return round(x / m, 0) * m; }
          case 'ABS': return Math.abs(num(a(0)));
          case 'QUOTIENT': { const d = num(a(1)); if (d === 0) return ERR('#DIV/0!'); return Math.trunc(num(a(0)) / d); }
          case 'MOD': { const d = num(a(1)); if (d === 0) return ERR('#DIV/0!'); const x = num(a(0)); const r = x - d * Math.floor(x / d); return Math.abs(r - d) < 1e-12 * Math.abs(d) ? 0 : r; }
          case 'POWER': { const r = Math.pow(num(a(0)), num(a(1))); return isFinite(r) && !isNaN(r) ? r : ERR('#NUM!'); }
          case 'SQRT': { const x = num(a(0)); return x < 0 ? ERR('#NUM!') : Math.sqrt(x); }
          case 'EXP': return Math.exp(num(a(0)));
          case 'LN': { const x = num(a(0)); return x <= 0 ? ERR('#NUM!') : Math.log(x); }
          case 'LOG10': { const x = num(a(0)); return x <= 0 ? ERR('#NUM!') : Math.log10(x); }
          case 'LOG': { const x = num(a(0)), b = has(1) ? num(a(1)) : 10; return x <= 0 || b <= 0 || b === 1 ? ERR('#NUM!') : Math.log(x) / Math.log(b); }
          case 'SIN': return Math.sin(num(a(0))); case 'COS': return Math.cos(num(a(0))); case 'TAN': return Math.tan(num(a(0)));
          case 'ASIN': return Math.asin(num(a(0))); case 'ACOS': return Math.acos(num(a(0))); case 'ATAN': return Math.atan(num(a(0)));
          case 'ATAN2': return Math.atan2(num(a(1)), num(a(0)));
          case 'DEGREES': return num(a(0)) * 180 / Math.PI; case 'RADIANS': return num(a(0)) * Math.PI / 180;
          case 'PI': return Math.PI;
          case 'SIGN': { const x = num(a(0)); return x > 0 ? 1 : x < 0 ? -1 : 0; }
          case 'FACT': { const x = Math.trunc(num(a(0))); if (x < 0) return ERR('#NUM!'); let r = 1; for (let i = 2; i <= x; i++) r *= i; return r; }
          case 'COMBIN': case 'PERMUT': { const n = Math.trunc(num(a(0))), k = Math.trunc(num(a(1))); if (k < 0 || n < k) return ERR('#NUM!'); let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (f === 'COMBIN' ? i + 1 : 1); return Math.round(r); }
          case 'GCD': case 'LCM': { const xs = nums(args).map(Math.trunc); const g2 = (p, q) => (q ? g2(q, p % q) : p); if (xs.some((x) => x < 0)) return ERR('#NUM!'); return f === 'GCD' ? xs.reduce(g2, 0) : xs.reduce((p, q) => (p && q ? p / g2(p, q) * q : 0), 1); }
          case 'EVEN': case 'ODD': { const x = num(a(0)), s = x < 0 ? -1 : 1; let r = Math.ceil(Math.abs(x) - 1e-12); if (f === 'EVEN' ? r % 2 : r % 2 === 0) r++; return s * r; }
          case 'CEILING': case 'CEILING.MATH': case 'CEILING.PRECISE': { const x = num(a(0)), g = has(1) ? num(a(1)) : 1; if (g === 0) return 0; if (f === 'CEILING' && x > 0 && g < 0) return ERR('#NUM!'); const ag = Math.abs(g); return Math.ceil(Number((x / ag).toPrecision(15))) * ag; }
          case 'FLOOR': case 'FLOOR.MATH': case 'FLOOR.PRECISE': { const x = num(a(0)), g = has(1) ? num(a(1)) : 1; if (g === 0) return f === 'FLOOR' ? ERR('#DIV/0!') : 0; if (f === 'FLOOR' && x > 0 && g < 0) return ERR('#NUM!'); const ag = Math.abs(g); return Math.floor(Number((x / ag).toPrecision(15))) * ag; }
          case 'RAND': case 'RANDBETWEEN': case 'RANDARRAY': throw KEEP;
          case 'SUMPRODUCT': {
            const ms = withArr(() => args.map((nd) => toMat(ev(nd, sh))));
            const R = ms[0].length, Cc = ms[0][0].length;
            if (ms.some((m) => m.length !== R || m[0].length !== Cc)) return ERR('#VALUE!');
            let t = 0;
            for (let i = 0; i < R; i++) for (let j = 0; j < Cc; j++) { let p = 1; for (const m of ms) { const v = m[i][j]; if (isErr(v)) throw v; p *= typeof v === 'number' ? v : 0; } t += p; }
            return t;
          }
          /* ── 조건 집계 ── */
          case 'SUMIF': { const r = rg(0), c = a(1), sr = has(2) ? rg(2) : r; return rangeVals(r).reduce((t, x, i) => (match(x, c) ? t + n0(at(sr, i, r)) : t), 0); }
          case 'COUNTIF': { const r = rg(0), c = a(1); return rangeVals(r).filter((x) => match(x, c)).length; }
          case 'AVERAGEIF': { const r = rg(0), c = a(1), sr = has(2) ? rg(2) : r; const xs = []; rangeVals(r).forEach((x, i) => { if (match(x, c)) { const y = at(sr, i, r); if (typeof y === 'number') xs.push(y); } }); return xs.length ? sum(xs) / xs.length : ERR('#DIV/0!'); }
          case 'SUMIFS': case 'AVERAGEIFS': case 'MAXIFS': case 'MINIFS': {
            const sr = rg(0), idx = multiIdx(1);
            const ys = idx.map((i) => at(sr, i, sr)).filter((y) => typeof y === 'number');
            if (f === 'SUMIFS') return sum(ys);
            if (f === 'AVERAGEIFS') return ys.length ? sum(ys) / ys.length : ERR('#DIV/0!');
            return ys.length ? (f === 'MAXIFS' ? Math.max(...ys) : Math.min(...ys)) : 0;
          }
          case 'COUNTIFS': return multiIdx(0).length;
          /* ── 찾기 ── */
          case 'VLOOKUP': case 'HLOOKUP': {
            const look = scal(a(0)); if (isErr(look)) return look;
            const t = rg(1), k = Math.trunc(num(a(2))), approx = has(3) ? truthy(a(3)) : true, V = f === 'VLOOKUP';
            const keys = []; if (V) for (let r = t.r1; r <= t.r2; r++) keys.push(cellValue(t.sh, r, t.c1)); else for (let c = t.c1; c <= t.c2; c++) keys.push(cellValue(t.sh, t.r1, c));
            if (k < 1) return ERR('#VALUE!'); if (k > (V ? t.cols : t.rows)) return ERR('#REF!');
            const hit = approx ? bsearch(keys, look) : keys.findIndex((v) => eqLook(v, look));
            if (hit < 0) return ERR('#N/A');
            return V ? cellValue(t.sh, t.r1 + hit, t.c1 + k - 1) : cellValue(t.sh, t.r1 + k - 1, t.c1 + hit);
          }
          case 'LOOKUP': {
            const look = scal(a(0)); const v1 = a(1);
            let keys, res;
            if (has(2)) { keys = v1.range ? rangeVals(v1) : toMat(v1).flat(); const r2 = a(2); res = r2.range ? rangeVals(r2) : toMat(r2).flat(); }
            else { const m = toMat(v1); const wide = m[0].length > m.length; keys = wide ? m[0] : m.map((r) => r[0]); res = wide ? m[m.length - 1] : m.map((r) => r[r.length - 1]); }
            const i = bsearch(keys, look); return i < 0 ? ERR('#N/A') : res[i] ?? ERR('#N/A');
          }
          case 'XLOOKUP': {
            const look = scal(a(0)), lr = rg(1), rr = rg(2); const vs = rangeVals(lr);
            const i = vs.findIndex((v) => eqLook(v, look));
            if (i < 0) return has(3) ? a(3) : ERR('#N/A');
            return lr.r1 === lr.r2 ? (rr.r1 === rr.r2 ? cellValue(rr.sh, rr.r1, rr.c1 + i) : mk(rr.sh, { r1: rr.r1, r2: rr.r2, c1: rr.c1 + i, c2: rr.c1 + i })) : (rr.c1 === rr.c2 ? cellValue(rr.sh, rr.r1 + i, rr.c1) : mk(rr.sh, { r1: rr.r1 + i, r2: rr.r1 + i, c1: rr.c1, c2: rr.c2 }));
          }
          case 'MATCH': {
            const look = scal(a(0)), v1 = a(1), type = has(2) ? num(a(2)) : 1;
            const vs = v1 && v1.range ? rangeVals(v1) : toMat(v1).flat();
            if (type === 0) { const i = vs.findIndex((v) => eqLook(v, look)); return i < 0 ? ERR('#N/A') : i + 1; }
            const i = bsearch(vs, look, type < 0); return i < 0 ? ERR('#N/A') : i + 1;
          }
          case 'INDEX': {
            const g = a(0); if (isErr(g)) return g;
            let r = has(1) ? Math.trunc(num(a(1))) : 0, c = has(2) ? Math.trunc(num(a(2))) : 0;
            if (g && g.arr) { const m = g.arr; if (m.length === 1 && !has(2)) { c = r; r = 1; } const row = m[(r || 1) - 1]; return row ? row[(c || 1) - 1] ?? ERR('#REF!') : ERR('#REF!'); }
            if (!g || !g.range) return g;
            if (g.r1 === g.r2 && !has(2)) { c = r; r = 1; }
            if (r < 0 || c < 0 || g.r1 + r - 1 > g.r2 || g.c1 + c - 1 > g.c2) return ERR('#REF!');
            if (r === 0 && c === 0) return g;
            if (r === 0) return mk(g.sh, { r1: g.r1, r2: g.r2, c1: g.c1 + c - 1, c2: g.c1 + c - 1 });
            if (c === 0 && g.c1 !== g.c2) return mk(g.sh, { r1: g.r1 + r - 1, r2: g.r1 + r - 1, c1: g.c1, c2: g.c2 });
            return cellValue(g.sh, g.r1 + r - 1, g.c1 + Math.max(1, c) - 1);
          }
          case 'CHOOSE': { const i = Math.trunc(num(a(0))); return i >= 1 && i < args.length ? a(i) : ERR('#VALUE!'); }
          case 'IFS': { for (let i = 0; i + 1 < args.length; i += 2) if (truthy(a(i))) return a(i + 1); return ERR('#N/A'); }
          case 'SWITCH': { const v = a(0); let i = 1; for (; i + 1 < args.length; i += 2) if (cmp(v, a(i)) === 0) return a(i + 1); return i < args.length ? a(i) : ERR('#N/A'); }
          case 'ROW': return has(0) ? rg(0).r1 : ctx.r;
          case 'COLUMN': return has(0) ? rg(0).c1 : ctx.c;
          case 'ROWS': { const v = a(0); return v && v.range ? v.rows : v && v.arr ? v.arr.length : 1; }
          case 'COLUMNS': { const v = a(0); return v && v.range ? v.cols : v && v.arr ? v.arr[0].length : 1; }
          case 'OFFSET': {
            const r = rg(0), dr = Math.trunc(num(a(1))), dc = Math.trunc(num(a(2)));
            const h = has(3) ? Math.trunc(num(a(3))) : r.rows, w = has(4) ? Math.trunc(num(a(4))) : r.cols;
            if (r.r1 + dr < 1 || r.c1 + dc < 1 || h < 1 || w < 1) return ERR('#REF!');
            const o = { r1: r.r1 + dr, c1: r.c1 + dc, r2: r.r1 + dr + h - 1, c2: r.c1 + dc + w - 1 };
            return h === 1 && w === 1 ? cellValue(r.sh, o.r1, o.c1) : mk(r.sh, o);
          }
          case 'INDIRECT': {
            const t = str(a(0)).trim(); const m = /^(?:'?([^'!]+)'?!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)$/i.exec(t);
            if (!m) { const nv = resolveName(t, sh); return isErr(nv) ? ERR('#REF!') : nv; }
            const s2 = m[1] ? byName(m[1]) : sh; if (!s2) return ERR('#REF!'); const r = parseRange(m[2].toUpperCase());
            return r.r1 === r.r2 && r.c1 === r.c2 ? cellValue(s2, r.r1, r.c1) : mk(s2, r);
          }
          case 'ADDRESS': {
            const r = Math.trunc(num(a(0))), c = Math.trunc(num(a(1))), t = has(2) ? Math.trunc(num(a(2))) : 1, a1 = has(3) ? truthy(a(3)) : true;
            const s = a1 ? (t === 1 || t === 3 ? '$' : '') + colName(c) + (t === 1 || t === 2 ? '$' : '') + r : 'R' + (t === 1 || t === 2 ? r : '[' + r + ']') + 'C' + (t === 1 || t === 3 ? c : '[' + c + ']');
            return has(4) ? (/[^A-Za-z0-9_.\u3131-\uD79D]/.test(str(a(4))) ? "'" + str(a(4)) + "'" : str(a(4))) + '!' + s : s;
          }
          /* ── 글자 ── */
          case 'LEN': return str(a(0)).length;
          case 'LENB': return str(a(0)).split('').reduce((t, ch) => t + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
          case 'CONCATENATE': return args.map((_, i) => str(a(i))).join('');
          case 'CONCAT': return args.map((_, i) => vals(i).map((v) => str(v)).join('')).join('');
          case 'LEFT': return str(a(0)).slice(0, has(1) ? num(a(1)) : 1);
          case 'RIGHT': { const s = str(a(0)), n = has(1) ? num(a(1)) : 1; return n <= 0 ? '' : s.slice(-n); }
          case 'MID': { const s0 = num(a(1)); if (s0 < 1) return ERR('#VALUE!'); return str(a(0)).substr(s0 - 1, num(a(2))); }
          case 'TRIM': return str(a(0)).replace(/ +/g, ' ').trim();
          case 'CLEAN': return str(a(0)).replace(/[\x00-\x1f]/g, '');
          case 'UPPER': return str(a(0)).toUpperCase();
          case 'LOWER': return str(a(0)).toLowerCase();
          case 'PROPER': return str(a(0)).toLowerCase().replace(/(^|[^a-zA-Z\u00C0-\u024F])([a-z\u00E0-\u024F])/g, (m, p, ch) => p + ch.toUpperCase());
          case 'SUBSTITUTE': { const t = str(a(0)), o = str(a(1)), nw = str(a(2)); if (!o) return t; if (has(3)) { const k = num(a(3)); let i = -1; for (let j = 0; j < k; j++) { i = t.indexOf(o, i + 1); if (i < 0) return t; } return t.slice(0, i) + nw + t.slice(i + o.length); } return t.split(o).join(nw); }
          case 'REPLACE': { const t = str(a(0)), s0 = num(a(1)), n = num(a(2)); return t.slice(0, s0 - 1) + str(a(3)) + t.slice(s0 - 1 + n); }
          case 'FIND': case 'SEARCH': {
            const q = str(a(0)), t = str(a(1)), st0 = has(2) ? num(a(2)) : 1;
            if (st0 < 1 || st0 > t.length + 1) return ERR('#VALUE!');
            let i;
            if (f === 'FIND') i = t.indexOf(q, st0 - 1);
            else if (/[*?]/.test(q)) { i = -1; for (let k = st0 - 1; k < t.length; k++) { if (new RegExp(wild(q).source.slice(0, -1), 'i').test(t.slice(k))) { i = k; break; } } }
            else i = t.toLowerCase().indexOf(q.toLowerCase(), st0 - 1);
            return i < 0 ? ERR('#VALUE!') : i + 1;
          }
          case 'REPT': { const n = Math.trunc(num(a(1))); return n < 0 ? ERR('#VALUE!') : str(a(0)).repeat(n); }
          case 'TEXTJOIN': { const d = str(a(0)), skip = truthy(a(1)); const out = []; args.slice(2).forEach((_, i) => vals(i + 2).forEach((v) => { if (isErr(v)) throw v; if (!(skip && (v == null || v === ''))) out.push(str(v)); })); return out.join(d); }
          case 'EXACT': return str(a(0)) === str(a(1));
          case 'CHAR': return String.fromCharCode(num(a(0)));
          case 'UNICHAR': return String.fromCodePoint(num(a(0)));
          case 'CODE': case 'UNICODE': { const s = str(a(0)); if (!s) return ERR('#VALUE!'); return s.codePointAt(0); }
          case 'TEXT': { const v = scal(a(0)); if (isErr(v)) return v; const fmt = str(a(1)); const n = typeof v === 'number' ? v : typeof v === 'string' ? textNum(v) : typeof v === 'boolean' ? null : 0; return formatValue(n == null ? v : n, fmt.replace(/^(?=[ymdh])/i, '')); }
          case 'FIXED': { const x = num(a(0)), d = has(1) ? Math.trunc(num(a(1))) : 2, nc = has(2) && truthy(a(2)); const r = round(x, d); return formatValue(r, (nc ? '0' : '#,##0') + (d > 0 ? '.' + '0'.repeat(d) : '')); }
          case 'DOLLAR': { const x = num(a(0)), d = has(1) ? Math.trunc(num(a(1))) : 0; return formatValue(round(x, d), '"₩"#,##0' + (d > 0 ? '.' + '0'.repeat(d) : '') + ';-"₩"#,##0' + (d > 0 ? '.' + '0'.repeat(d) : '')); }
          case 'VALUE': { const v = scal(a(0)); if (typeof v === 'number') return v; if (v == null) return 0; const n = textNum(str(v)); return n == null ? ERR('#VALUE!') : n; }
          case 'NUMBERVALUE': { let s = str(a(0)).replace(/\s/g, ''); const ds = has(1) ? str(a(1)) : '.', gs = has(2) ? str(a(2)) : ','; s = s.split(gs).join('').replace(ds, '.'); const pc = (s.match(/%/g) || []).length; s = s.replace(/%/g, ''); const n = Number(s); return s === '' ? 0 : isNaN(n) ? ERR('#VALUE!') : n / Math.pow(100, pc); }
          case 'HYPERLINK': return has(1) ? a(1) : a(0);
          case 'N': { const v = scal(a(0)); return typeof v === 'number' ? v : v === true ? 1 : isErr(v) ? v : 0; }
          case 'T': { const v = scal(a(0)); return typeof v === 'string' ? v : isErr(v) ? v : ''; }
          /* ── 판별 ── */
          case 'ISBLANK': { const v = scal(a(0)); return v == null; }
          case 'ISERROR': return !!isErr(scal(a(0)));
          case 'ISNUMBER': return typeof scal(a(0)) === 'number';
          case 'ISTEXT': return typeof scal(a(0)) === 'string';
          case 'ISNONTEXT': return typeof scal(a(0)) !== 'string';
          case 'ISLOGICAL': return typeof scal(a(0)) === 'boolean';
          case 'ISNA': { const r = scal(a(0)); return !!(isErr(r) && r.err === '#N/A'); }
          case 'ISERR': { const r = scal(a(0)); return !!(isErr(r) && r.err !== '#N/A'); }
          case 'ISEVEN': return Math.trunc(num(a(0))) % 2 === 0;
          case 'ISODD': return Math.abs(Math.trunc(num(a(0))) % 2) === 1;
          case 'ISREF': return !!(args[0] && (args[0].k === 'ref' || (a(0) && a(0).range)));
          case 'ISFORMULA': { const r = rg(0); const ce = r.sh.cells[colName(r.c1) + r.r1]; return !!(ce && ce.f); }
          case 'NA': return ERR('#N/A');
          case 'TRUE': return true;
          case 'FALSE': return false;
          /* ── 날짜·시간 ── */
          case 'TODAY': { const d = new Date(); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
          case 'NOW': { const d = new Date(); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; }
          case 'DATE': { const y = Math.trunc(num(a(0))), m = Math.trunc(num(a(1))), d = Math.trunc(num(a(2))); const r = ymd(y, m, d); return r < 0 ? ERR('#NUM!') : r; }
          case 'TIME': { const r = (Math.trunc(num(a(0))) * 3600 + Math.trunc(num(a(1))) * 60 + Math.trunc(num(a(2)))) / 86400; return r < 0 ? ERR('#NUM!') : r % 1; }
          case 'YEAR': return serialParts(num(a(0))).y;
          case 'MONTH': return serialParts(num(a(0))).m;
          case 'DAY': return serialParts(num(a(0))).d;
          case 'HOUR': { const x = num(a(0)); return Math.floor(Math.round((x % 1) * 86400) / 3600) % 24; }
          case 'MINUTE': { const x = num(a(0)); return Math.floor(Math.round((x % 1) * 86400) / 60) % 60; }
          case 'SECOND': { const x = num(a(0)); return Math.round((x % 1) * 86400) % 60; }
          case 'WEEKDAY': {
            const w = serialParts(num(a(0))).w, t = has(1) ? num(a(1)) : 1;
            if (t === 1 || t === 17) return w + 1; if (t === 2 || t === 11) return (w + 6) % 7 + 1; if (t === 3) return (w + 6) % 7;
            if (t >= 12 && t <= 16) return (w - (t - 10) + 7) % 7 + 1; return ERR('#NUM!');
          }
          case 'WEEKNUM': { const d = Math.floor(num(a(0))), t = has(1) ? num(a(1)) : 1; const P = serialParts(d); const j1 = ymd(P.y, 1, 1); const ws = t === 2 || t === 11 ? 1 : t >= 12 && t <= 17 ? t - 10 : t === 21 ? 1 : 0; if (t === 21) return fn('ISOWEEKNUM', [{ k: 'v', v: d }], sh); const off = (serialParts(j1).w - ws + 7) % 7; return Math.floor((d - j1 + off) / 7) + 1; }
          case 'ISOWEEKNUM': { const d = Math.floor(num(a(0))); const w = (serialParts(d).w + 6) % 7; const th = d - w + 3; const y = serialParts(th).y; return Math.floor((th - ymd(y, 1, 1)) / 7) + 1; }
          case 'EDATE': case 'EOMONTH': { const P = serialParts(num(a(0))), m = Math.trunc(num(a(1))); if (f === 'EOMONTH') return ymd(P.y, P.m + m + 1, 0); const last = serialParts(ymd(P.y, P.m + m + 1, 0)).d; return ymd(P.y, P.m + m, Math.min(P.d, last)); }
          case 'DAYS': return Math.floor(num(a(0))) - Math.floor(num(a(1)));
          case 'DAYS360': { const p = serialParts(num(a(0))), q = serialParts(num(a(1))), eu = has(2) && truthy(a(2)); let d1 = p.d, d2 = q.d; if (eu) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; } else { const lastFeb = (P) => P.m === 2 && serialParts(ymd(P.y, 3, 1) - 1).d === P.d; if (d1 === 31 || lastFeb(p)) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; } return (q.y - p.y) * 360 + (q.m - p.m) * 30 + d2 - d1; }
          case 'DATEDIF': {
            const x = Math.floor(num(a(0))), y = Math.floor(num(a(1))), s1 = serialParts(x), s2 = serialParts(y), u = str(a(2)).toUpperCase();
            if (y < x) return ERR('#NUM!');
            const months = (s2.y - s1.y) * 12 + s2.m - s1.m - (s2.d < s1.d ? 1 : 0);
            if (u === 'D') return y - x;
            if (u === 'M') return months;
            if (u === 'Y') return Math.floor(months / 12);
            if (u === 'YM') return months % 12;
            if (u === 'MD') { let d = s2.d - s1.d; if (d < 0) d += serialParts(ymd(s2.y, s2.m, 0)).d; return d; }
            if (u === 'YD') { let d = y - ymd(s2.y, s1.m, s1.d); if (d < 0) d = y - ymd(s2.y - 1, s1.m, s1.d); return d; }
            return ERR('#NUM!');
          }
          case 'NETWORKDAYS': case 'NETWORKDAYS.INTL': {
            let x = Math.floor(num(a(0))), y = Math.floor(num(a(1))), sgn = 1; if (y < x) { [x, y] = [y, x]; sgn = -1; }
            const hi = f === 'NETWORKDAYS' ? 2 : 3;
            const hol = has(hi) ? nums([args[hi]]).map(Math.floor) : [];
            let n = 0; for (let d = x; d <= y; d++) { const w = serialParts(d).w; if (w !== 0 && w !== 6 && !hol.includes(d)) n++; }
            return n * sgn;
          }
          case 'WORKDAY': case 'WORKDAY.INTL': {
            let d = Math.floor(num(a(0))); let k = Math.trunc(num(a(1))); const hi = f === 'WORKDAY' ? 2 : 3;
            const hol = has(hi) ? nums([args[hi]]).map(Math.floor) : []; const st1 = k < 0 ? -1 : 1;
            while (k !== 0) { d += st1; const w = serialParts(d).w; if (w !== 0 && w !== 6 && !hol.includes(d)) k -= st1; }
            return d;
          }
          case 'YEARFRAC': {
            let x = Math.floor(num(a(0))), y = Math.floor(num(a(1))); const b = has(2) ? Math.trunc(num(a(2))) : 0; if (x > y) [x, y] = [y, x];
            const p = serialParts(x), q = serialParts(y);
            if (b === 0) { let d1 = p.d, d2 = q.d; const lastFeb = (P) => P.m === 2 && serialParts(ymd(P.y, 3, 1) - 1).d === P.d; if (lastFeb(p) && lastFeb(q)) d2 = 30; if (d1 === 31 || lastFeb(p)) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; return ((q.y - p.y) * 360 + (q.m - p.m) * 30 + d2 - d1) / 360; }
            if (b === 2) return (y - x) / 360; if (b === 3) return (y - x) / 365;
            if (b === 4) return ((q.y - p.y) * 360 + (q.m - p.m) * 30 + Math.min(30, q.d) - Math.min(30, p.d)) / 360;
            const yl = (yy) => ymd(yy + 1, 1, 1) - ymd(yy, 1, 1);
            if (p.y === q.y || (q.y === p.y + 1 && (q.m < p.m || (q.m === p.m && q.d <= p.d)))) { const leap = p.y === q.y ? yl(p.y) === 366 : (yl(p.y) === 366 && (p.m < 3)) || (yl(q.y) === 366 && (q.m > 2 || (q.m === 2 && q.d === 29))); return (y - x) / (leap ? 366 : 365); }
            let tot = 0; for (let yy = p.y; yy <= q.y; yy++) tot += yl(yy); return (y - x) / (tot / (q.y - p.y + 1));
          }
          case 'DATEVALUE': { const d = parseDate(str(a(0)).split(/\s+\d{1,2}:/)[0]); return d == null ? ERR('#VALUE!') : d; }
          case 'TIMEVALUE': { const s = str(a(0)); const t = parseTime(s.replace(/^.*?\s+(?=(오전|오후|\d{1,2}:))/, '')); return t == null ? ERR('#VALUE!') : t; }
          /* ── 재무 ── */
          case 'PMT': { const r = num(a(0)), n = num(a(1)), pv = num(a(2)), fv = has(3) ? num(a(3)) : 0, t = has(4) ? num(a(4)) : 0; if (r === 0) return -(pv + fv) / n; const q = Math.pow(1 + r, n); return -(r * (pv * q + fv)) / ((1 + r * t) * (q - 1)); }
          case 'FV': { const r = num(a(0)), n = num(a(1)), pm = num(a(2)), pv = has(3) ? num(a(3)) : 0, t = has(4) ? num(a(4)) : 0; if (r === 0) return -(pv + pm * n); const q = Math.pow(1 + r, n); return -(pv * q + pm * (1 + r * t) * (q - 1) / r); }
          case 'PV': { const r = num(a(0)), n = num(a(1)), pm = num(a(2)), fv = has(3) ? num(a(3)) : 0, t = has(4) ? num(a(4)) : 0; if (r === 0) return -(fv + pm * n); const q = Math.pow(1 + r, n); return -(fv + pm * (1 + r * t) * (q - 1) / r) / q; }
          case 'NPER': { const r = num(a(0)), pm = num(a(1)), pv = num(a(2)), fv = has(3) ? num(a(3)) : 0, t = has(4) ? num(a(4)) : 0; if (r === 0) return -(pv + fv) / pm; const z = pm * (1 + r * t) / r; return Math.log((z - fv) / (pv + z)) / Math.log(1 + r); }
          case 'NPV': { const r = num(a(0)); return nums(args.slice(1)).reduce((t, v, i) => t + v / Math.pow(1 + r, i + 1), 0); }
          /* ── 통계 (두 묶음) ── */
          case 'CORREL': case 'PEARSON': case 'SLOPE': case 'INTERCEPT': case 'RSQ': case 'FORECAST': case 'FORECAST.LINEAR': {
            const off = f.startsWith('FORECAST') ? 1 : 0;
            const ys0 = vals(off), xs0 = vals(off + 1); const xs = [], ys = [];
            ys0.forEach((y, i) => { const x = xs0[i]; if (typeof x === 'number' && typeof y === 'number') { xs.push(x); ys.push(y); } });
            const n = xs.length; if (n < 2) return ERR('#DIV/0!');
            const mx = sum(xs) / n, my = sum(ys) / n; let sxy = 0, sxx = 0, syy = 0;
            xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
            if (f === 'SLOPE') return sxx ? sxy / sxx : ERR('#DIV/0!');
            if (f === 'INTERCEPT') return sxx ? my - sxy / sxx * mx : ERR('#DIV/0!');
            if (off) return sxx ? my + sxy / sxx * (num(a(0)) - mx) : ERR('#DIV/0!');
            const r = sxy / Math.sqrt(sxx * syy); return f === 'RSQ' ? r * r : r;
          }
          default: missing.add(f); return ERR('#NAME?');
        }
      } catch (e) { if (e === KEEP) throw e; return isErr(e) ? e : ERR('#VALUE!'); }
    }
    // 범위 도우미: 기준 범위 base 의 i 번째 칸과 같은 자리
    const at = (r, i, base) => { const w = (base || r).c2 - (base || r).c1 + 1; return cellValue(r.sh, r.r1 + Math.floor(i / w), r.c1 + (i % w)); };
    const n0 = (v) => (typeof v === 'number' ? v : 0);
    // 조건: 숫자, "사과", ">=10", "<>", "*과*", ">=2026-03-01" (엑셀 COUNTIF 규칙)
    function match(x, c) {
      c = scal(c);
      if (typeof c === 'number') return typeof x === 'number' ? Number(x.toPrecision(15)) === Number(c.toPrecision(15)) : typeof x === 'string' && textNum(x) === c && false;
      if (typeof c === 'boolean') return x === c;
      if (isErr(c)) return isErr(x) && x.err === c.err;
      const s = String(c ?? '');
      const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s); const op = m[1] || '=', rhs = m[2];
      let rn = rhs !== '' && !isNaN(Number(rhs)) ? Number(rhs) : null;
      if (rn === null && rhs !== '') { const d = parseDate(rhs); if (d != null) rn = d; }
      if (rn !== null) {
        if (typeof x !== 'number') return op === '<>';
        const xn = Number(x.toPrecision(15));
        return op === '=' ? xn === rn : op === '<>' ? xn !== rn : op === '<' ? xn < rn : op === '>' ? xn > rn : op === '<=' ? xn <= rn : xn >= rn;
      }
      if (/^(TRUE|FALSE)$/i.test(rhs)) { const b = /^TRUE$/i.test(rhs); return op === '<>' ? x !== b : x === b; }
      const xs = x == null ? '' : typeof x === 'string' ? x : null;
      if (op === '=' || op === '<>') {
        const hit = rhs === '' ? x == null || x === '' : xs != null && wild(rhs).test(xs);
        return op === '=' ? hit : !hit;
      }
      if (xs == null || x == null) return false;
      const k = xs.toLowerCase().localeCompare(rhs.toLowerCase()); return op === '<' ? k < 0 : op === '>' ? k > 0 : op === '<=' ? k <= 0 : k >= 0;
    }
    // 아무 칸 기준으로 수식 하나 계산 (조건부 서식)
    function evalAt(sh, f, r, c) {
      const save = ctx; ctx = { arr: false, r, c };
      try { const v = ev(astOf(f), sh); return v && v.range ? isect(v) : v && v.arr ? v.arr[0][0] : v; } catch (e) { return isErr(e) ? e : ERR('#VALUE!'); } finally { ctx = save; }
    }
    return { recalc() { memo = new Map(); busy = new Set(); }, value: cellValue, missing, evalAt, cmp: (x, y) => { try { return cmp(x, y); } catch (e) { return NaN; } }, truthy: (v) => { try { return truthy(v); } catch (e) { return false; } } };
  }

  /* ── 채우기 무늬 (엑셀 8×8 무늬) ── */
  const PAT = {
    gray125: [0x88, 0, 0x22, 0, 0x88, 0, 0x22, 0], gray0625: [0x80, 0, 0, 0, 0x08, 0, 0, 0], lightGray: [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22],
    mediumGray: [0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55], darkGray: [0x77, 0xDD, 0x77, 0xDD, 0x77, 0xDD, 0x77, 0xDD],
    darkHorizontal: [0xFF, 0xFF, 0, 0, 0xFF, 0xFF, 0, 0], darkVertical: [0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC],
    darkDown: [0xCC, 0x66, 0x33, 0x99, 0xCC, 0x66, 0x33, 0x99], darkUp: [0x33, 0x66, 0xCC, 0x99, 0x33, 0x66, 0xCC, 0x99],
    darkGrid: [0xCC, 0xCC, 0x33, 0x33, 0xCC, 0xCC, 0x33, 0x33], darkTrellis: [0xEE, 0xBB, 0xEE, 0xBB, 0xEE, 0xBB, 0xEE, 0xBB].map((x, i) => (i % 2 ? 0x99 : 0x66) | x & 0),
    lightHorizontal: [0xFF, 0, 0, 0, 0xFF, 0, 0, 0], lightVertical: [0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88],
    lightDown: [0x88, 0x44, 0x22, 0x11, 0x88, 0x44, 0x22, 0x11], lightUp: [0x11, 0x22, 0x44, 0x88, 0x11, 0x22, 0x44, 0x88],
    lightGrid: [0xFF, 0x88, 0x88, 0x88, 0xFF, 0x88, 0x88, 0x88], lightTrellis: [0x88, 0x55, 0x22, 0x55, 0x88, 0x55, 0x22, 0x55]
  };
  PAT.darkTrellis = [0x99, 0xFF, 0x66, 0xFF, 0x99, 0xFF, 0x66, 0xFF];
  function patternUrl(type, fg, bg) {
    const rows = PAT[type] || PAT.mediumGray; let rects = '';
    rows.forEach((row, y) => { for (let x = 0; x < 8; x++) if (row & (0x80 >> x)) rects += `<rect x='${x}' y='${y}' width='1' height='1'/>`; });
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' shape-rendering='crispEdges'><rect width='8' height='8' fill='${bg}'/><g fill='${fg}'>${rects}</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  /* ── 글꼴·크기 ── */
  const FONT_EN = { '맑은 고딕': 'Malgun Gothic', '굴림': 'Gulim', '굴림체': 'GulimChe', '돋움': 'Dotum', '돋움체': 'DotumChe', '바탕': 'Batang', '바탕체': 'BatangChe', '궁서': 'Gungsuh', '궁서체': 'GungsuhChe', '나눔고딕': 'NanumGothic', '나눔명조': 'NanumMyeongjo', '나눔바른고딕': 'NanumBarunGothic', '함초롬돋움': 'HCR Dotum', '함초롬바탕': 'HCR Batang' };
  const FONT_KO = Object.fromEntries(Object.entries(FONT_EN).map(([k, v]) => [v.toLowerCase(), k]));
  const SERIF = /바탕|궁서|명조|batang|gungsuh|myeongjo|serif|times|georgia|cambria|garamond/i;
  const famCache = new Map();
  function famCss(name) {
    const n = (name || '').trim();
    if (famCache.has(n)) return famCache.get(n);
    const out = [];
    if (n) { out.push(n); if (FONT_EN[n]) out.push(FONT_EN[n]); if (FONT_KO[n.toLowerCase()]) out.push(FONT_KO[n.toLowerCase()]); }
    const serif = SERIF.test(n);
    out.push(...(serif ? ['Batang', '바탕', 'AppleMyungjo', 'Noto Serif KR'] : ['Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR']));
    const css = [...new Set(out)].map((x) => `'${x.replace(/['"\\]/g, '')}'`).join(',') + (serif ? ',serif' : ',sans-serif');
    famCache.set(n, css);
    return css;
  }
  // 열 너비 계산에 쓰는 '숫자 최대 폭'(96dpi). 흔한 글꼴은 윈도 엑셀 값, 나머지는 재서 구한다
  const MDW = { calibri: [6, 7, 7, 8], '맑은 고딕': [7, 7, 8, 9], 'malgun gothic': [7, 7, 8, 9], '굴림': [6, 7, 8, 9], gulim: [6, 7, 8, 9], '굴림체': [6, 7, 8, 9], '돋움': [6, 7, 8, 9], dotum: [6, 7, 8, 9], '돋움체': [6, 7, 8, 9], '바탕': [6, 7, 8, 9], batang: [6, 7, 8, 9], '바탕체': [6, 7, 8, 9], '궁서': [6, 7, 8, 9], gungsuh: [6, 7, 8, 9], arial: [7, 7, 8, 9], 'times new roman': [6, 7, 7, 8], '나눔고딕': [7, 8, 9, 10], nanumgothic: [7, 8, 9, 10] };
  let cvs = null;
  const fontStr = (f) => `${f.i ? 'italic ' : ''}${f.b ? 'bold ' : ''}${(f.sz || 11) * 4 / 3}px ${famCss(f.name)}`;
  function textW(text, f) {
    if (!cvs) { try { cvs = document.createElement('canvas').getContext('2d'); } catch (e) { cvs = false; } }
    if (!cvs) return String(text).length * (f.sz || 11) * 4 / 3 * 0.6;
    cvs.font = fontStr(f);
    return Math.max(...String(text).split('\n').map((l) => cvs.measureText(l).width));
  }
  function mdwOf(f) {
    const t = MDW[(f.name || '').toLowerCase()];
    if (t && Number.isInteger(f.sz) && f.sz >= 9 && f.sz <= 12) return t[f.sz - 9];
    let m = 0; for (let d = 0; d < 10; d++) m = Math.max(m, textW(String(d), { name: f.name, sz: f.sz }));
    return Math.max(4, Math.round(m));
  }

  /* ── 그리기 ── */
  const BORDER = { thin: '1px solid', hair: '1px var(--xl-hair, dotted)', dotted: '1px dotted', dashed: '1px dashed', dashDot: '1px dashed', dashDotDot: '1px dashed', mediumDashed: '2px dashed', mediumDashDot: '2px dashed', mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed', medium: '2px solid', thick: '3px solid', double: '3px double' };
  const BW = { hair: 1, dotted: 1, dashDot: 1, dashDotDot: 1, dashed: 1, thin: 2, mediumDashDotDot: 3, slantDashDot: 3, mediumDashDot: 3, mediumDashed: 3, medium: 4, double: 5, thick: 6 };
  // 눈금선은 0.5px 로 두어 표 테두리 겹침 규칙에서 언제나 진짜 테두리에 진다
  const GRID = '0.5px solid var(--xl-grid)', NONE = '0.5px solid transparent';
  function geom(book, sh) {
    if (sh.geo) return sh.geo;
    const mdw = book.mdw, pad = 2 * Math.ceil(mdw / 4) + 1;
    const wpx = (w) => Math.trunc(((256 * w + Math.trunc(128 / mdw)) / 256) * mdw);
    const defPx = sh.defW != null ? wpx(sh.defW) : Math.ceil((sh.baseW * mdw + pad) / 8) * 8;
    const col = (c) => { const d = sh.cols[c]; if (d && (d.hidden || d.w === 0)) return 0; return d && d.w != null ? wpx(d.w) : defPx; };
    const rowEx = (r) => { const d = sh.rows[r]; if (d && d.hidden) return 0; if (!d && sh.zeroH) return 0; const h = d && d.h != null ? d.h : sh.defH; return h * 4 / 3; };
    // 행 높이(pt)는 소수 픽셀이 되므로, 누적 위치를 반올림해 정수 높이로 나눈다 (표는 정수 높이로 그려져 오차가 쌓이지 않게)
    const ye = [0];
    const yEx = (r) => { while (ye.length < r) ye.push(ye[ye.length - 1] + rowEx(ye.length)); return ye[r - 1]; };
    const row = (r) => (rowEx(r) ? Math.max(1, Math.round(yEx(r + 1)) - Math.round(yEx(r))) : 0);
    const cx = [0], ry = [0];
    const colX = (c) => { while (cx.length < c) cx.push(cx[cx.length - 1] + col(cx.length)); return cx[c - 1]; };   // 1열 왼쪽 = 0
    const rowY = (r) => { while (ry.length < r) ry.push(ry[ry.length - 1] + row(ry.length)); return ry[r - 1]; };
    return (sh.geo = { mdw, col, row, colX, rowY, indent: Math.round(textW('   ', book.font0)) || mdw * 2 });
  }
  const styleIdx = (sh, r, c) => { const cell = sh.cells[colName(c) + r]; if (cell) return cell.s; const rw = sh.rows[r]; if (rw && rw.s != null) return rw.s; const cl = sh.cols[c]; return cl && cl.s != null ? cl.s : 0; };
  // 조건부 서식: 이 칸에 걸리는 규칙들의 결과
  function cfAt(book, sh, r, c, v, cache) {
    const calc = book.calc; let res = null;
    for (const rule of sh.cf) {
      if (!rule.ranges.some((g) => inRg(g, r, c))) continue;
      const top = rule.ranges[0];
      const rel = (f) => calc.evalAt(sh, shiftFormula(f, r - top.r1, c - top.c1), r, c);
      const numsOf = () => {
        if (cache.has(rule)) return cache.get(rule);
        const xs = []; const allv = [];
        rule.ranges.forEach((g) => { for (let rr = g.r1; rr <= Math.min(g.r2, sh.maxR); rr++) for (let cc = g.c1; cc <= Math.min(g.c2, sh.maxC); cc++) { const x = calc.value(sh, rr, cc); allv.push(x); if (typeof x === 'number') xs.push(x); } });
        const o = { xs: xs.slice().sort((p, q) => p - q), all: allv }; cache.set(rule, o); return o;
      };
      const cfv = (o, xs, dflt) => {
        if (!o) return dflt;
        const t = o.type, n = parseFloat(o.val);
        if (t === 'min') return xs[0]; if (t === 'max') return xs[xs.length - 1];
        if (t === 'num') return isNaN(n) ? Number(rel(o.val)) : n;
        if (t === 'percent') return xs[0] + (xs[xs.length - 1] - xs[0]) * n / 100;
        if (t === 'percentile') { const h = (n / 100) * (xs.length - 1), lo = Math.floor(h); return xs[lo] + (h - lo) * ((xs[lo + 1] ?? xs[lo]) - xs[lo]); }
        if (t === 'formula') return Number(rel(o.val));
        return dflt;
      };
      let hit = false;
      try {
        switch (rule.type) {
          case 'cellIs': {
            const x = v == null ? (typeof calc.evalAt(sh, rule.f[0], r, c) === 'string' ? '' : 0) : v;
            if (isErr(x)) break;
            const p = rel(rule.f[0]), q = rule.f[1] != null ? rel(rule.f[1]) : null;
            const k = calc.cmp(x, p), k2 = q != null ? calc.cmp(x, q) : 0;
            const lo = Math.min(k, -k2) , o = rule.op;
            hit = o === 'equal' ? k === 0 : o === 'notEqual' ? k !== 0 : o === 'greaterThan' ? k > 0 : o === 'lessThan' ? k < 0 : o === 'greaterThanOrEqual' ? k >= 0 : o === 'lessThanOrEqual' ? k <= 0
              : o === 'between' ? (calc.cmp(p, q) <= 0 ? k >= 0 && k2 <= 0 : k <= 0 && k2 >= 0) : o === 'notBetween' ? !(calc.cmp(p, q) <= 0 ? k >= 0 && k2 <= 0 : k <= 0 && k2 >= 0) : false;
            void lo;
            break;
          }
          case 'duplicateValues': case 'uniqueValues': {
            if (v == null || v === '') break;
            const key = (x) => (typeof x === 'string' ? 's' + x.toLowerCase() : typeof x + x);
            const o = numsOf(); if (!o.cnt) { o.cnt = new Map(); o.all.forEach((x) => { if (x != null && x !== '') o.cnt.set(key(x), (o.cnt.get(key(x)) || 0) + 1); }); }
            const n = o.cnt.get(key(v)) || 0; hit = rule.type === 'duplicateValues' ? n > 1 : n === 1;
            break;
          }
          case 'top10': {
            if (typeof v !== 'number') break;
            const xs = numsOf().xs; const k = rule.percent ? Math.max(1, Math.floor(xs.length * rule.rank / 100)) : rule.rank;
            hit = rule.bottom ? v <= xs[Math.min(k, xs.length) - 1] : v >= xs[Math.max(0, xs.length - k)];
            break;
          }
          case 'aboveAverage': {
            if (typeof v !== 'number') break;
            const xs = numsOf().xs; const m = sum(xs) / xs.length; const sd = rule.std ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) * rule.std : 0;
            hit = rule.above ? (rule.eq ? v >= m + sd : v > m + sd) : (rule.eq ? v <= m - sd : v < m - sd);
            break;
          }
          case 'colorScale': {
            if (typeof v !== 'number' || !rule.scale) break;
            const xs = numsOf().xs; const S = rule.scale; const pts = S.v.map((o, i) => cfv(o, xs, i ? xs[xs.length - 1] : xs[0]));
            let col;
            const mix = (c1, c2, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(c1.substr(i, 2), 16) * (1 - t) + parseInt(c2.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
            if (S.c.length === 3) col = v <= pts[1] ? mix(S.c[0], S.c[1], pts[1] > pts[0] ? Math.max(0, (v - pts[0]) / (pts[1] - pts[0])) : 1) : mix(S.c[1], S.c[2], pts[2] > pts[1] ? Math.min(1, (v - pts[1]) / (pts[2] - pts[1])) : 1);
            else col = mix(S.c[0], S.c[1], pts[1] > pts[0] ? Math.max(0, Math.min(1, (v - pts[0]) / (pts[1] - pts[0]))) : 1);
            res = res || {}; if (!res.fill) res.fill = { color: col };
            break;
          }
          case 'dataBar': {
            if (typeof v !== 'number' || !rule.bar) break;
            const xs = numsOf().xs; const lo = cfv(rule.bar.v[0], xs, xs[0]), hi = cfv(rule.bar.v[1], xs, xs[xs.length - 1]);
            res = res || {}; if (!res.bar) res.bar = { pct: hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 1, color: rule.bar.c };
            break;
          }
          case 'containsText': case 'notContainsText': case 'beginsWith': case 'endsWith': case 'containsBlanks': case 'notContainsBlanks': case 'containsErrors': case 'notContainsErrors': case 'timePeriod': case 'expression': {
            if (rule.f[0]) { hit = calc.truthy(rel(rule.f[0])); break; }
            const s = v == null ? '' : String(isErr(v) ? v.err : v).toLowerCase(), t = String(rule.text || '').toLowerCase();
            hit = rule.type === 'containsText' ? s.includes(t) : rule.type === 'notContainsText' ? !s.includes(t) : rule.type === 'beginsWith' ? s.startsWith(t) : rule.type === 'endsWith' ? s.endsWith(t)
              : rule.type === 'containsBlanks' ? !s.trim() : rule.type === 'notContainsBlanks' ? !!s.trim() : rule.type === 'containsErrors' ? !!isErr(v) : rule.type === 'notContainsErrors' ? !isErr(v) : false;
            break;
          }
        }
      } catch (e) { hit = false; }
      if (hit && rule.dxf) {
        res = res || {};
        const d = rule.dxf;
        if (d.fill !== undefined && !('fill' in res)) res.fill = d.fill;
        if (d.font) { res.font = res.font || {}; for (const k in d.font) if (!(k in res.font)) res.font[k] = d.font[k]; }
        if (d.border && !res.border) res.border = d.border;
        if (d.fmt && !res.fmt) res.fmt = d.fmt;
      }
      if (hit && rule.stop) break;
    }
    return res;
  }
  function fontDecl(f, base) {
    const st = [];
    if (!base || f.name !== base.name) st.push('font-family:' + famCss(f.name));
    if (!base || f.sz !== base.sz) st.push('font-size:' + pxs(f.sz || 11));
    if (f.b !== (base ? base.b : false)) st.push('font-weight:' + (f.b ? 700 : 400));
    if (f.i !== (base ? base.i : false)) st.push('font-style:' + (f.i ? 'italic' : 'normal'));
    const deco = (x) => [x.u && !/Accounting/.test(x.u) ? 'underline' : '', x.s ? 'line-through' : ''].filter(Boolean).join(' ') + (x.u === 'double' ? ' double' : '');
    if (deco(f) !== (base ? deco(base) : '')) st.push('text-decoration:' + (deco(f) || 'none'));
    if (f.va === 'superscript' || f.va === 'subscript') st.push(`vertical-align:${f.va === 'superscript' ? 'super' : 'sub'};font-size:${pxs((f.sz || 11) * 0.7)}`);
    if (f.color && (!base || f.color !== base.color)) st.push('color:' + f.color);
    else if (!f.color && base && base.color) st.push('color:#000');
    return st.join(';');
  }
  // 시트(또는 인쇄 쪽 조각)의 모든 칸 모양을 계산한다
  function buildModel(book, sh, rows, cols, opt = {}) {
    const calc = book.calc, G = geom(book, sh), def = book.font0;
    const ri = new Map(rows.map((r, i) => [r, i])), ci = new Map(cols.map((c, i) => [c, i]));
    const cw = cols.map(G.col), rh = rows.map(G.row);
    const anchor = new Map(), cover = new Map();
    for (const m of sh.merges) {
      if (m.r2 < rows[0] || m.r1 > rows[rows.length - 1] || m.c2 < cols[0] || m.c1 > cols[cols.length - 1]) continue;
      const rs = rows.filter((r) => r >= m.r1 && r <= m.r2), cs = cols.filter((c) => c >= m.c1 && c <= m.c2);
      if (!rs.length || !cs.length) continue;
      const k = rs[0] + ',' + cs[0];
      anchor.set(k, { m, rs, cs });
      for (const r of rs) for (const c of cs) if (r !== rs[0] || c !== cs[0]) cover.set(r + ',' + c, k);
    }
    const xfAt = (r, c) => book.xfs[styleIdx(sh, r, c)] || book.xfs[0];
    const cache = new Map(), info = new Map(), list = [];
    for (const r of rows) for (const c of cols) {
      const k = r + ',' + c; if (cover.has(k)) continue;
      const a = anchor.get(k), vr = a ? a.m.r1 : r, vc = a ? a.m.c1 : c;
      const ref = colName(vc) + vr, cell = sh.cells[ref], x = xfAt(vr, vc), v = calc.value(sh, vr, vc);
      const cf = sh.cf.length ? cfAt(book, sh, vr, vc, v, cache) : null;
      const font = cf && cf.font ? Object.assign({}, x.font, cf.font, cf.font.color ? {} : {}) : x.font;
      const it = { r, c, k, a, ref, cell, x, v, cf, font, fill: cf && 'fill' in cf ? cf.fill : x.fill, fmt: (cf && cf.fmt) || x.fmt,
        w: a ? sum(a.cs.map((cc) => cw[ci.get(cc)])) : cw[ci.get(c)], h: a ? sum(a.rs.map((rr) => rh[ri.get(rr)])) : rh[ri.get(r)],
        r2: a ? a.rs[a.rs.length - 1] : r, c2: a ? a.cs[a.cs.length - 1] : c };
      info.set(k, it); list.push(it);
    }
    const isEmpty = (r, c) => { const k = r + ',' + c; if (cover.has(k) || anchor.has(k)) return false; const it = info.get(k); if (!it) return true; return (it.v == null || it.v === '') && !(it.cell && it.cell.f); };
    const spill = new Set();   // 넘친 글이 덮는 세로 경계 "행,왼쪽열"
    const ccv = new Set();     // '선택 영역의 가운데로' 안쪽 경계: 엑셀은 세로 테두리도 그리지 않는다
    // 1) 글자·정렬
    for (const it of list) {
      const x = it.x, v = it.v, f = it.font;
      const p = fmtParts(v, it.fmt);
      it.color = p.color;
      // 숫자 폭: 엑셀(GDI)은 숫자를 정수 픽셀 폭으로 그리므로 그만큼 줄여 잰다
      const nW = (s) => textW(s, f) * book.numScale;
      let t = p.t, html = null;
      let ha = x.h || 'general';
      const isNum = typeof v === 'number';
      if (ha === 'general') ha = isNum ? 'right' : (typeof v === 'boolean' || isErr(v)) ? 'center' : 'left';
      const rot = x.rot || 0, wrap = x.wrap || ha === 'justify' || ha === 'distributed' && false || x.v === 'justify' || x.v === 'distributed';
      const ind = x.indent ? x.indent * G.indent : 0;
      const avail = Math.max(1, it.w - 5 - (ha === 'distributed' ? 2 : 1) * ind);   // 균등 분할 들여쓰기는 양쪽
      it.ha = ha; it.wrap = wrap; it.ind = ind;
      if (!wrap) t = t.replace(/\r?\n/g, '');
      const sty = [];
      if (p.fillAt >= 0) {
        // 회계 형식처럼 '*' 채움: 앞은 왼쪽, 뒤는 오른쪽 끝
        const pre = t.slice(0, p.fillAt), post = t.slice(p.fillAt);
        html = `<span>${esc(pre)}</span><span class="xl-fl">${p.fillCh && p.fillCh !== ' ' ? esc(p.fillCh.repeat(Math.ceil(avail / Math.max(1, textW(p.fillCh, f))) + 1)) : ''}</span><span>${esc(post)}</span>`;
        sty.push('display:flex');
        if (isNum && !rot && nW(t) > avail + 1) { html = null; t = '#'.repeat(Math.max(1, Math.floor(avail / textW('#', f)))); }
      } else if (isNum && !rot && !x.shrink) {
        // 숫자는 넘치지 않는다: 일반 형식은 자릿수를 줄이고, 아니면 ###
        if (nW(t) > avail + 0.5) {
          if (/^(general|g\/표준)$/i.test(it.fmt)) {
            let s = null; const a = Math.abs(v), e = Math.floor(Math.log10(a || 1));
            for (let d = 9; d >= 0 && !s; d--) { if (e < 11 && e >= -4) { let [i, dd] = roundStr(a, Math.max(0, d - Math.max(0, e))); dd = dd.replace(/0+$/, ''); const c1 = (v < 0 ? '-' : '') + i + (dd ? '.' + dd : ''); if (i.length <= 11 && nW(c1) <= avail + 0.5 && (Number(i + '.' + (dd || 0)) !== 0 || a === 0)) s = c1; } }
            for (let d = 5; d >= 0 && !s; d--) { const ee = Math.floor(Math.log10(a)); let [i, dd] = roundStr(a / Math.pow(10, ee), d); let e2 = ee; if (i.length > 1) { e2++; [i, dd] = roundStr(a / Math.pow(10, e2), d); } dd = dd.replace(/0+$/, ''); const c1 = (v < 0 ? '-' : '') + i + (dd ? '.' + dd : '') + 'E' + (e2 < 0 ? '-' : '+') + pad2(Math.abs(e2)); if (nW(c1) <= avail + 0.5) s = c1; }
            t = s || '#'.repeat(Math.max(1, Math.floor(avail / textW('#', f))));
          } else t = '#'.repeat(Math.max(1, Math.floor(avail / textW('#', f))));
        }
      }
      // 칸 안 모양
      let fsz = null;
      if (x.shrink && !wrap && t && !html) { const tw = textW(t, f); if (tw > avail) fsz = (f.sz || 11) * avail / tw; }
      if (ha === 'fill' && t && !html) { const tw = textW(t, f); if (tw > 0) t = t.repeat(Math.max(1, Math.floor(avail / tw))); ha = 'left'; it.ha = 'left'; }
      if (ha === 'distributed' && t && !html && !wrap) {
        const tw = textW(t, f), n = [...t].length;
        if (n > 1 && tw < avail) sty.push(`letter-spacing:${((avail - tw) / (n - 1)).toFixed(2)}px`); else if (n > 1) { it.wrap = true; }
      }
      // 넘침: 줄바꿈 없는 글은 빈 이웃 칸으로 넘쳐 보인다
      let wpx = null, ml = 0;
      const canSpill = typeof v === 'string' && t && !html && !wrap && !rot && !x.shrink && !it.a && !opt.noSpill && ['left', 'right', 'center'].includes(ha);
      if (ha === 'centerContinuous' && t) {
        let j = ci.get(it.c) + 1, extra = 0;
        while (j < cols.length && isEmpty(it.r, cols[j]) && (xfAt(it.r, cols[j]).h === 'centerContinuous')) { extra += cw[j]; spill.add(it.r + ',' + cols[j - 1]); ccv.add(it.r + ',' + cols[j - 1]); j++; }
        if (extra) { wpx = avail + extra; it.spill = true; }
        it.ha = 'center';
      } else if (canSpill) {
        const tw = textW(t, f) + 1;
        if (tw > avail) {
          const i0 = ci.get(it.c);
          if (ha === 'left') { let j = i0 + 1, extra = 0; while (tw > avail + extra && j < cols.length && isEmpty(it.r, cols[j])) { extra += cw[j]; spill.add(it.r + ',' + cols[j - 1]); j++; } if (extra) { wpx = avail + extra; it.spill = true; } }
          else if (ha === 'right') { let j = i0 - 1, extra = 0; while (tw > avail + extra && j >= 0 && isEmpty(it.r, cols[j])) { extra += cw[j]; spill.add(it.r + ',' + cols[j]); j--; } if (extra) { wpx = avail + extra; ml = -extra; it.spill = true; } }
          else {
            const need = (tw - avail) / 2; let L = 0, R = 0, jl = i0 - 1, jr = i0 + 1; const sl = [], sr = [];
            while (L < need && jl >= 0 && isEmpty(it.r, cols[jl])) { L += cw[jl]; sl.push(it.r + ',' + cols[jl]); jl--; }
            while (R < need && jr < cols.length && isEmpty(it.r, cols[jr])) { R += cw[jr]; sr.push(it.r + ',' + cols[jr - 1]); jr++; }
            const e = Math.min(L, R);
            if (e > 0) { let s2 = 0; sl.forEach((k, i) => { s2 += cw[i0 - 1 - i]; if (s2 - cw[i0 - 1 - i] < e) spill.add(k); }); s2 = 0; sr.forEach((k, i) => { s2 += cw[i0 + 1 + i]; if (s2 - cw[i0 + 1 + i] < e) spill.add(k); }); wpx = avail + 2 * e; ml = -e; it.spill = true; }
          }
        }
      }
      // 회전
      let inner;
      // 줄바꿈 칸: 엑셀은 한글을 글자 사이에서도 나눈다 (영문은 낱말 단위)
      const brk = (h) => (it.wrap ? h.replace(/([\uAC00-\uD7A3])(?=[\uAC00-\uD7A3])/g, '$1<wbr>') : h);
      const content = html != null ? html : brk(richHtml(it, t, f));
      if (rot === 255) inner = `<span class="xl-rot" style="writing-mode:vertical-rl;text-orientation:upright">${content}</span>`;
      else if (rot > 0 && rot <= 180) {
        const deg = rot <= 90 ? rot : rot - 90;
        if (deg === 90) inner = `<span class="xl-rot" style="writing-mode:vertical-rl;text-orientation:sideways${rot <= 90 ? ';transform:rotate(180deg)' : ''}">${content}</span>`;
        else { inner = `<span class="xl-rot" style="transform:rotate(${rot <= 90 ? -deg : deg}deg);transform-origin:${rot <= 90 ? 'left bottom' : 'left top'}">${content}</span>`; sty.push('overflow:visible'); }
        if (x.h == null || x.h === 'general') it.ha = deg === 90 && rot <= 90 ? 'right' : 'left';
      } else inner = content;
      const vjust = x.v === 'justify' || x.v === 'distributed';
      if (vjust && !rot) { sty.push(`height:${Math.max(0, it.h - 1)}px;display:flex;flex-direction:column;justify-content:${t.includes('\n') ? 'space-between' : 'center'}`); inner = t.split('\n').map((l) => `<div>${esc(l) || '&#8203;'}</div>`).join(''); }
      if (wpx != null) sty.push(`width:${wpx.toFixed(1)}px`);
      if (ml) sty.push(`margin-left:${ml.toFixed(1)}px`);
      if (fsz) sty.push('font-size:' + pxs(fsz));
      if (f.u && /Accounting/.test(f.u)) sty.push(`border-bottom:${f.u === 'doubleAccounting' ? '3px double' : '1px solid'} currentColor`);
      sty.push(`max-height:${Math.max(0, it.h - 1)}px`);
      it.inner = t || html ? `<div class="xl-v${it.spill ? ' xl-sp' : ''}"${sty.length ? ` style="${esc(sty.join(';'))}"` : ''}>${inner}</div>` : '';
    }
    // 2) 테두리·눈금선 (이웃 칸과 나눠 쓰는 선은 양쪽이 같은 값을 갖게 한다)
    const fillAt = (r, c) => { const k = r + ',' + c; const it = info.get(cover.get(k) || k); if (it) return !!(it.fill || (it.cf && it.cf.bar)); return !!xfAt(r, c).fill; };
    const bAt = (r, c) => { const k = r + ',' + c; const it = info.get(k); if (it && it.cf && it.cf.border) return Object.assign({}, it.x.border, ...['l', 'r', 't', 'b'].filter((s) => it.cf.border[s]).map((s) => ({ [s]: it.cf.border[s] }))); return xfAt(r, c).border; };
    const pick = (p, q) => (!p ? q : !q ? p : (BW[q.s] || 2) > (BW[p.s] || 2) ? q : p);
    const bcss = (b) => `${BORDER[b.s] || '1px solid'} ${b.c}`;
    const prevC = (c) => { const i = ci.get(c); return i > 0 ? cols[i - 1] : c > 1 ? c - 1 : null; };
    const nextC = (c) => { const i = ci.get(c); return i < cols.length - 1 ? cols[i + 1] : c + 1; };
    const prevR = (r) => { const i = ri.get(r); return i > 0 ? rows[i - 1] : r > 1 ? r - 1 : null; };
    const nextR = (r) => { const i = ri.get(r); return i < rows.length - 1 ? rows[i + 1] : r + 1; };
    // 병합 칸은 둘레의 모든 칸 테두리를 모은다 (엑셀은 병합 영역 가장자리 칸마다 테두리를 따로 저장)
    // 병합 칸 한 변이 여러 칸에 걸칠 때: 모두 같으면 그 테두리, 섞여 있으면 가장 약한 선으로 두고 맞은편 칸들이 제 몫을 그린다
    const same = (p, q) => (!p && !q) || (p && q && p.s === q.s && p.c === q.c);
    const agree = (list) => { const b0 = list[0]; if (list.every((b) => same(b, b0))) return b0 ? bcss(b0) : null; return list.some(Boolean) ? NONE : null; };
    const vEdge = (rs, cA, cB) => {
      if (cA != null && cB != null && rs.every((r) => ccv.has(r + ',' + cA))) return NONE;
      const segs = rs.map((r) => pick(cA != null ? bAt(r, cA).r : null, cB != null ? bAt(r, cB).l : null));
      const b = agree(segs);
      if (b) return b;
      const r = rs[0];
      if (cA != null && spill.has(r + ',' + cA)) return NONE;
      if ((cA != null && fillAt(r, cA)) || (cB != null && fillAt(r, cB))) return NONE;
      return GRID;
    };
    const hEdge = (cs, rA, rB) => {
      const segs = cs.map((c) => pick(rA != null ? bAt(rA, c).b : null, rB != null ? bAt(rB, c).t : null));
      const b = agree(segs);
      if (b) return b;
      const c = cs[0];
      if ((rA != null && fillAt(rA, c)) || (rB != null && fillAt(rB, c))) return NONE;
      return GRID;
    };
    const byRef = new Map();
    for (const it of list) {
      const x = it.x, f = it.font, st = [];
      // 바탕: 대각선 → 데이터 막대 → 무늬/그라데이션 → 색
      const imgs = [], sizes = [];
      const bd = bAt(it.a ? it.a.m.r1 : it.r, it.a ? it.a.m.c1 : it.c).d;
      if (bd) {
        const line = (x1, y1, x2, y2) => `<line x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}' stroke='${bd.c}' stroke-width='${BORDER[bd.s] && BORDER[bd.s][0] === '2' ? 2 : BORDER[bd.s] && BORDER[bd.s][0] === '3' ? 3 : 1}' vector-effect='non-scaling-stroke'/>`;
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>${bd.down ? line(0, 0, 100, 100) : ''}${bd.up ? line(0, 100, 100, 0) : ''}</svg>`;
        imgs.push(`url("data:image/svg+xml,${encodeURIComponent(svg)}")`); sizes.push('100% 100%');
      }
      if (it.cf && it.cf.bar) { const b = it.cf.bar, w = (b.pct * 100).toFixed(1); imgs.push(`linear-gradient(to right, ${b.color}, ${b.color}33 ${w}%, transparent ${w}%)`); sizes.push(`100% calc(100% - 4px)`); }
      if (it.fill && it.fill.image) { imgs.push(it.fill.image); sizes.push(/^url/.test(it.fill.image) ? '8px 8px' : '100% 100%'); }
      if (imgs.length) st.push('background-image:' + imgs.join(','), 'background-size:' + sizes.join(','), 'background-repeat:' + imgs.map((u, i) => (sizes[i] === '8px 8px' ? 'repeat' : 'no-repeat')).join(','), 'background-position:' + imgs.map(() => 'center').join(','));
      if (it.fill && it.fill.color) st.push('background-color:' + it.fill.color);
      const fd = fontDecl(f, def); if (fd) st.push(fd);
      if (it.color) st.push('color:' + it.color);
      const ta = it.ha === 'justify' || it.ha === 'distributed' ? 'justify' : it.ha === 'centerContinuous' ? 'center' : it.ha;
      if (ta !== 'left') st.push('text-align:' + ta);
      if (it.ha === 'distributed' && it.wrap) st.push('text-align-last:justify');
      const va = x.v === 'center' || x.v === 'justify' || x.v === 'distributed' ? 'middle' : x.v === 'top' ? 'top' : (x.rot > 90 && x.rot <= 180 && !x.v) ? 'top' : 'bottom';
      if (va !== 'bottom') st.push('vertical-align:' + va);
      if (it.ind) st.push(it.ha === 'right' ? `padding-right:${(it.ind + 2).toFixed(1)}px` : it.ha === 'distributed' ? `padding:0 ${(it.ind + 2).toFixed(1)}px` : `padding-left:${(it.ind + 2).toFixed(1)}px`);
      if (it.wrap) st.push('white-space:pre-wrap');
      // 테두리
      // 병합 칸의 둘레: 원래 병합 영역 기준 (인쇄 쪽에서 잘린 병합은 보이는 부분)
      const mrs = it.a ? it.a.rs : [it.r], mcs = it.a ? it.a.cs : [it.c];
      const top = hEdge(mcs, prevR(it.r), it.r), bot = hEdge(mcs, it.r2, nextR(it.r2));
      const lef = vEdge(mrs, prevC(it.c), it.c), rig = vEdge(mrs, it.c2, nextC(it.c2));
      st.push(`border-top:${top};border-bottom:${bot};border-left:${lef};border-right:${rig}`);
      // 굵은 테두리의 절반은 칸 안쪽을 차지하므로, 글 상자 높이를 그만큼 줄여 줄 높이가 늘지 않게 한다
      const bw = (s) => (/^([\d.]+)px/.exec(s) ? parseFloat(/^([\d.]+)px/.exec(s)[1]) : 0);
      const mh = Math.max(0, it.h - Math.max(1, (bw(top) + bw(bot)) / 2));
      if (it.inner) it.inner = it.inner.replace(`max-height:${Math.max(0, it.h - 1)}px`, `max-height:${+mh.toFixed(2)}px`);
      it.css = st.join(';');
      const cs = it.a ? it.a.cs.length : 1, rs = it.a ? it.a.rs.length : 1;
      // 엑셀처럼: 보호하지 않은 시트는 모든 칸(수식 칸 포함)을, 보호한 시트는 잠금 해제한 칸만 고칠 수 있다
      const isF = !!(it.cell && (it.cell.f || it.cell.ov));
      const editable = !opt.static && (!sh.prot || !it.x.locked);
      const listF = editable ? sh.valid[it.ref] : null;
      it.cls = (editable ? 'xl-in' : 'xl-f') + (isF ? ' xl-fx' : '');
      if (it.spill) it.cls += ' xl-sp';
      // 링크 칸: 글이 있으면 누를 때 열린다 (목록 칸·인쇄용 쪽은 제외)
      it.link = !opt.static && !listF && it.inner ? (sh.links && sh.links[it.ref]) || formulaLink(book, sh, it.cell) : null;
      if (it.link) it.cls += ' xl-lnk';
      it.td = (inner) => `<td${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''} data-ref="${it.ref}" class="${it.cls}"${listF || !editable ? '' : ' tabindex="0"'}${it.link ? linkAttrs(it.link, editable) : ''} style="${esc(it.css)}">${inner}</td>`;
      if (listF) {
        // 목록 칸: 값은 원래 값, 보이는 글은 칸의 표시 형식대로
        const opts = listOptions(book, sh, listF); const cur = it.v == null ? '' : formatValue(it.v, 'General');
        it.list = true;
        const lab = (o) => esc(o === '' ? '' : formatValue(isNaN(Number(o)) || o === '' ? o : Number(o), it.fmt));
        it.html = it.td(`<select class="xl-sel" data-ref="${it.ref}" style="text-align-last:${ta === 'justify' ? 'center' : ta}">${opts.includes(cur) ? '' : `<option value="${esc(cur)}">${lab(cur)}</option>`}${opts.map((o) => `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${lab(o)}</option>`).join('')}</select>`);
      } else it.html = it.td(it.inner);
      byRef.set(it.ref, it);
    }
    return { rows, cols, cw, rh, info, list, byRef, width: sum(cw), height: sum(rh) };
  }
  // 서식이 섞인 글 (공유 문자열의 조각)
  function richHtml(it, t, f) {
    const cell = it.cell;
    if (!cell || !cell.rich || cell.edited || typeof it.v !== 'string' || t !== it.v) return esc(t);
    return cell.rich.map((r) => {
      const txt = it.wrap ? r.t : r.t.replace(/\r?\n/g, '');
      if (!r.font) return esc(txt);
      const rf = Object.assign({}, r.font, { name: r.font.name || f.name, sz: r.font.sz || f.sz });
      if (!r.font.color) rf.color = f.color;
      const d = fontDecl(rf, f);
      return d ? `<span style="${esc(d)}">${esc(txt)}</span>` : esc(txt);
    }).join('');
  }
  function listOptions(book, sh, f1) {
    if (!f1) return [];
    if (/^".*"$/.test(f1)) return f1.slice(1, -1).split(',');
    const calc = book.calc;
    let rg;
    const m = /^(?:'([^']+)'|([^!]+))!(.+)$/.exec(f1);
    if (m) rg = Object.assign({ sh: book.sheets.find((s) => s.name === (m[1] || m[2])) }, parseRange(m[3]));
    else if (/^\$?[A-Z]+\$?\d+/.test(f1)) rg = Object.assign({ sh }, parseRange(f1));
    else { const d = book.names[sh.idx + ':' + f1] || book.names[f1]; if (!d) return []; return listOptions(book, sh, d); }
    if (!rg.sh) return [];
    const out = [];
    for (let r = rg.r1; r <= Math.min(rg.r2, rg.sh.maxR); r++) for (let c = rg.c1; c <= Math.min(rg.c2, rg.sh.maxC); c++) { const v = calc.value(rg.sh, r, c); if (v != null && v !== '') out.push(formatValue(v, 'General')); }
    return out;
  }
  // 그림·도형을 표 위에 겹쳐 그린다 (x0,y0: 그린 영역의 왼쪽 위 = 시트 좌표)
  function drawHtml(book, sh, rows, cols, opt = {}) {
    if (!sh.draw.length) return '';
    const G = geom(book, sh), E = 9525;
    const hidC = (c) => !cols.includes(c), x0 = G.colX(cols[0]), y0 = G.rowY(rows[0]);
    const X = (c, o) => G.colX(c) + Math.min(o / E, G.col(c)) - x0, Y = (r, o) => G.rowY(r) + Math.min(o / E, G.row(r)) - y0 + (opt.dy || 0);
    void hidC;
    let out = '';
    for (const a of sh.draw) {
      let x, y, w, h;
      if (a.pos) { x = a.pos.x / E - x0; y = a.pos.y / E - y0; w = a.ext.cx / E; h = a.ext.cy / E; }
      else if (a.type === 'oneCellAnchor' || !a.to) { x = X(a.from.c, a.from.co); y = Y(a.from.r, a.from.ro); w = a.ext ? a.ext.cx / E : 0; h = a.ext ? a.ext.cy / E : 0; }
      else { x = X(a.from.c, a.from.co); y = Y(a.from.r, a.from.ro); w = X(a.to.c, a.to.co) - x; h = Y(a.to.r, a.to.ro) - y; }
      if (opt.rowLo && (a.from.r < opt.rowLo || a.from.r > opt.rowHi)) continue;
      for (const it of a.items) {
        let ix = x, iy = y, iw = w, ih = h;
        if (it.rel && it.grp) { const sx = w / (it.grp.cx / E || 1), sy = h / (it.grp.cy / E || 1); ix = x + it.rel.x / E * sx; iy = y + it.rel.y / E * sy; iw = it.rel.cx / E * sx; ih = it.rel.cy / E * sy; }
        if (iw <= 0 && ih <= 0) continue;
        const tf = it.xf && (it.xf.rot || it.xf.fh || it.xf.fv) ? `transform:${it.xf.rot ? `rotate(${it.xf.rot}deg)` : ''}${it.xf.fh ? ' scaleX(-1)' : ''}${it.xf.fv ? ' scaleY(-1)' : ''};` : '';
        const box = `left:${ix.toFixed(1)}px;top:${iy.toFixed(1)}px;width:${Math.max(0, iw).toFixed(1)}px;height:${Math.max(0, ih).toFixed(1)}px;${tf}`;
        // 링크가 걸린 그림·도형은 누를 수 있게
        const lkc = it.link ? ' xl-link-shp' : '', lka = it.link ? linkAttrs(it.link, false) : '';
        if (it.kind === 'pic') {
          if (it.crop && it.crop.some(Boolean)) {
            const [l, t, r, b] = it.crop, sw = 1 - l - r, shh = 1 - t - b;
            out += `<div class="xl-img${lkc}"${lka} style="${box}overflow:hidden"><img src="${esc(it.src)}" alt="" style="position:absolute;left:${(-l / sw * 100).toFixed(2)}%;top:${(-t / shh * 100).toFixed(2)}%;width:${(100 / sw).toFixed(2)}%;height:${(100 / shh).toFixed(2)}%"></div>`;
          } else out += `<img class="xl-img${lkc}"${lka} src="${esc(it.src)}" alt="" style="${box}">`;
        } else if (it.chart) out += `<div class="xl-shp xl-chart" style="${box}">차트</div>`;
        else if (it.geom === 'line' || it.geom === 'straightConnector1' || /Connector/.test(it.geom) || it.kind === 'cxnSp') {
          const fl = it.xf && (it.xf.fh !== it.xf.fv);
          out += `<svg class="xl-shp" style="${box.replace(tf, '')}overflow:visible" viewBox="0 0 ${Math.max(1, iw).toFixed(1)} ${Math.max(1, ih).toFixed(1)}" preserveAspectRatio="none"><line x1="0" y1="${fl ? ih.toFixed(1) : 0}" x2="${iw.toFixed(1)}" y2="${fl ? 0 : ih.toFixed(1)}" stroke="${esc(it.line || '#000')}" stroke-width="${it.lw.toFixed(2)}"${it.dash !== 'solid' ? ' stroke-dasharray="4 3"' : ''}/></svg>`;
        } else {
          const st = [box];
          if (it.fill) st.push('background:' + it.fill);
          if (it.line) st.push(`border:${Math.max(0.5, it.lw).toFixed(2)}px ${it.dash !== 'solid' ? 'dashed' : 'solid'} ${it.line}`);
          if (it.geom === 'ellipse') st.push('border-radius:50%'); else if (it.geom === 'roundRect') st.push('border-radius:' + (Math.min(iw, ih) * 0.17).toFixed(1) + 'px');
          let txt = '';
          if (it.paras) {
            st.push(`padding:${it.ins[1].toFixed(1)}px ${it.ins[2].toFixed(1)}px ${it.ins[3].toFixed(1)}px ${it.ins[0].toFixed(1)}px`, 'justify-content:' + (it.anchor === 'ctr' ? 'center' : it.anchor === 'b' ? 'flex-end' : 'flex-start'));
            if (it.vert) st.push('writing-mode:vertical-rl');
            txt = it.paras.map((p) => `<div style="text-align:${p.algn === 'ctr' ? 'center' : p.algn === 'r' ? 'right' : p.algn === 'just' || p.algn === 'dist' ? 'justify' : 'left'};font-size:${pxs(p.sz || (p.runs.find((r) => r.sz) || {}).sz || 11)}">${p.runs.map((r) => (r.br ? '<br>' : `<span style="${esc([r.sz ? 'font-size:' + pxs(r.sz) : '', r.b ? 'font-weight:700' : '', r.i ? 'font-style:italic' : '', r.u ? 'text-decoration:underline' : '', r.color ? 'color:' + r.color : '', r.font ? 'font-family:' + famCss(r.font) : ''].filter(Boolean).join(';'))}">${esc(r.t)}</span>`)).join('') || '&#8203;'}</div>`).join('');
          }
          if (it.tcolor) st.push('color:' + it.tcolor);
          out += `<div class="xl-shp${lkc}"${lka} style="${esc(st.join(';'))}">${txt}</div>`;
        }
      }
    }
    return out;
  }
  const visRows = (book, sh, g) => { const G = geom(book, sh), out = []; for (let r = g.r1; r <= g.r2; r++) if (G.row(r) > 0) out.push(r); return out.length ? out : [g.r1]; };
  const visCols = (book, sh, g) => { const G = geom(book, sh), out = []; for (let c = g.c1; c <= g.c2; c++) if (G.col(c) > 0) out.push(c); return out.length ? out : [g.c1]; };
  function tableHtml(book, sh, M, opt = {}) {
    const def = book.font0;
    let html = `<table class="xl-sheet${sh.grid ? '' : ' xl-nogrid'}${sh.page.grid ? ' xl-pgrid' : ''}" style="width:${M.width}px;font-family:${esc(famCss(def.name))};font-size:${pxs(def.sz || 11)}${def.color ? ';color:' + def.color : ''}"><colgroup>${M.cw.map((w, i) => `<col data-c="${M.cols[i]}" style="width:${w}px">`).join('')}</colgroup>`;
    const byRow = new Map(); M.list.forEach((it) => { if (!byRow.has(it.r)) byRow.set(it.r, []); byRow.get(it.r).push(it); });
    M.rows.forEach((r, i) => { html += `<tr data-r="${r}" style="height:${M.rh[i]}px">${(byRow.get(r) || []).map((it) => it.html).join('')}</tr>`; });
    html += '</table>';
    return `<div class="xl-pg" style="width:${M.width}px">${html}${drawHtml(book, sh, M.rows, M.cols, opt)}</div>`;
  }
  function renderSheet(book, sh) {
    const rows = visRows(book, sh, sh.range), cols = visCols(book, sh, sh.range);
    const M = buildModel(book, sh, rows, cols);
    return { html: tableHtml(book, sh, M), width: M.width, model: M };
  }

  /* ── 인쇄: 엑셀 쪽 설정(용지·방향·여백·배율·한쪽 맞춤·나누기·인쇄 제목)대로 쪽을 나눈다 ── */
  const PAPER = { 1: [215.9, 279.4], 3: [279.4, 431.8], 5: [215.9, 355.6], 7: [184.15, 266.7], 8: [297, 420], 9: [210, 297], 11: [148, 210], 12: [257, 364], 13: [182, 257], 66: [420, 594], 70: [105, 148] };
  function printPages(book, sh) {
    const P = sh.page, G = geom(book, sh);
    let [pw, ph] = PAPER[P.paper] || PAPER[9];
    if (P.land) [pw, ph] = [ph, pw];
    const IN = 96, MM = 96 / 25.4;
    // 바깥 테두리(겹친 테두리의 바깥 절반)가 잘리지 않게 4px 여유를 둔다
    const avW = pw * MM - (P.ml + P.mr) * IN - 4, avH = ph * MM - (P.mt + P.mb) * IN - 4;
    const rows = visRows(book, sh, sh.range), cols = visCols(book, sh, sh.range);
    const titles = P.titles ? rows.filter((r) => r >= P.titles[0] && r <= P.titles[1]) : [];
    const tH = sum(titles.map(G.row));
    const split = (ids, size, lim, brk, reserve) => {
      const groups = []; let cur = [], acc = 0, L = lim;
      ids.forEach((id) => {
        const s = size(id);
        if (cur.length && (acc + s > L + 0.5 || brk.has(id - 1))) { groups.push(cur); cur = []; acc = 0; L = lim - reserve(cur, id); }
        cur.push(id); acc += s;
      });
      if (cur.length) groups.push(cur);
      return groups;
    };
    // '한 페이지에 맞추기'를 쓰면 엑셀은 수동 쪽 나누기를 무시한다
    const none = new Set();
    const rowSplit = (s) => split(rows, G.row, avH / s, P.fit ? none : P.rb, (g, id) => (titles.length && id > titles[titles.length - 1] ? tH : 0));
    const colSplit = (s) => split(cols, G.col, avW / s, P.fit ? none : P.cb, () => 0);
    let s = Math.min(4, Math.max(0.1, P.scale / 100));
    if (P.fit) {
      const tw = sum(cols.map(G.col)), th = sum(rows.map(G.row));
      s = 1;
      if (P.fw) s = Math.min(s, avW * P.fw / tw);
      if (P.fh) s = Math.min(s, avH * P.fh / th);
      s = Math.max(0.1, Math.floor(s * 100 + 1e-6) / 100);
      while (s > 0.1 && ((P.fw && colSplit(s).length > P.fw) || (P.fh && rowSplit(s).length > P.fh))) s = Math.round((s - 0.01) * 100) / 100;
    }
    const cg = colSplit(s), rg = rowSplit(s);
    const order = [];
    if (P.order === 'overThenDown') rg.forEach((r) => cg.forEach((c) => order.push([r, c]))); else cg.forEach((c) => rg.forEach((r) => order.push([r, c])));
    const pages = order.map(([rs, cs]) => {
      const pre = titles.length && rs[0] > titles[titles.length - 1] ? titles : [];
      const M = buildModel(book, sh, pre.concat(rs), cs, { static: true });
      const dy = pre.length ? tH : 0;
      // 그림은 이 쪽 본문 행 기준으로 놓는다
      const body = tableHtml(book, sh, Object.assign({}, M), { dy: 0 });
      void dy;
      return `<div class="xl-pp" style="width:${pw}mm;height:calc(${ph}mm - 1px);padding:${P.mt}in ${P.mr}in ${P.mb}in ${P.ml}in"><div class="xl-ppi" style="${P.hc ? 'justify-content:center;' : ''}${P.vc ? 'align-items:center;' : ''}"><div class="xl-ppc" style="zoom:${s}">${body}</div></div></div>`;
    });
    return { html: `<style>@page { size: ${pw}mm ${ph}mm; margin: 0; }</style>${pages.join('')}`, scale: s, count: pages.length };
  }

  /* ── 화면에 붙이기 ── */
  function editText(v, fmt) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (isErr(v)) return v.err;
    const sec = compileFmt(fmt || 'General')[0];
    if (sec && sec.date) {
      const hasD = sec.toks.some((t) => t.k === 'dt' && !t.min && /^[ymdeag]/.test(t.t)), hasT = sec.toks.some((t) => t.k === 'el' || t.k === 'ap' || (t.k === 'dt' && (t.min || /^[hs]/.test(t.t))));
      const d = hasD || v >= 1 ? fmtDateSec(v, compileSec('yyyy-mm-dd')).s : '';
      const t = hasT || v % 1 ? fmtDateSec(v, compileSec(v % 60 / 86400 ? 'h:mm:ss' : 'h:mm')).s : '';
      return [d, hasT || (!hasD && t) ? t : v % 1 ? t : ''].filter(Boolean).join(' ');
    }
    if (sec && sec.pct) return numStr(Number((v * 100).toPrecision(15))) + '%';
    return numStr(v);
  }
  function mount(host, book, onChange) {
    const visible = book.sheets.filter((s) => !s.hidden);
    let cur = book.sheets[book.activeTab] && !book.sheets[book.activeTab].hidden ? book.sheets[book.activeTab] : visible[0];
    let model = null, ptimer = 0;
    const preparePrint = () => {
      clearTimeout(ptimer);
      let box = host.querySelector(':scope > .xl-print');
      if (!box) { box = document.createElement('div'); box.className = 'xl-print'; host.appendChild(box); }
      try { const P = printPages(book, cur); box.innerHTML = P.html; host.dataset.pages = P.count; host.dataset.printScale = P.scale; } catch (e) { console.error(e); }
    };
    const schedule = () => { clearTimeout(ptimer); ptimer = setTimeout(() => { if (host.isConnected) preparePrint(); }, 400); };
    const draw = () => {
      const R = renderSheet(book, cur); model = R.model;
      host.innerHTML = `${visible.length > 1 ? `<div class="xl-tabs">${visible.map((s) => `<button type="button" class="${s === cur ? 'on' : ''}" data-sh="${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div>` : ''}<div class="xl-wrap"><div class="xl-zoom">${R.html}</div></div><div class="xl-print"></div>`;
      host.dataset.width = R.width;
      // 웹에서 계산하지 못하는 함수가 있으면 알린다 (그 칸은 엑셀에 저장된 값을 보여 줌)
      if (book.calc.missing.size) host.insertAdjacentHTML('afterbegin', `<div class="xl-miss">이 파일의 함수 일부(${esc([...book.calc.missing].join(', '))})는 웹에서 계산하지 못해 엑셀에 저장된 값을 보여 줘요. 그 칸이 바뀌어야 하면 엑셀에서 열어 주세요.</div>`);
      const fit = () => { const wr = host.querySelector('.xl-wrap'); if (!wr) return; const w = wr.clientWidth - 4; host.querySelector('.xl-zoom').style.zoom = w > 0 ? Math.min(1, w / R.width) : 1; };
      fit(); host._fit = fit;
      schedule();
    };
    const patch = (td, m) => {
      if (td._css !== m.css) { td.setAttribute('style', m.css); td._css = m.css; }
      if (td.querySelector('select')) return;
      // 칸 값이 바뀌면 링크도 다시 (글이 지워진 칸, =HYPERLINK(A1) 처럼 주소가 바뀌는 칸)
      td.classList.toggle('xl-lnk', !!m.link);
      if (m.link) { td.dataset.link = m.link.url || ''; td.dataset.loc = m.link.loc || ''; td.title = linkTitle(m.link, td.hasAttribute('tabindex')); }
      else if ('link' in td.dataset) { delete td.dataset.link; delete td.dataset.loc; td.removeAttribute('title'); }
      if (td._inner !== m.inner) { td.innerHTML = m.inner; td._inner = m.inner; }
    };
    const refresh = () => {
      book.calc.recalc();
      model = buildModel(book, cur, model.rows, model.cols);
      host.querySelectorAll('.xl-wrap td[data-ref]').forEach((td) => {
        if (td.contains(document.activeElement) || td.querySelector('.xl-ed')) return;
        const m = model.byRef.get(td.dataset.ref); if (m) patch(td, m);
      });
      schedule();
    };
    function setValue(ref, text) {
      let cell = cur.cells[ref];
      const p = parseRef(ref);
      if (!cell) cell = cur.cells[ref] = { r: p.r, c: p.c, v: null, f: null, s: styleIdx(cur, p.r, p.c), orig: null };
      const x = book.xfs[cell.s] || book.xfs[0];
      const t = text.trim();
      // 수식 칸: 값을 쓰면 수식 대신 그 값, 비우면 원래 수식으로 되돌린다
      if (cell.ov && t === '') { cell.f = cell.f0; cell.arr = cell.arr0; cell.ov = false; cell.edited = false; cell.v = cell.orig; refresh(); onChange && onChange(); return; }
      if (cell.f) { if (t === '') return; cell.f0 = cell.f; cell.arr0 = cell.arr; cell.f = null; cell.arr = false; cell.ov = true; }
      let v = t === '' ? null : t;
      if (t !== '' && x.fmt !== '@') {
        let n = t.replace(/[,\s₩$]/g, '').replace(/(원|km|㎞)$/i, '');
        (x.fmt.match(/"([^"]+)"/g) || []).map((q) => q.slice(1, -1).replace(/\s/g, '')).filter(Boolean).forEach((lit) => { if (n.endsWith(lit)) n = n.slice(0, -lit.length); if (n.startsWith(lit)) n = n.slice(lit.length); });
        const d = parseDate(t), tm = parseTime(t);
        if (isDateFmt(x.fmt) && d != null) v = d;
        else if (tm != null && /:/.test(t)) v = d != null ? d + tm : tm;
        else if (isDateFmt(x.fmt) && /^\d+(\.\d+)?$/.test(n)) v = parseFloat(n);
        else if (/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(n)) v = n.endsWith('%') ? parseFloat(n) / 100 : parseFloat(n);
        else if (/^\(\d+(\.\d+)?\)$/.test(n)) v = -parseFloat(n.slice(1, -1));
        else if (d != null && /[-./월]/.test(t)) v = d;   // 날짜 칸이 아니어도 날짜 모양이면 엑셀처럼 날짜로
        else if (/^(true|false)$/i.test(t)) v = /^true$/i.test(t);
      }
      cell.v = v; cell.edited = true;
      refresh(); onChange && onChange();
    }
    // 칸을 고르면 칸 위에 편집 상자를 겹쳐 띄운다 (엑셀처럼: 고치는 동안 줄 높이·칸 위치가 바뀌지 않게)
    host.addEventListener('focusin', (e) => {
      const td = e.target.closest && e.target.closest('.xl-wrap td.xl-in[tabindex]');
      if (!td || e.target !== td || td.querySelector('.xl-ed')) return;
      const p = parseRef(td.dataset.ref), cell = cur.cells[td.dataset.ref]; const x = book.xfs[cell ? cell.s : styleIdx(cur, p.r, p.c)] || book.xfs[0];
      // 고칠 때는 표시 형식 없이 값 그대로 (엑셀과 같음). 수식 칸은 계산된 값
      const t = editText(cell ? book.calc.value(cur, p.r, p.c) : null, x.fmt);
      const ed = document.createElement('div');
      ed.className = 'xl-ed'; ed.contentEditable = 'true'; ed.spellcheck = false; ed.textContent = t; ed._edit0 = t;
      td.appendChild(ed); ed.focus();
      try { const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents(ed); rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg); } catch (er) { /* 무시 */ }
    });
    host.addEventListener('focusout', (e) => {
      const ed = e.target.closest && e.target.closest('.xl-ed'); if (!ed || ed._done) return;
      ed._done = true;
      const td = ed.closest('td[data-ref]'), text = ed.innerText.replace(/\n$/, '');
      ed.remove();
      if (text !== ed._edit0) setValue(td.dataset.ref, text);
      const m = model.byRef.get(td.dataset.ref); if (m) { td._css = null; td._inner = null; patch(td, m); }
    });
    host.addEventListener('keydown', (e) => {
      // 한글 입력 중(조합 중) Enter 는 글자를 확정하는 키라서 건드리지 않는다. 확정된 뒤 Enter 로 칸을 빠져나간다
      if (e.isComposing || e.keyCode === 229) return;
      const ed = e.target.closest && e.target.closest('.xl-ed');
      if (ed && (e.key === 'Enter' && !e.shiftKey && !e.altKey)) { e.preventDefault(); ed.blur(); }
      else if (ed && e.key === 'Escape') { ed.textContent = ed._edit0; ed.blur(); }
      else if (!ed && e.key === 'Enter' && e.target.matches && e.target.matches('td.xl-in[tabindex]')) { e.preventDefault(); e.target.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }
    });    host.addEventListener('change', (e) => { const s = e.target.closest('select.xl-sel'); if (s) setValue(s.dataset.ref, s.value); });
    host.addEventListener('click', (e) => {
      const b = e.target.closest('.xl-tabs button'); if (b) { cur = book.sheets.find((s) => s.name === b.dataset.sh); draw(); return; }
      // 링크: 칸·그림·도형을 누르면 연다 (엑셀과 같음). Ctrl+누르기는 칸 고치기
      const lk = e.target.closest('.xl-wrap .xl-lnk, .xl-wrap .xl-link-shp');
      if (!lk || e.target.closest('.xl-ed') || e.ctrlKey || e.metaKey) return;
      const act = document.activeElement; if (act && act.classList && act.classList.contains('xl-ed')) act.blur();   // 고치던 칸은 먼저 마무리
      if (lk.dataset.link) window.open(lk.dataset.link, '_blank', 'noopener,noreferrer');
      else if (lk.dataset.loc) goTo(lk.dataset.loc);
    });
    // 링크 칸을 눌렀을 때 편집 상자가 뜨지 않게 (누르는 순간의 칸 선택만 막는다)
    host.addEventListener('mousedown', (e) => {
      const lk = e.target.closest && e.target.closest('.xl-wrap td.xl-lnk');
      if (lk && !e.target.closest('.xl-ed') && !e.ctrlKey && !e.metaKey) e.preventDefault();
    });
    // 파일 안 위치로 가기: 시트!A1, 'A 시트'!$B$2, A1
    function goTo(loc) {
      const m = /^(?:'((?:[^']|'')+)'|([^!']+))!\$?([A-Za-z]{1,3})\$?(\d+)/.exec(loc) || /^()()\$?([A-Za-z]{1,3})\$?(\d+)/.exec(loc);
      if (!m) return;
      const name = (m[1] || m[2] || '').replace(/''/g, "'");
      const to = name ? book.sheets.find((s) => s.name === name) : cur;
      if (!to || to.hidden) return;
      if (to !== cur) { cur = to; draw(); }
      const td = host.querySelector(`.xl-wrap td[data-ref="${m[3].toUpperCase()}${m[4]}"]`);
      if (td) { td.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); td.classList.add('xl-goto'); setTimeout(() => td.classList.remove('xl-goto'), 1600); }
    }
    const onBefore = () => { if (!host.isConnected) { window.removeEventListener('beforeprint', onBefore); return; } preparePrint(); };
    window.addEventListener('beforeprint', onBefore);
    draw();
    return { redraw: draw, fit: () => host._fit && host._fit(), current: () => cur, preparePrint };
  }

  /* ── 저장: 고친 칸만 원본 xml 에 써 넣고, 수식 칸의 저장값도 새로 계산한 값으로 바꾼다 ── */
  function exportXlsx(book) {
    const enc = new TextEncoder(), calc = book.calc;
    const ser = (doc) => enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + new XMLSerializer().serializeToString(doc.documentElement));
    for (const sh of book.sheets) {
      const edited = Object.entries(sh.cells).filter(([, c]) => c.edited);
      const formulas = Object.entries(sh.cells).filter(([, c]) => c.f);
      if (!edited.length && !formulas.length) continue;
      const doc = sh.doc, sd = all(doc, 'sheetData')[0];
      const rowMap = new Map(kids(sd, 'row').map((r) => [+r.getAttribute('r'), r]));
      const cellEl = (ref, cell, make) => {
        let rowEl = rowMap.get(cell.r);
        if (!rowEl) {
          if (!make) return null;
          rowEl = doc.createElementNS(NS_MAIN, 'row'); rowEl.setAttribute('r', cell.r);
          const after = kids(sd, 'row').find((r) => +r.getAttribute('r') > cell.r);
          sd.insertBefore(rowEl, after || null); rowMap.set(cell.r, rowEl);
        }
        let c = kids(rowEl, 'c').find((x) => x.getAttribute('r') === ref);
        if (!c && make) {
          c = doc.createElementNS(NS_MAIN, 'c'); c.setAttribute('r', ref); if (cell.s) c.setAttribute('s', cell.s);
          const after = kids(rowEl, 'c').find((x) => colNum(x.getAttribute('r').replace(/\d+/, '')) > cell.c);
          rowEl.insertBefore(c, after || null);
        }
        return c;
      };
      for (const [ref, cell] of edited) {
        const c = cellEl(ref, cell, true);
        // 덮어쓴 칸이 공유 수식의 기준 칸이면, 같은 묶음 칸들에 수식을 풀어 적는다
        const fe = kid(c, 'f');
        if (fe && fe.getAttribute('t') === 'shared' && fe.textContent) {
          const si = fe.getAttribute('si');
          all(sd, 'f').forEach((g) => {
            if (g === fe || g.getAttribute('t') !== 'shared' || g.getAttribute('si') !== si) return;
            const ce = sh.cells[g.parentNode.getAttribute('r')]; const ff = ce && (ce.f || ce.f0);
            if (!ff) return;
            g.removeAttribute('t'); g.removeAttribute('si'); g.removeAttribute('ref'); g.textContent = ff;
          });
        }
        Array.from(c.children).forEach((n) => c.removeChild(n));
        c.removeAttribute('t');
        if (cell.v == null) continue;
        if (typeof cell.v === 'number') { const v = doc.createElementNS(NS_MAIN, 'v'); v.textContent = String(cell.v); c.appendChild(v); }
        else if (typeof cell.v === 'boolean') { c.setAttribute('t', 'b'); const v = doc.createElementNS(NS_MAIN, 'v'); v.textContent = cell.v ? '1' : '0'; c.appendChild(v); }
        else { c.setAttribute('t', 'inlineStr'); const is = doc.createElementNS(NS_MAIN, 'is'); const t = doc.createElementNS(NS_MAIN, 't'); t.textContent = String(cell.v); if (/^\s|\s$/.test(t.textContent)) t.setAttribute('xml:space', 'preserve'); is.appendChild(t); c.appendChild(is); }
      }
      // 수식 칸: 계산한 값을 저장값(<v>)으로 (열자마자 다시 계산하지 않는 보기 도구도 맞는 값을 보이게)
      for (const [ref, cell] of formulas) {
        const c = cellEl(ref, cell, false); if (!c || !kid(c, 'f')) continue;
        let v = calc.value(sh, cell.r, cell.c);
        kids(c, 'v').forEach((n) => c.removeChild(n));
        const ve = doc.createElementNS(NS_MAIN, 'v');
        if (typeof v === 'number' && isFinite(v)) { c.removeAttribute('t'); ve.textContent = String(v); }
        else if (typeof v === 'boolean') { c.setAttribute('t', 'b'); ve.textContent = v ? '1' : '0'; }
        else if (isErr(v)) { c.setAttribute('t', 'e'); ve.textContent = v.err; }
        else { c.setAttribute('t', 'str'); ve.textContent = v == null ? '' : String(v); }
        c.appendChild(ve);
      }
      const f = book.files.find((x) => x.name === sh.path);
      f.data = ser(doc);
    }
    // 열 때 통합 문서 전체를 다시 계산하게 한다
    const wb = book.wbDoc, root = wb.documentElement;
    let cp = kid(root, 'calcPr');
    if (!cp) {
      cp = wb.createElementNS(NS_MAIN, 'calcPr');
      const after = Array.from(root.children).find((n) => ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'].includes(n.localName));
      root.insertBefore(cp, after || null);
    }
    cp.setAttribute('fullCalcOnLoad', '1');
    const wf = book.files.find((x) => x.name === 'xl/workbook.xml');
    wf.data = ser(wb);
    // 계산 순서 기록(calcChain)은 빼도 엑셀이 다시 만든다. 덮어쓴 수식이 남아 있으면 '복구' 창이 뜨므로 지운다
    let files = book.files.slice();
    if (files.some((x) => x.name === 'xl/calcChain.xml')) {
      files = files.filter((x) => x.name !== 'xl/calcChain.xml').map((x) => {
        if (x.name !== 'xl/_rels/workbook.xml.rels' && x.name !== '[Content_Types].xml') return x;
        const d = parse(x.data);
        all(d, x.name === '[Content_Types].xml' ? 'Override' : 'Relationship').forEach((n) => { if (/calcChain/.test(n.getAttribute('PartName') || n.getAttribute('Target') || '')) n.parentNode.removeChild(n); });
        return { name: x.name, data: ser(d) };
      });
    }
    const blob = HwpxEditor._zip(files);
    return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function open(b64) {
    const book = await load(b64);
    book.calc = makeCalc(book);
    return book;
  }

  // 입력한 칸만 꺼내기 {시트이름: {A1: 값}} · 다시 넣기 (내 양식 자동 저장용). 수식 칸에 쓴 값은 수식 대신 그 값
  function getEdits(book) {
    const out = {};
    book.sheets.forEach((sh) => Object.keys(sh.cells).forEach((ref) => { const c = sh.cells[ref]; if (c.edited || c.ov) (out[sh.name] = out[sh.name] || {})[ref] = c.v == null ? '' : c.v; }));
    return out;
  }
  function applyEdits(book, edits) {
    let n = 0;
    Object.keys(edits || {}).forEach((name) => {
      const sh = book.sheets.find((s) => s.name === name); if (!sh) return;
      Object.keys(edits[name]).forEach((ref) => {
        const p = parseRef(ref); if (!p) return;
        let c = sh.cells[ref]; if (!c) c = sh.cells[ref] = { r: p.r, c: p.c, v: null, f: null, s: styleIdx(sh, p.r, p.c), orig: null };
        const v = edits[name][ref];
        if (c.f) { c.f0 = c.f; c.arr0 = c.arr; c.f = null; c.arr = false; c.ov = true; }
        c.v = v === '' ? null : v; c.edited = true; n++;
      });
    });
    if (n) book.calc.recalc();
    return n;
  }
  window.XlsxView = { open, mount, exportXlsx, getEdits, applyEdits, _formula: { parseFormula, formatValue } };
})();
