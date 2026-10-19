# make_sheets.py: 수업 탭 예시용 학습지 양식 PDF 4종을 만든다 (직접 만든 빈 양식, 교과서 내용 없음).
# 실행: python -I src/lessons/make_sheets.py src/lessons/sheets
import sys, os, fitz

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
W, H = fitz.paper_size('a4')
F = 'korea'

def page(doc, title, sub):
    p = doc.new_page(width=W, height=H)
    p.insert_text((50, 70), title, fontname=F, fontsize=20)
    p.insert_text((50, 92), sub, fontname=F, fontsize=10, color=(0.35, 0.35, 0.35))
    # 이름 칸 (학생이 손으로 쓰는 칸)
    p.insert_text((330, 70), '학년      반      번   이름', fontname=F, fontsize=10)
    p.draw_line((330, 74), (W - 50, 74), color=(0.4, 0.4, 0.4), width=0.6)
    p.draw_line((50, 104), (W - 50, 104), color=(0.08, 0.41, 0.31), width=1.4)
    return p

def box(p, y, h, label):
    p.draw_rect(fitz.Rect(50, y, W - 50, y + h), color=(0.3, 0.3, 0.3), width=0.7)
    p.insert_text((58, y + 16), label, fontname=F, fontsize=10.5, color=(0.08, 0.41, 0.31))

def save(doc, name):
    doc.set_metadata({'title': name, 'author': '', 'creator': '', 'producer': ''})
    doc.save(os.path.join(OUT, name + '.pdf'), garbage=4, deflate=True)

# 1) 수학: 문제 풀이 학습지 (문제 칸 + 풀이 칸, 모눈)
d = fitz.open(); p = page(d, '수학 문제 풀이 학습지', '단원:                        학습 목표:')
y = 120
for n in range(1, 4):
    box(p, y, 215, f'문제 {n}')
    for gx in range(int(W / 2), int(W - 50), 14):
        p.draw_line((gx, y + 26), (gx, y + 210), color=(0.86, 0.9, 0.88), width=0.4)
    for gy in range(y + 26, y + 211, 14):
        p.draw_line((W / 2, gy), (W - 50, gy), color=(0.86, 0.9, 0.88), width=0.4)
    p.insert_text((W / 2 + 6, y + 16), '풀이', fontname=F, fontsize=10, color=(0.4, 0.4, 0.4))
    y += 228
save(d, '수학_문제풀이_학습지')

# 2) 국어: 독서 기록지
d = fitz.open(); p = page(d, '독서 기록지', '책 제목:                          지은이:                    읽은 날:')
y = 120
for label, h in [('줄거리 한 문단', 150), ('가장 기억에 남는 문장과 까닭', 140), ('글쓴이에게 묻고 싶은 것', 110), ('나의 생각 (내 삶과 이어 보기)', 180)]:
    box(p, y, h, label)
    for ly in range(y + 40, y + h, 22):
        p.draw_line((60, ly), (W - 60, ly), color=(0.85, 0.85, 0.85), width=0.4)
    y += h + 12
save(d, '국어_독서_기록지')

# 3) 영어: 단어 시험지 (20칸)
d = fitz.open(); p = page(d, 'Vocabulary Test', 'Unit:              Score:      / 20')
y = 125
for i in range(20):
    col = 0 if i < 10 else 1
    yy = y + (i % 10) * 58
    x = 50 + col * ((W - 100) / 2 + 10)
    p.insert_text((x, yy + 18), f'{i + 1:>2}.', fontname=F, fontsize=11)
    p.draw_line((x + 26, yy + 20), (x + 120, yy + 20), color=(0.45, 0.45, 0.45), width=0.6)
    p.insert_text((x + 126, yy + 18), '뜻', fontname=F, fontsize=9, color=(0.5, 0.5, 0.5))
    p.draw_line((x + 142, yy + 20), (x + (W - 100) / 2 - 10, yy + 20), color=(0.45, 0.45, 0.45), width=0.6)
save(d, '영어_단어_시험지')

# 4) 과학: 실험 보고서
d = fitz.open(); p = page(d, '과학 실험 보고서', '실험 날짜:              모둠:              실험 제목:')
y = 120
for label, h in [('탐구 문제', 60), ('가설', 60), ('준비물', 60), ('실험 과정 (그림으로 그려도 좋아요)', 170), ('결과 (표·그래프)', 170), ('결론과 더 알아보고 싶은 것', 110)]:
    box(p, y, h, label)
    y += h + 10
save(d, '과학_실험_보고서')
print('ok', sorted(os.listdir(OUT)))
