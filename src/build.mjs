// build.mjs: src 를 배포용으로 묶는다.
// 실행: node src/build.mjs --icons <tabler outline 폴더>   (npm i @tabler/icons 뒤 node_modules/@tabler/icons/icons/outline)
//  - demo(기본): 공모전 제출판. 가상 학교 OO고, 학교명·실명을 지운 자료 → output/site
// 하는 일: (1) 아이콘 고르기 (2) Apps Script 코드 담기 (3) CSS·JS 를 index.html 하나로 합치기 (4) 도구·양식·수업 자료 복사
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SRC, '..');
const PRIV = path.join(ROOT, 'private');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FLAVOR = arg('--flavor') || 'demo';
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const readAbs = (p) => fs.readFileSync(p, 'utf8');

const FLAVORS = {
  // 시연판(가상 학교). 결과는 docs/ (GitHub Pages 가 이 폴더를 그대로 사이트로 연다)
  demo: { out: path.join(ROOT, 'docs'), forms: path.join(SRC, 'forms'), lessons: [path.join(SRC, 'lessons')], override: {}, config: { flavor: 'demo' } }
};
const F = FLAVORS[FLAVOR];
if (!F) throw new Error('알 수 없는 판: ' + FLAVOR);
// 생기부 도우미 웹앱(Apps Script, 선생님 각자 Google 계정으로 실행) 주소.
// 생기부 도우미 웹앱(Apps Script) 주소. 각자 자기 Google 계정으로 실행된다. 학교에서 따로 배포했다면 이 주소를 바꾸세요.
const SGB_URL = 'https://script.google.com/macros/s/AKfycbyMVUw_equYXMDl3Vl279dHzjvCgYQVfES1fumLq1hiTeHuo805vikR5SxKmTsw3jVk/exec';
F.config = Object.assign({}, F.config, { sgbUrl: SGB_URL });
if (arg('--api')) F.config = Object.assign({}, F.config, { flavor: 'school', api: arg('--api') });
if (arg('--title')) F.config = Object.assign({}, F.config, { title: arg('--title') });
// 새 학교(setup.mjs): 처음 설정 화면의 학교 이름, 가상 학교 규정집은 넣지 않음
if (arg('--school')) F.config = Object.assign({}, F.config, { schoolName: arg('--school'), fresh: true });
const OUT = arg('--out') ? path.resolve(arg('--out')) : F.out;

