// demo-data.js: 시연 모드용 가상 학교(OO고등학교) 데이터. 실제 학교·인물 정보 없음.
window.DEMO_DATA = {
  school: { name: 'OO고등학교', short: 'OO고', accessCode: 'demo2026', adminPassword: 'admin2026' },

  categories: [
    { id: 'rules', name: '규정집', icon: 'book-2' },
    { id: 'academic', name: '학사·성적', icon: 'school' },
    { id: 'attendance', name: '출결', icon: 'calendar-check' },
    { id: 'duty', name: '복무·여비', icon: 'briefcase' },
    { id: 'field', name: '체험학습', icon: 'map-2' },
    { id: 'life', name: '학생 생활', icon: 'users' },
    { id: 'event', name: '행사', icon: 'confetti' },
    { id: 'forms', name: '서식·서류', icon: 'file-text' },
    { id: 'guide', name: '학교 생활 안내', icon: 'directions' }
  ],

  docs: [
    {
      id: 'd01', category: 'field', title: '교외체험학습 신청 절차',
      aliases: ['체험학습', '현장체험학습', '교외체험', '가족여행', '체험학습 신청'],
      owner: '교무기획부', updatedAt: '2026-09-22', views: 214,
      body: `학생이 가족 여행, 친척 방문, 진로 탐색 등으로 학교 밖에서 학습하려면 **미리 신청하고 허가를 받아야** 합니다.

## 한눈에 보기
| 단계 | 누가 | 언제 |
|---|---|---|
| 신청서 제출 | 학생·보호자 → 담임 | 체험 **전날 16시 30분**까지 |
| 허가 여부 안내 | 담임 → 보호자 | 학교장 허가 뒤 바로 |
| 결과보고서 제출 | 학생 → 담임 | 체험 끝난 뒤 **5일 이내** |
| 출결 처리 | 담임 | 결과보고서 받은 날 |

## 담임 선생님이 할 일
1. 신청서를 받으면 날짜가 **연간 15일** 안에 드는지 확인합니다.
2. 시험 기간, 학교 주요 행사일과 겹치지 않는지 확인합니다. (학사일정은 [학사일정 확인 방법](#/doc/d14) 참고)
3. 허가하면 보호자에게 문자로 알리고, 신청서는 출결 서류함에 보관합니다.
4. 결과보고서를 받으면 나이스에서 **출석 인정(교외체험학습)** 으로 처리합니다.

> 결과보고서를 기한 안에 내지 않으면 출석 인정이 되지 않을 수 있습니다. 보호자에게 미리 알려 주세요.

## 자주 묻는 것
- **하루 중 일부만 빠져도 신청하나요?** 네. 반나절도 신청서를 받습니다.
- **시험 기간에도 되나요?** 학기 초·학기 말·정기고사 기간에는 허가하지 않을 수 있습니다.

> 근거: [교외체험학습 운영 규정](#/doc/rule17) 제4조·제5조`,
      attachments: [
        { name: '교외체험학습 신청서', kind: 'form', formId: 'field-apply' },
        { name: '교외체험학습 결과보고서', kind: 'form', formId: 'field-report' },
        { name: '대리 인솔 위임장·서약서', kind: 'form', formId: 'field-proxy' }
      ]
    },
    {
      id: 'd02', category: 'attendance', title: '결석계(결석신고서) 제출 방법',
      aliases: ['결석계', '결석신고서', '병결', '질병결석', '결석 서류', '진단서'],
      owner: '교무기획부', updatedAt: '2026-09-15', views: 302,
      body: `결석한 학생은 **결석한 날부터 5일 이내**에 결석신고서와 증빙 서류를 담임에게 냅니다.

## 결석 종류별 증빙
| 결석 종류 | 필요한 서류 |
|---|---|
| 질병 결석 (2일 이내) | 결석신고서 + 보호자 의견서 또는 처방전·진료확인서 |
| 질병 결석 (3일 이상) | 결석신고서 + 의사 진단서 또는 소견서 |
| 경조사 | 결석신고서 + 가족관계 확인 서류 |
| 기타 결석 | 결석신고서 + 사유를 확인할 수 있는 자료 |

## 담임 선생님 처리 순서
1. 서류를 받으면 날짜와 결석 종류가 맞는지 확인합니다.
2. 나이스 출결 관리에서 결석 종류를 입력합니다.
3. 서류는 학급 출결 서류함에 날짜순으로 보관합니다.
4. 월말에 [출결 마감 일정](#/doc/d03)에 맞춰 마감합니다.

> 증빙 서류가 많으면 학교 도구의 **출결 증빙 도우미**로 정리하면 빠릅니다.

> 근거: [출결처리 규정](#/doc/rule16) 제2조`,
      attachments: [{ name: '결석신고서', kind: 'form', formId: 'absence' }]
    },
    {
      id: 'd03', category: 'attendance', title: '월별 출결 마감 일정',
      aliases: ['출결 마감', '출석부 마감', '월말 마감', '출결 확인'],
      owner: '교무기획부', updatedAt: '2026-09-01', views: 141,
      body: `출결은 **매월 마지막 평일 오후 4시**까지 마감합니다.

## 마감 전 확인할 것
- 결석·지각·조퇴·결과 입력이 빠진 날이 없는지
- 출석 인정 처리에 증빙 서류가 모두 있는지
- 전입·전출 학생의 날짜가 맞는지

## 마감 후 수정이 필요하면
교무기획부 출결 담당에게 **수정 사유**를 메신저로 보내고, 수정이 끝나면 다시 마감합니다.`,
      attachments: []
    },
    {
      id: 'd04', category: 'attendance', title: '조퇴·외출·지각 처리',
      aliases: ['조퇴', '외출', '지각', '결과', '보건실 조퇴', '조퇴증'],
      owner: '교무기획부', updatedAt: '2026-08-28', views: 167,
      body: `## 조퇴
1. 학생이 담임(부재 시 학년 부장)에게 사유를 말합니다.
2. 담임이 **보호자와 통화**해 귀가 방법을 확인합니다.
3. 조퇴증을 써 주고, 교무실 출입 기록부에 시간을 적습니다.

## 외출
학교 밖에 잠깐 다녀오는 경우입니다. 조퇴와 같은 순서로 하되, 돌아오면 담임에게 알립니다.

## 지각·결과
- 등교시각(**8시 40분**)까지 오지 않으면 지각입니다.
- 수업 시간 중 **15분 이상** 빠지면 결과입니다.
- 같은 날 지각·조퇴·결과가 겹치면 한 가지로만 처리합니다.

> 몸이 아파 조퇴하는 경우 보건실을 먼저 들르게 하면 기록이 정확해집니다.

> 근거: [출결처리 규정](#/doc/rule16) 제3조`,
      attachments: []
    },
    {
      id: 'd05', category: 'duty', title: '출장 여비 처리 순서',
      aliases: ['출장', '여비', '출장비', '관내출장', '관외출장', '복명서', '출장 신청'],
      owner: '행정실', updatedAt: '2026-09-18', views: 188,
      body: `## 출장 가기 전
1. 나이스 복무에서 **출장 신청**을 올립니다. (출장지, 목적, 시간)
2. 교감 결재가 나면 출장을 갑니다.

## 다녀온 뒤
1. 출장 복명서를 씁니다. (연수·회의는 받은 자료 사진 1장 첨부)
2. 대중교통을 이용했다면 영수증을 행정실에 냅니다.
3. 여비는 **다음 달 급여일**에 함께 들어옵니다.

## 관내·관외 구분
| 구분 | 기준 |
|---|---|
| 관내 출장 | 같은 시·군 안 |
| 관외 출장 | 다른 시·군, 4시간 이상이면 일비 포함 |

> 여비 기준 금액은 해마다 바뀔 수 있으니 행정실 공지를 확인해 주세요.`,
      attachments: [{ name: '국내출장 여비 신청서', kind: 'form', formId: 'travel' }, { name: '출장 복명서', kind: 'form', formId: 'f-trip' }]
    },
    {
      id: 'd06', category: 'duty', title: '연가·조퇴 등 복무 신청',
      aliases: ['연가', '조퇴', '병가', '복무', '휴가', '외출 신청', '근무상황'],
      owner: '교무기획부', updatedAt: '2026-07-10', views: 156,
      body: `복무 신청은 모두 **나이스 복무 메뉴**에서 합니다.

## 신청 순서
1. 수업이 있는 시간이면 먼저 **수업 교체**를 정합니다. ([수업 교체 방법](#/doc/d07))
2. 나이스에서 복무 종류와 시간을 입력하고 상신합니다.
3. 결재가 끝나면 교무실 칠판의 복무 현황판에 적습니다.

## 알아 두면 좋은 것
- 학기 중 연가는 수업 지장이 없는 시간에 씁니다.
- 병가가 6일 이상이면 진단서를 첨부합니다.`,
      attachments: []
    },
    {
      id: 'd07', category: 'academic', title: '수업 교체·보강 방법',
      aliases: ['수업 교체', '보강', '시간표 변경', '수업 바꾸기', '결강'],
      owner: '교육과정부', updatedAt: '2026-09-05', views: 233,
      body: `## 수업 교체 (서로 바꾸기)
1. 바꿀 선생님과 날짜·교시를 정합니다.
2. 교육과정부 시간표 담당에게 **하루 전까지** 알립니다.
3. 학급 게시판에 변경 내용이 올라가는지 확인합니다.

## 보강 (대신 들어가기)
갑자기 생긴 결강은 교육과정부가 보강표를 짜서 메신저로 보냅니다. 보강 수업은 **자습 지도**가 기본이고, 과제가 있으면 담당 교사가 미리 남깁니다.`,
      attachments: []
    },
    {
      id: 'd08', category: 'academic', title: '정기고사 감독 안내',
      aliases: ['시험 감독', '고사 감독', '중간고사', '기말고사', '감독 유의사항', '정감', '부감'],
      owner: '연구부', updatedAt: '2026-09-25', views: 276,
      body: `## 감독 전
- 시작 **15분 전** 고사본부(2층 회의실)에서 시험지 봉투를 받습니다.
- 정감독은 봉투, 부감독은 OMR 카드와 여분 답안지를 챙깁니다.

## 시험 중
1. 휴대전화·전자기기는 시험 시작 전에 모두 걷습니다.
2. 시작 10분 뒤 결시자를 확인해 결시 확인서에 적습니다.
3. 감독 중에는 교실 앞뒤에 나눠 서고, 개인 업무를 하지 않습니다.

## 시험 끝
답안지를 **번호순으로 정리**해 매수를 확인하고 고사본부에 반납합니다.

> 부정행위가 의심되면 그 자리에서 답안지를 거두지 말고, 시험이 끝난 뒤 고사본부에 바로 알립니다.`,
      attachments: [{ name: '결시 확인서', kind: 'form', formId: 'f-absent-exam' }]
    },
    {
      id: 'd09', category: 'academic', title: '학업성적관리 핵심 요약',
      aliases: ['성적관리', '성적 처리', '결시자', '인정점', '동점자', '학업성적관리규정'],
      owner: '연구부', updatedAt: '2026-03-04', views: 129,
      body: `학교 학업성적관리규정 중 선생님들이 자주 찾는 부분만 모았습니다. 원문은 연구부 공유 폴더에 있습니다.

## 결시자 처리
| 결시 사유 | 성적 처리 |
|---|---|
| 출석 인정 결시 (경조사·공무 등) | 인정점 100% |
| 질병 결시 (진단서 등 제출) | 인정점 80% |
| 미인정 결시 | 응시 학생 최하점의 차하점 (최하점 - 1) |
| 부정행위 | 해당 평가 0점 |

> 근거: [학업성적관리 규정](#/doc/rule18) 제15조. 세부 조건은 규정 원문을 확인하세요.

## 수행평가
- 학기 초 평가 계획을 학생에게 안내한 뒤 실시합니다.
- 결과는 **학생 확인**을 거친 뒤 나이스에 입력합니다.

## 이의 신청
성적 공개 후 **3일 이내** 학생이 교과 담당 교사에게 신청합니다.`,
      attachments: []
    },
    {
      id: 'd10', category: 'life', title: '학생 휴대전화 사용 규칙',
      aliases: ['휴대폰', '핸드폰', '스마트폰', '휴대전화 수거', '전자기기'],
      owner: '학생안전부', updatedAt: '2026-08-20', views: 98,
      body: `## 기본 규칙
- 수업 시간에는 전원을 끄거나 무음으로 가방에 넣습니다.
- 수업에 필요할 때는 **교사가 허락한 경우에만** 사용합니다.

## 지키지 않았을 때
1. 1차: 구두 지도
2. 2차: 교무실 보관 후 하교 시 돌려줌
3. 3차 이상: 보호자 연락 후 학생안전부와 상담`,
      attachments: []
    },
    {
      id: 'd11', category: 'life', title: '학생 사안 발생 시 첫 대응',
      aliases: ['학교폭력', '학폭', '사안 처리', '다툼', '사고 발생', '응급'],
      owner: '학생안전부', updatedAt: '2026-06-12', views: 87,
      body: `사안을 알게 된 선생님이 **먼저 할 일만** 정리했습니다. 이후 절차는 학생안전부가 안내합니다.

## 바로 할 일
1. 다친 학생이 있으면 **보건실**로 먼저 보냅니다. 위급하면 119.
2. 관련 학생을 서로 떨어뜨려 안정시킵니다.
3. 학생안전부에 **사실만** 알립니다. (언제, 어디서, 누가 관련됐는지)

## 하지 않을 것
- 학생에게 서로 사과하라고 바로 시키지 않습니다.
- 학생 이름이 들어간 내용을 단체 메신저에 올리지 않습니다.

> 자세한 법적 절차는 교육청 매뉴얼을 따릅니다. 이 문서는 첫 대응만 다룹니다.`,
      attachments: [],
      links: [{ name: '국가법령정보센터 (관련 법령 원문)', url: 'https://www.law.go.kr' }]
    },
    {
      id: 'd12', category: 'event', title: '체육대회 운영 체크리스트',
      aliases: ['체육대회', '운동회', '스포츠 데이', '체육 행사'],
      owner: '학생안전부', updatedAt: '2026-05-02', views: 64,
      body: `## 2주 전
- [ ] 종목·일정표 확정, 학급별 참가 명단 받기
- [ ] 우천 시 일정 정하기

## 1주 전
- [ ] 방송·천막·음료 준비 (행정실 협조)
- [ ] 안전 요원 배치표 공유

## 당일
- [ ] 아침 8시 운동장 점검
- [ ] 보건실 운동장 임시 부스 설치
- [ ] 끝난 뒤 학급별 정리 구역 확인`,
      attachments: []
    },
    {
      id: 'd13', category: 'event', title: '졸업식 준비 순서',
      aliases: ['졸업식', '졸업', '졸업 앨범', '졸업장'],
      owner: '교무기획부', updatedAt: '2026-01-20', views: 41,
      body: `## 한 달 전
1. 졸업식 날짜·장소 확정, 학교 누리집 공지
2. 졸업장·상장 명단을 나이스에서 출력해 확인

## 일주일 전
1. 식순 확정, 사회자·반주 담당 정하기
2. 3학년 담임: 학급별 졸업장 봉투 정리

## 당일
식 시작 1시간 전 강당 리허설, 끝난 뒤 강당 원상 복구`,
      attachments: []
    },
    {
      id: 'd14', category: 'guide', title: '학사일정 확인 방법',
      aliases: ['학사일정', '학교 일정', '연간 일정', '시험 일정', '방학'],
      owner: '교무기획부', updatedAt: '2026-08-25', views: 119,
      body: `## 어디서 보나요
- **교무실 게시판**: 이번 달 일정표
- **학교 공유 캘린더**: 교무기획부가 매주 금요일 갱신
- **학교 누리집**: 학생·학부모용 공개 일정

## 2학기 주요 일정 (시연용 예시)
| 날짜 | 내용 |
|---|---|
| 10월 13일 ~ 16일 | 2학기 중간고사 |
| 10월 30일 | 체육대회 |
| 12월 8일 ~ 11일 | 2학기 기말고사 |
| 12월 31일 | 겨울방학식 |`,
      attachments: []
    },
    {
      id: 'd15', category: 'guide', title: '새로 오신 선생님 첫 주 안내',
      aliases: ['전입', '신규', '전입교사', '신규교사', '처음', '첫 출근', '오리엔테이션'],
      owner: '교무기획부', updatedAt: '2026-09-01', views: 351,
      body: `OO고에 오신 것을 환영합니다. 첫 주에 필요한 것만 순서대로 모았습니다.

## 첫날
1. 행정실에서 **출입증·교무실 열쇠**를 받습니다.
2. 정보부에 학교 업무용 PC 계정을 요청합니다.
3. 학교 메신저를 설치하고 교무기획부에 알려 그룹에 들어갑니다.

## 첫 주 안에
- 나이스 권한 신청 (담임이면 학급 권한 포함)
- [수업 교체·보강 방법](#/doc/d07) 읽기
- [결석계 제출 방법](#/doc/d02) 읽기 (담임만)
- 소속 부서 업무분장표 받기

## 모르는 게 생기면
이 길잡이에서 먼저 검색하고, 없으면 **"이 문서를 만들어 주세요"** 를 눌러 남겨 주세요. 같은 질문을 할 다음 선생님에게 큰 도움이 됩니다.`,
      attachments: []
    },
    {
      id: 'd16', category: 'guide', title: '복사기·프린터 사용과 고장 신고',
      aliases: ['복사기', '프린터', '인쇄', '고장', '토너', '기자재 고장'],
      owner: '정보부', updatedAt: '2026-04-11', views: 92,
      body: `## 위치
- 1층 교무실: 컬러 복합기 1대
- 2층 연구실: 흑백 복사기 1대

## 대량 인쇄 (100장 이상)
시험지·학습지는 **2층 인쇄실**에 원본과 인쇄 요청서를 맡깁니다. 다음 날 오후에 찾아갑니다.

## 고장 신고
1. 고장 증상을 사진으로 찍습니다.
2. 정보부 기자재 담당에게 메신저로 보냅니다.
3. 토너가 떨어진 경우는 행정실에 바로 말하면 됩니다.`,
      attachments: [{ name: '인쇄 요청서', kind: 'form', formId: 'f-print' }]
    },
    {
      id: 'fm01', category: 'forms', title: '결석신고서',
      aliases: ['결석계', '결석 신고', '출결 서류', '질병 결석', '결석 증빙'],
      owner: '담임', updatedAt: '2026-09-22', views: 120,
      body: `학생이 결석한 뒤 보호자가 결석 사유를 알리는 서류예요. 진료 확인서·처방전 같은 증빙 서류와 함께 담임 선생님께 내요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [결석계 제출 방법](#/doc/d02)`,
      attachments: [{ name: '결석신고서', kind: 'form', formId: 'absence' }]
    },
    {
      id: 'fm02', category: 'forms', title: '교외체험학습 신청서',
      aliases: ['체험학습 신청', '현장체험학습', '가족여행', '체험학습 신청서'],
      owner: '담임', updatedAt: '2026-09-22', views: 113,
      body: `가족 여행, 친척 방문, 진로 탐색처럼 학교 밖에서 학습할 때 미리 내는 신청서예요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [교외체험학습 신청 절차](#/doc/d01)`,
      attachments: [{ name: '교외체험학습 신청서', kind: 'form', formId: 'field-apply' }]
    },
    {
      id: 'fm03', category: 'forms', title: '교외체험학습 결과보고서',
      aliases: ['체험학습 보고서', '체험학습 결과', '현장체험 보고서'],
      owner: '담임', updatedAt: '2026-09-22', views: 106,
      body: `교외체험학습을 마친 뒤 활동 내용을 정리해 내는 보고서예요. 사진이나 입장권 같은 증빙 자료를 함께 붙여요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [교외체험학습 신청 절차](#/doc/d01)`,
      attachments: [{ name: '교외체험학습 결과보고서', kind: 'form', formId: 'field-report' }]
    },
    {
      id: 'fm04', category: 'forms', title: '대리 인솔 위임장·서약서',
      aliases: ['위임장', '대리 인솔', '인솔자 서약서', '보호자 위임'],
      owner: '담임', updatedAt: '2026-09-22', views: 99,
      body: `보호자가 아닌 사람이 체험학습을 인솔할 때 보호자가 위임하고 인솔자가 서약하는 서류예요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [교외체험학습 신청 절차](#/doc/d01)`,
      attachments: [{ name: '대리 인솔 위임장·서약서', kind: 'form', formId: 'field-proxy' }]
    },
    {
      id: 'fm05', category: 'forms', title: '과목 변경 신청서',
      aliases: ['선택과목 변경', '수강 변경', '과목 바꾸기'],
      owner: '교육과정부', updatedAt: '2026-09-22', views: 92,
      body: `선택 과목을 바꾸고 싶을 때 학생이 내는 신청서예요. 변경 가능 기간과 조건은 교육과정 담당 선생님께 먼저 확인해요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [학업성적관리 핵심 요약](#/doc/d09)`,
      attachments: [{ name: '과목 변경 신청서', kind: 'form', formId: 'subject-change' }]
    },
    {
      id: 'fm06', category: 'forms', title: '과목 변경 학부모 동의서',
      aliases: ['보호자 동의서', '과목 변경 동의', '선택과목 동의서'],
      owner: '교육과정부', updatedAt: '2026-09-22', views: 85,
      body: `과목 변경 신청서와 함께 내는 보호자 동의서예요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [학업성적관리 핵심 요약](#/doc/d09)`,
      attachments: [{ name: '과목 변경 학부모 동의서', kind: 'form', formId: 'subject-consent' }]
    },
    {
      id: 'fm07', category: 'forms', title: '국내출장 여비 신청서',
      aliases: ['여비', '여비 신청서', '출장비', '여비 정산', '여비지급', '여비 지급서'],
      owner: '행정실', updatedAt: '2026-09-22', views: 78,
      body: `출장을 다녀온 뒤 여비를 정산하는 엑셀 서식이에요. 출장 기간·출장지·교통편을 넣으면 일비·식비·운임이 자동으로 계산돼요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [출장 여비 처리 순서](#/doc/d05)`,
      attachments: [{ name: '국내출장 여비 신청서', kind: 'form', formId: 'travel' }]
    },
    {
      id: 'fm08', category: 'forms', title: '출장 복명서',
      aliases: ['복명서', '출장 보고', '출장 결과 보고'],
      owner: '행정실', updatedAt: '2026-09-22', views: 71,
      body: `출장을 다녀와서 무엇을 했는지 보고하는 서류예요. 연수·회의 자료가 있으면 함께 붙여요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [출장 여비 처리 순서](#/doc/d05)`,
      attachments: [{ name: '출장 복명서', kind: 'form', formId: 'f-trip' }]
    },
    {
      id: 'fm09', category: 'forms', title: '결시 확인서',
      aliases: ['정기고사 결시', '시험 결시', '결시 사유서', '시험 못 봄'],
      owner: '교무부', updatedAt: '2026-09-22', views: 64,
      body: `정기고사를 치르지 못한 학생의 결시 사유를 확인하는 서류예요. 증빙 서류와 함께 담당 선생님께 내요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [정기고사 감독 안내](#/doc/d08)`,
      attachments: [{ name: '결시 확인서', kind: 'form', formId: 'f-absent-exam' }]
    },
    {
      id: 'fm10', category: 'forms', title: '인쇄 요청서',
      aliases: ['인쇄', '복사 요청', '인쇄실', '대량 인쇄'],
      owner: '정보부', updatedAt: '2026-09-22', views: 57,
      body: `학습지·가정통신문 같은 대량 인쇄를 맡길 때 쓰는 요청서예요.

아래 **작성·인쇄**를 누르면 화면에서 바로 칸을 채우고 그대로 인쇄해요. 파일을 받을 필요가 없어요.

## 함께 보면 좋은 안내
- [복사기·프린터 사용과 고장 신고](#/doc/d16)`,
      attachments: [{ name: '인쇄 요청서', kind: 'form', formId: 'f-print' }]
    },
    {
      id: 'd18', category: 'life', title: '방과후 교실 사용 신청',
      aliases: ['교실 대여', '특별실', '방과후', '동아리실', '교실 예약'],
      owner: '교육과정부', updatedAt: '2026-08-30', views: 58,
      body: `방과후나 동아리 활동으로 특별실을 쓰려면 **사용 3일 전**까지 신청합니다.

1. 교육과정부 특별실 예약표(공유 시트)에 날짜·시간·담당 교사를 적습니다.
2. 사용 후 창문·전등·에어컨을 끄고 열쇠를 교무실에 반납합니다.`,
      attachments: []
    }
  ],

  // 서식: 시연용으로 직접 만든 양식. 칸(fields)을 채우면 A4 미리보기에 바로 반영되고 그 자리에서 인쇄한다.
  // 칸 종류: student(학년·반·번호·이름) / text / textarea / date / daterange(일수 자동) / choice(하나) / checks(여러 개)
  forms: {
    'f-absence': {
      title: '결석신고서', to: true,
      fields: [
        { k: 'st', type: 'student', label: '학생' },
        { k: 'period', type: 'daterange', label: '결석 기간', count: 'weekday' },
        { k: 'kind', type: 'choice', label: '결석 종류', options: ['질병결석', '출석인정결석', '기타결석'] },
        { k: 'reason', type: 'textarea', label: '결석 사유', ph: '예: 감기로 병원 진료 (구체적으로)' },
        { k: 'docs', type: 'checks', label: '첨부 서류', options: ['진료확인서', '의사 소견서·진단서', '처방전', '보호자 확인서', '기타'] },
        { k: 'parent', type: 'text', label: '보호자 성명', inSign: true }
      ],
      sign: [['학생', 'st.name'], ['보호자', 'parent'], ['담임', '']]
    },
    'f-field-apply': {
      title: '교외체험학습 신청서', to: true,
      fields: [
        { k: 'st', type: 'student', label: '학생' },
        { k: 'period', type: 'daterange', label: '체험 기간', count: 'weekday' },
        { k: 'kind', type: 'choice', label: '체험 형태', options: ['가족 동반 여행', '친인척 방문', '진로 체험', '기타'] },
        { k: 'place', type: 'text', label: '체험 장소', ph: '예: 경주 일대' },
        { k: 'plan', type: 'textarea', label: '학습 계획', ph: '날짜별로 무엇을 보고 배울지' },
        { k: 'guide', type: 'text', label: '인솔자 (관계)', ph: '예: 어머니' },
        { k: 'parent', type: 'text', label: '보호자 성명', inSign: true }
      ],
      sign: [['학생', 'st.name'], ['보호자', 'parent'], ['담임', '']]
    },
    'f-field-report': {
      title: '교외체험학습 결과보고서', to: true,
      fields: [
        { k: 'st', type: 'student', label: '학생' },
        { k: 'period', type: 'daterange', label: '체험 기간', count: 'weekday' },
        { k: 'place', type: 'text', label: '체험 장소' },
        { k: 'did', type: 'textarea', label: '체험 내용' },
        { k: 'felt', type: 'textarea', label: '느낀 점' },
        { k: 'proof', type: 'checks', label: '증빙 자료', options: ['사진', '입장권·영수증', '기타'] },
        { k: 'parent', type: 'text', label: '보호자 성명', inSign: true }
      ],
      sign: [['학생', 'st.name'], ['보호자', 'parent'], ['담임', '']]
    },
    'f-trip': {
      title: '출장 복명서', to: false,
      fields: [
        { k: 'who', type: 'text', label: '출장자', ph: '이름', inSign: true },
        { k: 'day', type: 'date', label: '출장 날짜' },
        { k: 'time', type: 'text', label: '출장 시간', ph: '예: 13:00 ~ 17:00' },
        { k: 'place', type: 'text', label: '출장지' },
        { k: 'goal', type: 'text', label: '출장 목적' },
        { k: 'main', type: 'textarea', label: '주요 내용' },
        { k: 'share', type: 'textarea', label: '전달 사항' }
      ],
      sign: [['출장자', 'who'], ['부장', ''], ['교감', '']]
    },
    'f-absent-exam': {
      title: '정기고사 결시 확인서', to: false,
      fields: [
        { k: 'exam', type: 'text', label: '고사명', ph: '예: 2학기 1회고사' },
        { k: 'subj', type: 'text', label: '교시 / 과목', ph: '예: 2교시 수학' },
        { k: 'st', type: 'student', label: '학생' },
        { k: 'why', type: 'choice', label: '결시 사유', options: ['질병', '경조사', '출석인정', '기타'] },
        { k: 'p1', type: 'text', label: '정감독', inSign: true },
        { k: 'p2', type: 'text', label: '부감독' }
      ],
      sign: [['정감독', 'p1'], ['연구부', '']]
    },
    'f-print': {
      title: '인쇄 요청서', to: false,
      fields: [
        { k: 'day', type: 'date', label: '요청 일자' },
        { k: 'pick', type: 'date', label: '찾을 날짜' },
        { k: 'name', type: 'text', label: '인쇄물 이름', ph: '예: 2학년 수학 학습지 3' },
        { k: 'pages', type: 'text', label: '쪽 × 부수', ph: '예: 4쪽 × 120부' },
        { k: 'way', type: 'checks', label: '방식', options: ['단면', '양면', '흑백', '컬러'] },
        { k: 'dept', type: 'text', label: '요청 부서', inSign: true }
      ],
      sign: [['요청자', 'dept'], ['인쇄실', '']]
    }
  },

  // 수업 자료: 교과별 수업용 웹앱(app)과 학습지 양식(file). 선생님이 직접 올리고 고친다
  subjects: ['국어', '수학', '영어', '사회', '과학', '예술·체육', '정보·기타', '공통'],
  lessons: [
    { id: 'l01', subject: '수학', kind: 'app', title: '흔들리지 않는 탁자는?', desc: '다리 개수와 모양을 바꿔 보며 평면이 결정되는 조건을 찾는 시뮬레이터', course: '기하 Ⅱ', maker: '수학과', url: 'lessons/math/table-stability.html' },
    { id: 'l02', subject: '수학', kind: 'app', title: '확률분포표 만들기', desc: '일상 속 상황을 골라 확률변수와 확률분포표를 직접 만들어 보는 활동', course: '확률과 통계', maker: '수학과', url: 'lessons/math/probability-table.html' },
    { id: 'l03', subject: '수학', kind: 'app', title: '갈톤 보드', desc: '구슬을 떨어뜨려 이항분포가 정규분포 모양에 가까워지는 과정을 보는 시뮬레이션', course: '확률과 통계', maker: '수학과', url: 'lessons/math/galton/index.html' },
    { id: 'l04', subject: '국어', kind: 'app', title: '헷갈리는 맞춤법 퀴즈', desc: '자주 틀리는 맞춤법 20개를 낱말 카드와 퀴즈로', course: '공통국어', maker: '국어과', url: 'apps/subject/quiz.html?set=spelling' },
    { id: 'l05', subject: '과학', kind: 'app', title: '원소 기호 퀴즈', desc: '원자 번호 1~20번 원소의 이름과 기호', course: '통합과학', maker: '과학과', url: 'apps/subject/quiz.html?set=elements' },
    { id: 'l06', subject: '영어', kind: 'app', title: '영어 단어 카드', desc: '단어 목록을 붙여 넣으면 카드와 4지선다 퀴즈로 바꿔 줌', course: '공통영어', maker: '영어과', url: 'apps/subject/quiz.html?set=vocab' },
    { id: 'l07', subject: '공통', kind: 'app', title: '낱말·개념 퀴즈 만들기', desc: "어느 교과든 '문제 - 답' 목록만 넣으면 바로 퀴즈", course: '', maker: '정보부', url: 'apps/subject/quiz.html?set=custom' },
    { id: 'l11', subject: '수학', kind: 'file', title: '문제 풀이 학습지 (모눈 칸)', desc: '문제 3개, 오른쪽에 모눈 풀이 칸이 있는 기본 양식', course: '', maker: '수학과', file: { name: '수학_문제풀이_학습지.pdf', ftype: 'pdf', url: 'lessons/sheets/math-problem-sheet.pdf' } },
    { id: 'l12', subject: '국어', kind: 'file', title: '독서 기록지', desc: '줄거리, 기억에 남는 문장, 나의 생각을 쓰는 양식', course: '', maker: '국어과', file: { name: '국어_독서_기록지.pdf', ftype: 'pdf', url: 'lessons/sheets/korean-reading-log.pdf' } },
    { id: 'l13', subject: '영어', kind: 'file', title: '단어 시험지 (20문항)', desc: '단어와 뜻을 쓰는 20칸 시험지', course: '', maker: '영어과', file: { name: '영어_단어_시험지.pdf', ftype: 'pdf', url: 'lessons/sheets/english-vocab-test.pdf' } },
    { id: 'l14', subject: '과학', kind: 'file', title: '실험 보고서 양식', desc: '탐구 문제부터 결론까지 6칸 보고서', course: '', maker: '과학과', file: { name: '과학_실험_보고서.pdf', ftype: 'pdf', url: 'lessons/sheets/science-lab-report.pdf' } }
  ],

  // 학급 운영 도구 (학생 이름은 그 기기 화면에서만 쓰고 저장하지 않음)
  classTools: [
    { id: 'c01', icon: 'layout-grid', name: '자리 바꾸기', desc: '교실 모양과 짝을 정하고 고정 자리·앞자리·떨어뜨릴 학생·지난 짝 피하기를 지켜 섞어요. 끌어서 바꾸기, 크게 보기, 인쇄', url: 'apps/class/seat.html', privacy: true },
    { id: 'c02', icon: 'sparkles', name: '청소 구역 돌리기', desc: '구역별 인원·고정 학생을 정하면 모두 고르게 돌아가는 배정표. 이번 주 큰 화면·전체 일정표·학생별 보기', url: 'apps/class/cleaning.html', privacy: true },
    { id: 'c03', icon: 'users-group', name: '모둠 만들기·발표 뽑기', desc: '결석은 빼고 성별·수준을 고르게 모둠 나누기, 역할 정하기. 겹치지 않게 발표 뽑기', url: 'apps/class/groups.html', privacy: true },
    { id: 'c05', icon: 'id-badge-2', name: '1인 1역 배정표', desc: '역할마다 할 일·인원을 정하면 달마다 겹치지 않게 돌려요. 게시용 화면·전체표·학생별 보기', url: 'apps/class/roles.html', privacy: true },
    { id: 'c07', icon: 'list-check', name: '제출 확인표', desc: '이름·번호를 눌러 낸 학생을 체크하고, 안 낸 학생만 모아 알림장용으로 복사해요', url: 'apps/class/checklist.html', privacy: true },
    { id: 'c06', icon: 'alarm', name: '수업 타이머', desc: '교실 화면에 크게 띄우는 타이머·스톱워치·활동 순서. 끝날 무렵 색이 바뀌고 알림 소리', url: 'apps/class/timer.html', privacy: false },
    { id: 'c08', icon: 'calendar-event', name: '학급 D-day 판', desc: '시험·방학·체험학습까지 남은 날을 교실 TV에 크게 보여 줘요. 달력 보기, 알림장용 복사', url: 'apps/class/dday.html', privacy: false },
    { id: 'c04', icon: 'calendar-check', name: '출결 증빙 도우미', desc: '결석·체험학습 서류를 사진이나 PDF로 넣으면 출결 서류를 정리', url: 'tools/attendance/index.html', privacy: true, local: true }
  ],

  // 관리자 시연용: 선생님이 바로 올렸지만 아직 승인 전인 문서 2건(고침 1, 새 문서 1), 신고 1건
  suggestions: [
    {
      id: 's01', type: 'edit', docId: 'd05', status: 'pending', createdAt: '2026-10-06',
      reason: '올해부터 관외 출장도 영수증을 사진으로 내면 된다고 행정실에서 안내받았습니다.',
      title: '출장 여비 처리 순서', category: 'duty',
      aliases: ['출장', '여비', '출장비', '관내출장', '관외출장', '복명서', '출장 신청'],
      body: null, // 원문에서 아래 한 줄만 바꾼 제안 (불러올 때 원문 기준으로 생성)
      patch: { from: '2. 대중교통을 이용했다면 영수증을 행정실에 냅니다.', to: '2. 대중교통을 이용했다면 영수증을 **사진으로 찍어** 행정실 메신저로 보냅니다. (원본 제출 필요 없음)' }
    },
    {
      id: 's02', type: 'new', docId: null, status: 'pending', createdAt: '2026-10-07',
      reason: '검색해도 없어서 만들었습니다. 매년 3월마다 물어보는 내용이에요.',
      title: '교과서 신청·배부 방법', category: 'academic',
      aliases: ['교과서', '교과서 신청', '교과서 배부', '분실 교과서'],
      body: `## 신청
1. 교과서 선정은 교과협의회에서 하고, 부수는 교육과정부가 취합합니다.
2. 전입생 교과서는 교육과정부에 학년·과목을 알려 주면 남는 재고에서 줍니다.

## 배부
학기 시작 전 주에 학급별로 반장이 교과서실(지하 1층)에서 받아 갑니다.

## 분실했을 때
학생이 직접 서점에서 사거나, 교과서실 여분이 있는지 교육과정부에 묻습니다.`
    }
  ],
  reports: [
    { id: 'r01', docId: 'd16', reason: '내용이 틀림', note: '2층 연구실 복사기는 지난달에 3층으로 옮겼어요.', createdAt: '2026-10-05', status: 'open' }
  ],

  tools: [
    {
      id: 't01', icon: 'calendar-check', name: '출결 증빙 도우미', desc: '결석·체험학습 서류를 사진이나 PDF로 넣으면 날짜와 종류를 읽어 출결 서류를 정리해 줍니다.',
      target: '담임', maker: '교무기획부 선생님', url: 'tools/attendance/index.html', local: true, privacy: true, login: false
    },
    {
      id: 't02', icon: 'clock', name: '시험 감독 시간 계산기', desc: '감독 배정표를 붙여 넣으면 선생님별 감독 시간 합계를 바로 보여 줍니다.',
      target: '전체', maker: '연구부 선생님', url: 'tools/proctor/index.html', local: true, privacy: false, login: false
    }
  ]
};
