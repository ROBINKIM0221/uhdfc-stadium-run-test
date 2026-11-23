# 제목 글꼴(Black Han Sans)에서 화면에 나오는 글자만 뽑아 fonts/black-han-sans-ui.woff2 로 만든다.
#   pip install fonttools brotli
#   python tools/font.py <BlackHanSans-Regular.ttf>
# 화면 글자, 선수 이름, 유니폼 이름을 바꾸면 다시 돌린다. 빠진 글자는 test/font.test.js 가 잡는다.
import io, sys
from fontTools import subset

SOURCES = ['js/ui/screens.js', 'js/data/players.js', 'js/data/kits.js']
text = ''.join(io.open(f, encoding='utf-8').read() for f in SOURCES)
chars = sorted({c for c in text if '가' <= c <= '힣'} | {chr(c) for c in range(0x20, 0x7F)})

opt = subset.Options()
opt.flavor = 'woff2'
opt.layout_features = ['*']
font = subset.load_font(sys.argv[1], opt)
sub = subset.Subsetter(opt)
sub.populate(text=''.join(chars))
sub.subset(font)
subset.save_font(font, 'fonts/black-han-sans-ui.woff2', opt)
io.open('fonts/black-han-sans-ui.txt', 'w', encoding='utf-8', newline='\n').write(''.join(c for c in chars if c > '~') + '\n')
print(len(chars), '글자')
