# UHDFC Stadium Run

울산 HD FC 선수로 공을 몰고 달리며 수비를 제치는 달리기 게임. 달리면서 모은 코인으로 선수와 유니폼을 뽑는다.

## 해 보기

```
npm start
```

브라우저에서 http://localhost:5173 을 연다. 설치할 것은 없다(Node 만 있으면 된다).

## 조작

| | 폰 | 키보드 |
|---|---|---|
| 옆 레인으로 | 좌우로 밀기 | ← → (A D) |
| 넘기 | 위로 밀기 | ↑ (W) |
| 멈춤 | 오른쪽 위 버튼 | Esc |

## 규칙

- 다섯 레인을 끝없이 달린다. 기록은 달린 거리 하나다.
- 막는 선수에 닿으면 공을 뺏기고 그 판이 끝난다. 낮게 들어오는 태클과 누운 골키퍼는 넘을 수 있다.
- 옆으로 갈 때 나오는 기술은 겉모습일 뿐이다. 어떤 기술이 나와도 옆으로 가는 시간과 판정은 같다.
- 선수는 겉모습만 다르다. 누구로 달려도 같은 조작이면 같은 기록이 나온다.
- 뽑기는 코인 300개에 한 번이고, 이미 가진 것은 다시 나오지 않는다.

## 폴더

- `js/sim` 규칙 계산. 1/60초 고정 틱과 씨앗 난수만 써서, 같은 씨앗과 같은 입력이면 같은 결과가 나온다. 화면 없이 node 로 검사한다.
- `js/render` three.js 로 그리기. 규칙이 계산한 것을 읽기만 한다.
- `js/data` 선수, 유니폼, 기술.
- `js/ui` 화면, 입력, 저장, 뽑기, 소리.
- `lab.html` 동작 하나를 따로 보는 화면(`?clip=이름`, 막는 선수는 `?who=def&clip=장면`).

## 검사와 도구

```
npm test                              # 규칙·자료·저장·동작 검사
node tools/smoke.cjs <주소>           # 실제 시간으로 한 바퀴 돌려 본다
node tools/perf.cjs <주소>            # 이 컴퓨터에서 초당 장수를 잰다
node tools/balance.mjs                # 사람을 흉내 낸 자동 조종으로 거리 분포를 본다
node tools/faces.cjs <사진 폴더>      # 선수 사진에서 얼굴 그림과 색을 만든다
node tools/shot.cjs / sheet.cjs       # 화면을 찍는다
python tools/font.py <글꼴 파일>      # 제목 글꼴에서 화면에 나오는 글자만 뽑는다
```

화면을 여는 도구는 Playwright 와 크롬이 있어야 한다.

## 쓴 것

three.js(MIT)와 그 불러오기 도구(GLTFLoader, SkeletonUtils, BufferGeometryUtils)를 `js/vendor` 에 같이 싣는다. 사람 모델과 동작(`models`)은 Adobe Mixamo 의 것을 게임에 맞게 줄인 것이다. 글꼴 Teko, Barlow Condensed, Black Han Sans, 등 마킹의 Gothic A1 은 OFL 이다(쓰는 글자만 뽑은 것: `tools/font.py`, `tools/marking-font.py`). 잔디 사진(`img/turf`)은 ambientCG 의 Grass005(CC0)를 색만 맞춘 것이다.
