// sites.js: 수업 탭 '유용한 사이트' 모음. 교과군(for)별로 묶고, 주소는 2026. 10. 11. 접속 확인.
// en: 주소에 드러나지 않는 영어 이름(영어로 찾을 때). 주소의 영어 이름은 검색이 알아서 본다.
// for: 수업 탭 교과 이름과 맞추는 값. '공통'은 모든 교과에서 함께 보여 준다.
window.SUBJECT_SITES = [
  { group: '추첨·놀이', icon: 'dice-5', for: '공통', items: [
    { name: '네이버 사다리타기', en: 'naver ladder', url: 'https://search.naver.com/search.naver?query=%EC%82%AC%EB%8B%A4%EB%A6%AC%ED%83%80%EA%B8%B0', desc: '이름과 결과를 넣고 바로 사다리를 타요. 역할·순서 정하기에.' },
    { name: '네이버 룰렛', en: 'naver roulette', url: 'https://search.naver.com/search.naver?query=%EB%A3%B0%EB%A0%9B', desc: '항목을 넣고 돌림판을 돌려요.' },
    { name: '네이버 제비뽑기', en: 'naver lottery draw', url: 'https://search.naver.com/search.naver?query=%EC%A0%9C%EB%B9%84%EB%BD%91%EA%B8%B0', desc: '당첨 개수를 정해 제비를 뽑아요.' },
    { name: '마블 룰렛', en: 'marble roulette', url: 'https://lazygyu.github.io/roulette/', desc: '이름 구슬이 굴러 내려가는 추첨. 화면에 띄우면 반응이 좋아요.' },
    { name: 'Wheel of Names', url: 'https://wheelofnames.com', desc: '이름 돌림판. 뽑힌 이름 빼기, 색·소리 바꾸기.' },
    { name: 'Classroomscreen', url: 'https://classroomscreen.com', desc: '타이머·이름 뽑기·소음 측정·신호등을 한 화면에.' },
    { name: 'Online Stopwatch', url: 'https://www.online-stopwatch.com', desc: '경주·폭탄 모양 등 재미있는 수업 타이머.' }
  ] },
  { group: 'AI 활용', icon: 'sparkles', for: '공통', items: [
    { name: 'ChatGPT', url: 'https://chatgpt.com', desc: '질문·글 다듬기·문제 만들기 등 대화형 AI.' },
    { name: 'Gemini', url: 'https://gemini.google.com', desc: 'Google 대화형 AI. Google 문서·드라이브와 잘 맞아요.' },
    { name: 'Claude', url: 'https://claude.ai', desc: '긴 자료 읽기·정리·글쓰기에 강한 대화형 AI.' },
    { name: 'NotebookLM', url: 'https://notebooklm.google.com', desc: '올린 자료만 근거로 요약·질문·오디오 개요를 만들어요.' },
    { name: '뤼튼', url: 'https://wrtn.ai', desc: '한국어 AI 도우미. 글쓰기·검색·이미지.' },
    { name: 'Perplexity', url: 'https://www.perplexity.ai', desc: '출처를 달아 답하는 AI 검색.' },
    { name: 'Gamma', url: 'https://gamma.app', desc: '주제만 넣으면 발표 자료 초안을 만들어요.' },
    { name: 'Napkin AI', url: 'https://www.napkin.ai', desc: '글을 도식·그림으로 바꿔 줘요.' }
  ] },
  { group: '수업 참여·퀴즈', icon: 'presentation', for: '공통', items: [
    { name: '에듀넷·티-클리어', en: 'edunet t-clear', url: 'https://www.edunet.net', desc: '교육부 교수학습 자료 모음.' },
    { name: '띵커벨', en: 'thinkerbell', url: 'https://www.tkbell.co.kr', desc: '퀴즈·토론·보드 활동. 한국어, 학생 가입 없음.' },
    { name: '패들렛', url: 'https://padlet.com', desc: '함께 쓰는 게시판. 의견 모으기·작품 공유.' },
    { name: '카훗', url: 'https://kahoot.com', desc: '실시간 퀴즈 게임.' },
    { name: '멘티미터', url: 'https://www.mentimeter.com', desc: '실시간 투표·워드 클라우드.' },
    { name: '퀴즈앤', url: 'https://www.quizn.show', desc: '한국어 실시간 퀴즈 쇼.' },
    { name: '워드월', url: 'https://www.wordwall.net/ko', desc: '퀴즈·짝 맞추기·룰렛 등 활동 틀.' },
    { name: '캔바 교육용', url: 'https://www.canva.com/ko_kr/education/', desc: '교사·학생 무료 디자인 도구.' },
    { name: '미리캔버스', url: 'https://www.miricanvas.com', desc: '한국어 디자인 틀. 포스터·카드뉴스.' },
    { name: 'ZEP', url: 'https://www.zep.us', desc: '가상 교실·방탈출 같은 메타버스 공간.' },
    { name: 'EBSi', url: 'https://www.ebsi.co.kr', desc: '고교 강의·기출 문제.' }
  ] },
  { group: '국어', icon: 'book', for: '국어', items: [
    { name: '표준국어대사전', url: 'https://stdict.korean.go.kr', desc: '국립국어원 표준 사전.' },
    { name: '우리말샘', url: 'https://opendict.korean.go.kr', desc: '신어·전문어까지 담은 참여형 사전.' },
    { name: '국립국어원', en: 'korean language', url: 'https://www.korean.go.kr', desc: '어문 규범·온라인 가나다(질문 답변).' },
    { name: '바른 한국어 맞춤법 검사기', en: 'spell check speller', url: 'https://nara-speller.co.kr/speller/', desc: '맞춤법·띄어쓰기 검사.' },
    { name: '한국고전종합DB', url: 'https://db.itkc.or.kr', desc: '고전 원문과 번역문.' },
    { name: '국립중앙도서관', url: 'https://www.nl.go.kr', desc: '원문 자료·고문헌 검색.' }
  ] },
  { group: '수학', icon: 'math-function', for: '수학', items: [
    { name: '지오지브라', url: 'https://www.geogebra.org', desc: '그래프·도형·3D 탐구, 수업 활동 모음.' },
    { name: '데스모스', url: 'https://www.desmos.com', desc: '그래프 계산기와 수업 활동.' },
    { name: '알지오매스', url: 'https://www.algeomath.kr', desc: '한국과학창의재단의 한국어 수학 탐구 도구.' },
    { name: '울프람알파', url: 'https://www.wolframalpha.com', desc: '식 계산·풀이 과정·자료 계산.' },
    { name: '칸아카데미', url: 'https://ko.khanacademy.org', desc: '단원별 강의와 연습 문제.' }
  ] },
  { group: '영어', icon: 'language', for: '영어', items: [
    { name: '네이버 영어사전', url: 'https://en.dict.naver.com', desc: '뜻·예문·발음.' },
    { name: 'YouGlish', url: 'https://youglish.com', desc: '유튜브 영상 속 실제 발음 찾기.' },
    { name: '파파고', url: 'https://papago.naver.com', desc: '번역기. 문장·이미지·음성.' },
    { name: 'DeepL', url: 'https://www.deepl.com', desc: '자연스러운 번역과 문장 다듬기.' },
    { name: 'Quizlet', url: 'https://quizlet.com', desc: '단어 카드·게임으로 어휘 익히기.' },
    { name: 'Newsela', url: 'https://newsela.com', desc: '수준별로 고쳐 쓴 영어 기사.' }
  ] },
  { group: '사회·역사', icon: 'world', for: '사회', items: [
    { name: '우리역사넷', url: 'https://contents.history.go.kr', desc: '국사편찬위원회 한국사 콘텐츠.' },
    { name: '한국사데이터베이스', url: 'https://db.history.go.kr', desc: '사료 원문과 번역.' },
    { name: '국가통계포털 KOSIS', url: 'https://kosis.kr', desc: '인구·경제 등 국가 통계.' },
    { name: '통계지리정보서비스 SGIS', url: 'https://sgis.mods.go.kr', desc: '통계를 지도로 보기.' },
    { name: '구글 어스', url: 'https://earth.google.com', desc: '위성 사진·3D 지형으로 세계 여행.' },
    { name: '국토정보플랫폼', url: 'https://map.ngii.go.kr', desc: '국토지리정보원 지도·항공사진.' },
    { name: '국가법령정보센터', url: 'https://www.law.go.kr', desc: '헌법·법령 원문.' },
    { name: '경제배움e', url: 'https://www.econedu.go.kr', desc: '경제 교육 자료·콘텐츠.' }
  ] },
  { group: '과학', icon: 'flask', for: '과학', items: [
    { name: 'PhET 시뮬레이션', url: 'https://phet.colorado.edu/ko/', desc: '물리·화학·생명 가상 실험(한국어).' },
    { name: '사이언스올', url: 'https://www.scienceall.com', desc: '과학 콘텐츠·영상 모음.' },
    { name: '기상청 날씨누리', url: 'https://www.weather.go.kr', desc: '일기도·위성·기상 자료.' },
    { name: '국가생물종지식정보시스템', url: 'https://www.nature.go.kr', desc: '우리나라 생물종 정보와 사진.' },
    { name: 'MolView', url: 'https://molview.org', desc: '분자 구조를 3D로 보기.' },
    { name: 'Stellarium Web', url: 'https://stellarium-web.org', desc: '웹 천체투영관. 시간·장소별 밤하늘.' },
    { name: 'ChemCollective', url: 'https://www.chemcollective.org', desc: '가상 화학 실험실.' }
  ] },
  { group: '정보', icon: 'code', for: '정보·기타', items: [
    { name: '엔트리', url: 'https://playentry.org', desc: '블록 코딩. 한국어, 인공지능 블록.' },
    { name: '스크래치', url: 'https://scratch.mit.edu', desc: '블록 코딩으로 게임·애니메이션 만들기.' },
    { name: 'Code.org', url: 'https://code.org', desc: '단계별 코딩 수업.' },
    { name: '티처블 머신', url: 'https://teachablemachine.withgoogle.com', desc: '사진·소리로 AI 모델을 직접 학습시켜요.' },
    { name: '구글 코랩', url: 'https://colab.research.google.com', desc: '설치 없이 파이썬 실행.' },
    { name: '앱 인벤터', url: 'https://appinventor.mit.edu', desc: '블록으로 휴대폰 앱 만들기.' },
    { name: '이솦(EBS 소프트웨어)', en: 'ebs software esop', url: 'https://www.ebssw.kr', desc: 'SW·AI 강좌와 실습.' },
    { name: '퀵드로우', url: 'https://quickdraw.withgoogle.com', desc: '그림을 맞히는 AI 체험.' },
    { name: 'draw.io', url: 'https://www.drawio.com', desc: '순서도·다이어그램 그리기.' }
  ] },
  { group: '예술·체육', icon: 'palette', for: '예술·체육', items: [
    { name: '크롬 뮤직랩', url: 'https://musiclab.chromeexperiments.com', desc: '리듬·화음·작곡을 놀이처럼.' },
    { name: 'Flat', url: 'https://flat.io', desc: '함께 쓰는 온라인 악보 편집기.' },
    { name: '국립국악원', url: 'https://www.gugak.go.kr', desc: '국악 자료·공연 영상.' },
    { name: '구글 아트 앤 컬처', url: 'https://artsandculture.google.com', desc: '세계 미술관 작품을 고화질로.' },
    { name: '국립현대미술관', url: 'https://www.mmca.go.kr', desc: '전시·소장품 검색.' },
    { name: '오토드로우', url: 'https://www.autodraw.com', desc: '대충 그리면 AI가 그림으로 바꿔 줘요.' },
    { name: '국민체력100', en: 'fitness pe', url: 'https://nfa.kspo.or.kr', desc: '체력 측정 기준과 운동 처방.' }
  ] },
  { group: '진로', icon: 'compass', for: '정보·기타', items: [
    { name: '커리어넷', url: 'https://www.career.go.kr', desc: '진로 심리검사·직업·학과 정보.' },
    { name: '대입정보포털 어디가', en: 'adiga college', url: 'https://www.adiga.kr', desc: '대학·학과·전형 정보.' },
    { name: '고교학점제', url: 'https://www.hscredit.kr', desc: '과목 안내·과목 선택 도움.' },
    { name: '고용24', url: 'https://www.work24.go.kr', desc: '직업 정보·채용·직업 훈련.' },
    { name: 'NCS 국가직무능력표준', url: 'https://ncs.go.kr', desc: '직무별 능력·학습 모듈.' }
  ] }
];
