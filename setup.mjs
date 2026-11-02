#!/usr/bin/env node
// setup.mjs — 우리 학교 길잡이를 Cloudflare 에 자동으로 설치·업데이트·백업한다.
//
//   처음 설치   node setup.mjs                         (학교 이름·사이트 이름을 물어봐요)
//              node setup.mjs --school "한빛고등학교" --name hanbit-gil   (묻지 않고 바로 — AI 에이전트용)
//   업데이트    node setup.mjs --update                 (새 버전 화면만 다시 올림. 학교 자료는 그대로)
//   백업       node setup.mjs --backup                 (backups/ 폴더에 문서와 올린 파일 전부)
//   되살리기    node setup.mjs --restore backups/<파일>.sql   (지금 상태를 먼저 백업한 뒤 되살려요)
//   급식·학사   node setup.mjs --neis                   (나이스 교육청·학교 코드와 인증키 넣기)
//
// 필요한 것: Node.js 18 이상, Cloudflare 무료 계정. 처음 한 번 브라우저에서 Cloudflare 로그인을 허용하면 돼요.
// 인증키·비밀번호는 이 파일이나 설정 파일에 저장하지 않아요 (나이스 인증키는 Cloudflare 비밀 설정으로만).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { backupAll, restoreAll } from './gil-backup.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CF = path.join(ROOT, 'cloudflare');
const CONF = path.join(ROOT, 'gil.config.json');
const WR = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const ICONS = path.join(ROOT, 'node_modules', '@tabler', 'icons', 'icons', 'outline');
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };

