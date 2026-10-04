// 한글 받침 판정과 조사 선택 도구

export function hasFinalConsonant(word) {
  const last = word.charCodeAt(word.length - 1)
  if (Number.isNaN(last) || last < 0xac00 || last > 0xd7a3) {
    return false
  }
  return (last - 0xac00) % 28 !== 0
}

// 받침 유무에 맞는 조사를 골라 줍니다. ('은는', '이가', '을를', '와과')
export function josa(word, pair) {
  const withFinal = hasFinalConsonant(word)
  if (pair === '은는') return withFinal ? '은' : '는'
  if (pair === '이가') return withFinal ? '이' : '가'
  if (pair === '을를') return withFinal ? '을' : '를'
  if (pair === '와과') return withFinal ? '과' : '와'
  return ''
}