// 1) 아이콘
const iconDir = arg('--icons');
// 아이콘 폴더가 없으면 빈 아이콘으로 만들지 않고 멈춘다 (모든 단추 그림이 사라지는 사고 막기)
if (iconDir && !fs.existsSync(path.join(iconDir, 'search.svg'))) { console.error('아이콘 폴더를 찾지 못했어요: ' + iconDir + '\n  npm i @tabler/icons 뒤 icons/outline 폴더를 --icons 로 주세요.'); process.exit(1); }
if (iconDir) {
  const used = new Set();
  for (const f of ['app.js', 'demo-data.js', 'sites.js', 'apps-script/Code.gs']) {
    for (const m of read(f).matchAll(/ic\('([a-z0-9-]+)'|icon: '([a-z0-9-]+)'/g)) used.add(m[1] || m[2]);
  }
  ['tools', 'folder', 'book-2', 'school', 'calendar-check', 'briefcase', 'map-2', 'users', 'confetti', 'file-text', 'directions', 'clipboard-text', 'device-desktop', 'heart', 'flask', 'palette', 'notebook', 'ball-basketball', 'building', 'shield-lock', 'world', 'plus', 'arrow-back-up', 'chevron-up', 'chevron-down', 'school', 'file-type-pdf', 'file-spreadsheet', 'file', 'file-text', 'upload', 'book', 'device-desktop', 'layout-grid', 'users-group', 'paperclip'].forEach((n) => used.add(n));
  const icons = {};
  for (const name of [...used].sort()) {
    const file = path.join(iconDir, name + '.svg');
    if (!fs.existsSync(file)) { console.warn('아이콘 없음:', name); continue; }
    icons[name] = fs.readFileSync(file, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
      .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '').replace(/\s*\n\s*/g, '').trim();
  }
  fs.writeFileSync(path.join(SRC, 'icons.js'),
    '// icons.js: Tabler Icons (MIT License, https://tabler.io/icons) 중 이 앱에서 쓰는 것만 모음. build.mjs 가 생성.\nwindow.ICONS = ' + JSON.stringify(icons, null, 0).replace(/","/g, '",\n"') + ';\n');
  console.log('아이콘', Object.keys(icons).length, '개');
}

// 2) Apps Script 코드, 규정집 원본 PDF 쪽 정보, 판 설정 (판마다 내용이 달라 파일에 쓰지 않고 바로 넣는다)
const generated = {
  'apps-script-source.js': '// 학교 개설 화면에서 복사할 저장소 코드\nwindow.APPS_SCRIPT_SOURCE = ' + JSON.stringify(read('apps-script/Code.gs')) + ';\n',
  'files-index.js': (() => {
    const pf = path.join(F.forms, 'rules.pages.json');
    return '// 규정집 원본 PDF 위치와 규정별 시작 쪽\nwindow.RULES_PDF = ' + JSON.stringify(fs.existsSync(pf) ? { url: 'files/rules.pdf', pages: JSON.parse(readAbs(pf)) } : null) + ';\n';
  })(),
  'config.js': '// 판 설정 (제출판/학교 운영판)\nwindow.GIL_CONFIG = ' + JSON.stringify(F.config) + ';\n'
};
// 개발용 원본에서도 열리도록 같은 내용을 src 에 남긴다 (제출판 기준)
if (FLAVOR === 'demo') for (const [n, c] of Object.entries(generated)) fs.writeFileSync(path.join(SRC, n), c);
const scriptOf = (src) => generated[src] || (F.override[src] ? readAbs(F.override[src]) : read(src));

// 3) 한 파일로 합치기
let html = read('index.html');
html = html.replace(/<!-- index\.html:[^>]*-->/, '<!-- 우리학교 길잡이 (build.mjs 로 생성) -->');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + read('styles.css') + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>\n' + scriptOf(src).replace(/<\/script/gi, '<\\/script') + '\n</script>');
if (F.config.title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${F.config.title}</title>`);
fs.mkdirSync(OUT, { recursive: true });
// (학교 로고 아이콘을 쓰는 운영판 기능. 공개판에서는 쓰지 않음)
const ICONS_DIR = FLAVOR === 'gg' ? path.join(PRIV, 'gg', 'icons') : null;
if (ICONS_DIR && fs.existsSync(path.join(ICONS_DIR, 'apple-touch-icon.png'))) {
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  for (const f of fs.readdirSync(ICONS_DIR)) fs.copyFileSync(path.join(ICONS_DIR, f), path.join(OUT, 'icons', f));
  const name = F.config.title || '우리학교 길잡이', short = F.config.shortName || name.replace(/등학교|학교/g, '').trim();
  fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
    name, short_name: short, start_url: './', scope: './', display: 'standalone', background_color: '#ffffff', theme_color: '#1f3b73', lang: 'ko',
    icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
  }, null, 2));
  html = html.replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="64x64" href="icons/favicon-64.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="apple-mobile-web-app-title" content="${short}">
<meta name="application-name" content="${short}">`);
}
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// fs.cpSync 는 이 PC(Windows·Node 24)에서 비정상 종료되어 직접 복사한다. 바뀐 파일만 덮어쓴다.
function copyDir(from, to, skip) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip && skip.test(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, skip);
    else {
      const sa = fs.statSync(a);
      if (fs.existsSync(b)) { const sb = fs.statSync(b); if (sb.size === sa.size && sb.mtimeMs >= sa.mtimeMs) continue; }
      fs.copyFileSync(a, b);
    }
  }
}
copyDir(path.join(SRC, 'tools'), path.join(OUT, 'tools'));
copyDir(path.join(SRC, 'vendor', 'pdfjs'), path.join(OUT, 'vendor', 'pdfjs'));
copyDir(path.join(SRC, 'apps'), path.join(OUT, 'apps'));
if (FLAVOR === 'gg') copyDir(path.join(PRIV, 'gg', 'media'), path.join(OUT, 'media'));
for (const dir of F.lessons) copyDir(dir, path.join(OUT, 'lessons'), /\.py$/);
fs.mkdirSync(path.join(OUT, 'files'), { recursive: true });
for (const f of fs.readdirSync(F.forms)) if (/\.(pdf|hwpx|xlsx)$/i.test(f)) fs.copyFileSync(path.join(F.forms, f), path.join(OUT, 'files', f));
fs.writeFileSync(path.join(OUT, 'Code.gs'), read('apps-script/Code.gs'));

// 생기부 도우미 체험판: 웹앱 화면(Index.html)에 브라우저 저장소(local.js)와 공통 부분(Core.js)을 넣어 로그인 없이 돌린다
{
  const sg = (p) => read(path.join('saenggibu', p));
  let page = sg('gas/Index.html')
    .replace(/<base target="_top">\r?\n/, '')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx@[^"]+"><\/script>/, '<script src="../../tools/attendance/lib/xlsx.full.min.js"></script>')
    .replace('<title>생기부 도우미</title>', '<title>생기부 도우미 체험판</title>');
  const inject = '<script>\nwindow.SGB_GAS_URL = ' + JSON.stringify(SGB_URL) + ';\n' + sg('local.js') + '\n' + sg('gas/Core.js') + '\n</script>\n';
  page = page.replace(/<script>\r?\n\(function\(\)\{/, (m) => inject + m);
  if (!page.includes('SGB_GAS_URL =') || !page.includes('tools/attendance/lib/xlsx')) throw new Error('생기부 체험판 만들기 실패');
  fs.mkdirSync(path.join(OUT, 'apps', 'saenggibu'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'apps', 'saenggibu', 'index.html'), page);
}
console.log(`완성(${FLAVOR}):`, path.join(OUT, 'index.html'), (html.length / 1024).toFixed(0) + 'KB');

// 4) 제출판만: 확인용 링크(claude.ai 아티팩트) 판
if (FLAVOR === 'demo') {
  const ART = path.join(ROOT, 'output', 'artifact');
  let art = html
    .replace(/<!doctype html>\s*/i, '').replace(/<!--[^>]*build\.mjs[^>]*-->\s*/, '')
    .replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*$/i, '')
    .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '')
    .replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '')
    .replace(/<!-- Pretendard[^>]*-->\s*<link[^>]*pretendard[^>]*>\s*/i, '');
  const tm = art.match(/<title>[^<]*<\/title>/);
  if (tm) art = tm[0] + '\n' + art.replace(tm[0], '');
  fs.mkdirSync(path.join(ART, 'tools', 'proctor'), { recursive: true });
  fs.writeFileSync(path.join(ART, 'index.html'), art);
  fs.copyFileSync(path.join(SRC, 'tools', 'proctor', 'index.html'), path.join(ART, 'tools', 'proctor', 'index.html'));
}