const C = { g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
let stepNo = 0;
const step = (t) => console.log('\n' + C.b(`[${++stepNo}] ${t}`));
const ok = (t) => console.log(C.g('  ✔ ' + t));
const info = (t) => console.log(C.d('  · ' + t));
const die = (t, hint) => { console.error('\n' + C.r('✖ ' + t)); if (hint) console.error(C.y('  → ' + hint)); process.exit(1); };

// wrangler 실행. capture=true 면 출력을 돌려받고, 아니면 화면에 그대로 보여 준다
function wr(args, { capture = false, cwd = CF, allowFail = false } = {}) {
  const r = spawnSync(process.execPath, [WR, ...args], { cwd, encoding: 'utf8', stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit', env: Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false' }) });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 && !allowFail) die('Cloudflare 명령이 실패했어요: wrangler ' + args.join(' '), out.trim().split('\n').slice(-6).join('\n    ') || '인터넷 연결과 Cloudflare 로그인을 확인해 주세요.');
  return { ok: r.status === 0, out };
}
function node(args, cwd = ROOT) {
  const r = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) die('명령이 실패했어요: node ' + args.join(' '));
}
const jsonIn = (s) => { const i = s.indexOf('['); try { return JSON.parse(s.slice(i)); } catch (e) { return null; } };
const readConf = () => { try { return JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch (e) { return null; } };
const saveConf = (c) => fs.writeFileSync(CONF, JSON.stringify(c, null, 2) + '\n');

async function ask(q, def) {
  if (!process.stdin.isTTY) return def || '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(C.b('? ') + q + (def ? C.d(` (${def})`) : '') + ' ')).trim();
  rl.close();
  return a || def || '';
}

// ── 준비: Node 버전, 꾸러미(wrangler·아이콘) ──
function prepare() {
  step('준비물 확인');
  const major = +process.versions.node.split('.')[0];
  if (major < 18) die(`Node.js ${process.versions.node} 은 너무 오래됐어요.`, 'https://nodejs.org 에서 LTS(권장) 버전을 설치한 뒤 다시 실행해 주세요.');
  ok('Node.js ' + process.versions.node);
  if (!fs.existsSync(WR) || !fs.existsSync(path.join(ICONS, 'search.svg'))) {
    info('필요한 꾸러미를 받는 중이에요 (처음 한 번, 1~3분)…');
    const r = spawnSync('npm install --no-audit --no-fund', { cwd: ROOT, stdio: 'inherit', shell: true });
    if (r.status !== 0) die('npm install 이 실패했어요.', '인터넷 연결을 확인하고 다시 실행해 주세요.');
  }
  ok('wrangler·아이콘 준비됨');
}

// ── Cloudflare 로그인 ──
function login() {
  step('Cloudflare 로그인');
  let w = wr(['whoami'], { capture: true, allowFail: true });
  if (!w.ok || /not authenticated|You are not logged in/i.test(w.out)) {
    info('브라우저가 열리면 Cloudflare 에 로그인하고 [Allow] 를 눌러 주세요. (계정이 없으면 무료로 가입)');
    wr(['login']);
    w = wr(['whoami'], { capture: true, allowFail: true });
    if (!w.ok || /not authenticated/i.test(w.out)) die('Cloudflare 로그인을 확인하지 못했어요.', '다시 실행해서 브라우저에서 [Allow] 를 눌러 주세요.');
  }
  const mail = (/associated with the email ([^\s]+?)\.?\s/.exec(w.out) || [])[1];
  ok('로그인됨' + (mail ? ' (' + mail + ')' : ''));
}

function build(conf) {
  step('화면 만들기 (빌드)');
  node(['src/build.mjs', '--icons', ICONS, '--api', '/api', '--out', 'site', '--title', conf.school + ' 길잡이', '--school', conf.school]);
  fs.rmSync(path.join(ROOT, 'output'), { recursive: true, force: true });
  ok('site/ 폴더에 만들었어요');
}

function deploy(conf) {
  step('Cloudflare 에 올리기 (배포)');
  const r = wr(['pages', 'deploy', '--branch', 'main', '--commit-dirty=true'], { capture: true });
  const u = (/https:\/\/[a-z0-9.-]+\.pages\.dev/.exec(r.out) || [])[0];
  ok('올렸어요' + (u ? C.d(' (이번 배포: ' + u + ')') : ''));
  return 'https://' + conf.name + '.pages.dev';
}

function writeToml(conf, keep) {
  let vars = '';
  if (keep && fs.existsSync(path.join(CF, 'wrangler.toml'))) {
    const old = fs.readFileSync(path.join(CF, 'wrangler.toml'), 'utf8');
    const m = /\[vars\][\s\S]*?(?=\n\[\[|\s*$)/.exec(old); if (m) vars = '\n' + m[0].trim() + '\n';
  }
  if (conf.neis) vars = `\n[vars]\nNEIS_ATPT = "${conf.neis.atpt}"\nNEIS_SCHUL = "${conf.neis.schul}"\n`;
  fs.writeFileSync(path.join(CF, 'wrangler.toml'), `# setup.mjs 가 만든 설정이에요. (학교: ${conf.school})
name = "${conf.name}"
pages_build_output_dir = "../site"
compatibility_date = "2024-09-23"
${vars}
[[d1_databases]]
binding = "DB"
database_name = "${conf.name}-db"
database_id = "${conf.d1}"

[[kv_namespaces]]
binding = "FILES"
id = "${conf.kv}"
`);
}

// ── 처음 설치 ──
async function install() {
  console.log(C.b('\n우리 학교 길잡이 설치') + C.d('  — 10분쯤 걸려요. 중간에 브라우저 로그인이 한 번 있어요.'));
  prepare();
  const prev = readConf();
  let school = opt('--school') || (prev && prev.school) || '';
  let name = opt('--name') || (prev && prev.name) || '';
  step('학교 정보');
  if (!school) school = await ask('학교 이름은? (예: 한빛고등학교)');
  if (!school) die('학교 이름이 필요해요.', 'node setup.mjs --school "한빛고등학교" --name hanbit-gil 처럼 넣어 주세요.');
  while (!/^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/.test(name)) {
    if (name) console.log(C.y('  영어 소문자·숫자·- 만, 3~42자로 지어 주세요.'));
    if (!process.stdin.isTTY) die('사이트 이름(영어)이 필요해요.', '--name hanbit-gil 처럼 영어 소문자로 넣어 주세요.');
    name = (await ask('사이트 주소에 쓸 영어 이름은? → https://<이름>.pages.dev', 'gil-' + Math.random().toString(36).slice(2, 7))).toLowerCase();
  }
  ok(`${school} → https://${name}.pages.dev`);
  login();

  step('학교 저장소 만들기 (D1 데이터베이스·파일 칸)');
  const dbName = name + '-db';
  let d1 = (jsonIn(wr(['d1', 'list', '--json'], { capture: true }).out) || []).find((x) => x.name === dbName);
  if (!d1) { const o = wr(['d1', 'create', dbName], { capture: true }).out; const id = (/database_id\s*=\s*"([^"]+)"/.exec(o) || /"database_id"\s*:\s*"([^"]+)"/.exec(o) || [])[1]; d1 = { uuid: id }; }
  if (!d1.uuid) d1 = (jsonIn(wr(['d1', 'list', '--json'], { capture: true }).out) || []).find((x) => x.name === dbName) || {};
  if (!d1.uuid) die('데이터베이스 id 를 찾지 못했어요.', 'Cloudflare 화면(Storage & Databases → D1)에서 ' + dbName + ' 이 생겼는지 확인해 주세요.');
  ok('데이터베이스 ' + dbName);
  const kvTitle = name + '-files';
  let kv = (jsonIn(wr(['kv', 'namespace', 'list'], { capture: true }).out) || []).find((x) => x.title === kvTitle || x.title.endsWith(kvTitle));
  if (!kv) { const o = wr(['kv', 'namespace', 'create', kvTitle], { capture: true }).out; const id = (/id\s*=\s*"([0-9a-f]{32})"/.exec(o) || /"id"\s*:\s*"([0-9a-f]{32})"/.exec(o) || [])[1]; kv = { id }; }
  if (!kv.id) kv = (jsonIn(wr(['kv', 'namespace', 'list'], { capture: true }).out) || []).find((x) => x.title.endsWith(kvTitle)) || {};
  if (!kv.id) die('파일 칸(KV) id 를 찾지 못했어요.', 'Cloudflare 화면(Storage & Databases → KV)을 확인해 주세요.');
  ok('파일 칸 ' + kvTitle);
  const conf = { school, name, d1: d1.uuid, kv: kv.id, neis: prev && prev.neis };
  writeToml(conf, true); saveConf(conf);
  ok('설정 파일 cloudflare/wrangler.toml');

  step('표 만들기');
  wr(['d1', 'execute', dbName, '--remote', '--file', 'schema.sql'], { capture: true });
  ok('문서·분류·수업 자료·도구 표');

  build(conf);
  step('사이트 만들기');
  const pr = wr(['pages', 'project', 'create', name, '--production-branch', 'main'], { capture: true, allowFail: true });
  if (!pr.ok && !/already exists|already taken|8000002/i.test(pr.out)) die('사이트 이름 ' + name + ' 을(를) 쓸 수 없어요.', '다른 영어 이름으로: node setup.mjs --school "' + school + '" --name 다른이름');
  ok('사이트 ' + name);
  const url = deploy(conf);
  conf.url = url; saveConf(conf);

  console.log('\n' + C.g(C.b('✔ 다 됐어요!')));
  console.log('\n  우리 학교 길잡이 주소:  ' + C.b(url));
  console.log('\n  다음 할 일');
  console.log('   1) 위 주소를 열어 ' + C.b('처음 설정') + ' 화면에서 학교 접속 코드와 관리자 비밀번호를 정하세요.');
  console.log('      (처음 배포 직후 1~2분은 주소가 안 열릴 수 있어요. 잠시 뒤 새로고침)');
  console.log('   2) 선생님들께 주소와 접속 코드를 알려 주세요. 관리자 비밀번호는 혼자만!');
  console.log('   3) 새 버전이 나오면:  node setup.mjs --update     백업:  node setup.mjs --backup\n');
}

async function update() {
  const conf = readConf();
  if (!conf || !conf.d1) die('설치 기록(gil.config.json)이 없어요.', '처음이라면 node setup.mjs 로 설치해 주세요. 다른 컴퓨터라면 원래 컴퓨터의 gil.config.json 과 cloudflare/wrangler.toml 을 복사해 오세요.');
  console.log(C.b('\n우리 학교 길잡이 업데이트') + C.d('  — 학교 자료(문서·파일)는 그대로 두고 화면만 새 버전으로'));
  prepare(); login(); writeToml(conf, true);
  step('표 확인');
  wr(['d1', 'execute', conf.name + '-db', '--remote', '--file', 'schema.sql'], { capture: true });
  ok('새로 생긴 표가 있으면 만들었어요 (있던 자료는 건드리지 않아요)');
  build(conf);
  const url = deploy(conf);
  console.log('\n' + C.g('✔ 업데이트했어요: ') + C.b(url) + C.d('  (화면이 그대로면 새로고침)') + '\n');
}

async function backup() {
  const conf = readConf();
  if (!conf || !conf.d1) die('설치 기록(gil.config.json)이 없어요.', '설치한 컴퓨터의 길잡이 폴더에서 실행해 주세요.');
  prepare(); login();
  step('자료 백업');
  const r = saveBackup(conf);
  ok('문서: ' + path.relative(ROOT, r.sql));
  ok(`올린 파일: backups/files/ 에 ${r.total}개 (${(r.bytes / 1048576).toFixed(1)}MB), 이번에 새로 받은 것 ${r.added}개`);
  info('되살리기: node setup.mjs --restore backups/<파일>.sql');
}

const backupOpts = (conf) => ({ wrangler: [process.execPath, WR], cwd: CF, db: conf.name + '-db', kv: conf.kv, dir: path.join(ROOT, 'backups'), log: info });
function saveBackup(conf) {
  const t = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  try { return backupAll({ ...backupOpts(conf), sqlName: `${conf.name}-${t}.sql` }); } catch (e) { die('백업이 끝나지 못했어요: ' + e.message, '인터넷 연결을 확인하고 다시 실행해 주세요. 사이트 자료는 그대로예요.'); }
}

async function restore() {
  const conf = readConf();
  if (!conf || !conf.d1) die('설치 기록(gil.config.json)이 없어요.', '설치한 컴퓨터의 길잡이 폴더에서 실행해 주세요.');
  const sql = opt('--restore');
  if (!sql || !fs.existsSync(path.resolve(ROOT, sql))) die('되살릴 백업 파일을 찾지 못했어요.', 'node setup.mjs --restore backups/<파일>.sql 처럼 넣어 주세요.');
  console.log(C.y('\n지금 사이트의 문서가 이 백업 내용으로 바뀌어요: ' + sql));
  if (!flag('--yes') && (await ask('정말 되살릴까요? "되살리기"라고 입력해 주세요')) !== '되살리기') die('취소했어요. 바뀐 것은 없어요.');
  prepare(); login();
  step('지금 상태 먼저 백업');
  saveBackup(conf);
  step('되살리기');
  try { restoreAll({ ...backupOpts(conf), sql: path.resolve(ROOT, sql) }); } catch (e) { die('되살리지 못했어요: ' + e.message, '방금 만든 백업이 backups/ 폴더에 있어요.'); }
  console.log('\n' + C.g('✔ 되살렸어요: ') + C.b(conf.url || 'https://' + conf.name + '.pages.dev') + '\n');
}

async function neis() {
  const conf = readConf();
  if (!conf || !conf.d1) die('먼저 설치해 주세요 (node setup.mjs).');
  console.log(C.b('\n오늘의 급식·학사일정 (나이스) 연결'));
  info('1) https://open.neis.go.kr 에서 회원 가입 → 인증키 신청 (무료, 바로 나와요)');
  info('2) 학교 기본정보에서 시도교육청 코드(예: N10)와 행정표준코드(7자리)를 확인해요');
  const atpt = opt('--atpt') || await ask('시도교육청 코드는? (예: 서울 B10, 충남 N10)');
  const schul = opt('--schul') || await ask('학교 행정표준코드 7자리는?');
  if (!/^[A-Z]\d{2}$/.test(atpt) || !/^\d{7}$/.test(schul)) die('코드 모양이 달라요.', '교육청 코드는 영어 1자 + 숫자 2자(예: N10), 학교 코드는 숫자 7자리예요.');
  prepare(); login();
  conf.neis = { atpt, schul }; saveConf(conf); writeToml(conf, false);
  step('인증키 넣기');
  info('아래에 나이스 인증키를 붙여 넣고 Enter. (화면에 보이지 않아도 들어가요. 파일에는 저장하지 않아요)');
  wr(['pages', 'secret', 'put', 'NEIS_KEY', '--project-name', conf.name]);
  build(conf); deploy(conf);
  console.log('\n' + C.g('✔ 첫 화면에 오늘의 급식·학사일정이 나와요.') + '\n');
}

const run = flag('--update') ? update : flag('--backup') ? backup : flag('--restore') ? restore : flag('--neis') ? neis : install;
run().catch((e) => die(e.message || String(e)));
