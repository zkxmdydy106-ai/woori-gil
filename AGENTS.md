# AGENTS.md — AI 에이전트용 설치 안내 (Claude Code · Codex · Antigravity 공통)

이 저장소는 **우리학교 길잡이**(우리 학교 전용 자료 공간)입니다. 사용자는 대부분 **코딩을 모르는 학교 선생님**입니다.
사용자가 "설치해 줘"라고 하면 아래 순서대로 **직접 실행**하고, 사용자에게는 쉬운 한국어로 짧게 알려 주세요.

## 목표

사용자의 Cloudflare 무료 계정에 그 학교의 길잡이 사이트(`https://<영어이름>.pages.dev`)를 만든다.

## 순서

1. **학교 이름**과 **사이트 영어 이름**(소문자·숫자·`-`, 예: `hanbit-gil`)을 확인한다. 사용자가 말하지 않았으면 한 번에 묻는다.
2. `node -v` 로 Node.js 18 이상인지 확인한다.
   - 없거나 낮으면: Windows 는 `winget install OpenJS.NodeJS.LTS`, Mac 은 `brew install node` 를 **사용자에게 허락받고** 실행하거나, https://nodejs.org 의 LTS 설치 파일을 안내한다. 설치 뒤에는 새 터미널이 필요할 수 있다.
3. 저장소 폴더(이 파일이 있는 곳)에서 실행한다:
   ```
   node setup.mjs --school "<학교 이름>" --name <영어 이름>
   ```
   - 처음이면 `npm install` 을 스스로 하고(1~3분), Cloudflare 로그인을 위해 **브라우저를 연다**.
   - 이때 사용자에게 "브라우저에서 Cloudflare 에 로그인(없으면 무료 가입)하고 **Allow** 를 눌러 주세요"라고 알리고 기다린다.
   - 사이트 이름이 이미 쓰이고 있으면 다른 이름을 사용자에게 제안하고 다시 실행한다.
4. 끝나면 사용자에게 알린다:
   - 사이트 주소 (`gil.config.json` 의 `url`)
   - 주소를 열어 **처음 설정**에서 학교 접속 코드(선생님들께 알릴 것)와 관리자 비밀번호(본인만)를 정할 것
   - 배포 직후 1~2분은 주소가 열리지 않을 수 있음

## 다른 요청

| 사용자 말 | 할 일 |
|---|---|
| 업데이트해 줘 | `git pull` (git 으로 받은 경우) → `node setup.mjs --update`. 학교 자료는 그대로 남는다 |
| 백업해 줘 | `node setup.mjs --backup` → `backups/` 폴더 |
| 급식·학사일정 넣어 줘 | 인증키는 비밀이므로 **사용자가 직접 터미널에서** `node setup.mjs --neis` 를 실행하게 안내한다 |
| 다른 컴퓨터에서 업데이트 | 원래 컴퓨터의 `gil.config.json`, `cloudflare/wrangler.toml` 을 같은 위치에 복사해 오게 한다 |

## 꼭 지킬 것 (보안)

- 비밀번호·인증키·접속 코드를 **채팅으로 받지 말고**, 파일·코드·커밋에 적지 않는다. 나이스 인증키는 `wrangler pages secret` 으로만 들어간다.
- 관리자 비밀번호·접속 코드는 사용자가 사이트 화면에서 직접 정한다. 대신 정해 주지 않는다.
- 사용자가 부탁하지 않으면 `src/` 코드를 고치지 않는다. 다른 Cloudflare 프로젝트·데이터베이스를 지우거나 바꾸지 않는다.
- `gil.config.json`, `cloudflare/wrangler.toml`, `backups/` 는 공개 저장소에 올리지 않는다 (`.gitignore` 에 있음).

## 문제가 생기면

- `npm` 이 없다 → Node.js 를 설치한다 (npm 이 같이 깔린다).
- Cloudflare 로그인이 안 끝난다 → `npx wrangler logout` 뒤 `node setup.mjs` 를 다시 실행한다.
- 회사·학교 망에서 막힌다 → 다른 네트워크(휴대폰 테더링 등)로 다시 해 본다.
- 주소가 404 → 1~2분 기다린 뒤 새로고침. 계속되면 `node setup.mjs --update`.
- 자세한 사람용 안내: https://zkxmdydy106-ai.github.io/woori-gil/guide/
