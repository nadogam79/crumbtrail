const HIDE_UNTIL_KEY = 'crumbtrail.guideHiddenOn'

// '오늘 하루 보지 않기'는 이 브라우저에서만 기억한다. 저장소를 못 쓰면 그냥 매번 보여준다.
export function isGuideHiddenToday() {
  try {
    return localStorage.getItem(HIDE_UNTIL_KEY) === new Date().toDateString()
  } catch {
    return false
  }
}

export function hideGuideForToday() {
  try {
    localStorage.setItem(HIDE_UNTIL_KEY, new Date().toDateString())
  } catch {
    // 저장 실패 시 다음에 다시 보일 뿐이므로 무시
  }
}
