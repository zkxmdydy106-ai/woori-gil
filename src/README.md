# src — 길잡이 소스

- `app.js` 화면 전체, `styles.css` 모양, `search.js` 찾기(초성·한/영 자판·조문), `store.js` 저장소 연결(시연판·구글 시트·Cloudflare)
- `files.js` PDF 보기·글자 뽑기, `xlsx-view.js` 엑셀(수식·인쇄), `hwp-view.js`·`hwpx-editor.js` 한글
- `demo-data.js`·`demo-rules.js`·`sites.js`·`forms/` 시연용 가상 학교 자료와 서식
- `apps-script/Code.gs` 구글 시트 학교 저장소
- `build.mjs` 하나의 `index.html` 로 묶기 → `docs/`

```bash
npm i @tabler/icons
node src/build.mjs --icons node_modules/@tabler/icons/icons/outline
```
