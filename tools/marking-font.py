# 유니폼 등 마킹의 이름·스폰서 글꼴(Gothic A1 Black)에서 쓰는 글자만 뽑아 fonts/gothic-a1-900-marking.woff2 로 만든다
# (선수 이름과 유니폼 자료의 한글 + 영문). 등번호는 화면 글꼴 Barlow Condensed 를 같이 쓴다.
#   pip install fonttools brotli
#   python tools/marking-font.py <GothicA1-Black.ttf>
# 선수 이름이나 스폰서 글자를 바꾸면 다시 돌린다. 빠진 글자는 test/font.test.js 가 잡는다.
import io, sys
from fontTools import subset

def cut(src, chars, out):
    opt = subset.Options()
    opt.flavor = 'woff2'
    opt.layout_features = ['*']
    font = subset.load_font(src, opt)
    sub = subset.Subsetter(opt)
    sub.populate(text=''.join(chars))
    sub.subset(font)
    subset.save_font(font, out, opt)

text = ''.join(io.open(f, encoding='utf-8').read() for f in ['js/data/players.js', 'js/data/kits.js'])
hangul = sorted({c for c in text if '가' <= c <= '힣'})
cut(sys.argv[1], hangul + [chr(c) for c in range(0x20, 0x7F)], 'fonts/gothic-a1-900-marking.woff2')
io.open('fonts/gothic-a1-900-marking.txt', 'w', encoding='utf-8', newline='\n').write(''.join(hangul) + '\n')
print(len(hangul), '글자')
