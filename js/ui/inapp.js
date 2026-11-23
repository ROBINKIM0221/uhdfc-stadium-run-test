// 인스타그램·카카오톡 같은 앱 안 브라우저인지. 이런 곳은 저장 공간이 따로라, 모은 것이 다른 브라우저에서는 보이지 않는다.
export const isInApp = ua => /Instagram|KAKAOTALK|FBAN|FBAV|FB_IAB|NAVER\(inapp|Line\//i.test(ua || '');
