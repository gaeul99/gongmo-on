// ==========================================================
// 데모용 계정 인증 — 계정은 이 브라우저 localStorage에만 저장됩니다.
// 비밀번호는 평문으로 저장하지 않고 SHA-256 해시로만 보관합니다.
// ==========================================================

const ACCOUNTS_KEY = 'idea-navigation:accounts'

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
    return true
  } catch {
    return false
  }
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte
    .toString(16)
    .padStart(2, '0')).join('')
}

// 성공 시 { ok: true, user }, 실패 시 { ok: false, error }를 돌려줍니다.
// email은 필수, phone은 선택 — 알림(이메일·문자) 발송에 사용됩니다.
export async function signUp(nickname, password, email, phone) {
  const trimmed = nickname.trim()
  if (!trimmed) return { ok: false, error: '아이디를 입력해 주세요.' }
  if (password.length < 4) return { ok: false, error: '비밀번호는 4자 이상이어야 해요.' }
  const trimmedEmail = (email ?? '').trim()
  if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
    return { ok: false, error: '알림을 받을 이메일 주소를 입력해 주세요.' }
  }
  const phoneDigits = (phone ?? '').replace(/\D/g, '')
  if (phone && (phoneDigits.length < 9 || phoneDigits.length > 12)) {
    return { ok: false, error: '휴대폰 번호 형식이 올바르지 않아요. 숫자만 9~12자로 입력해 주세요.' }
  }

  const accounts = loadAccounts()
  if (accounts.some((account) => account.nickname === trimmed)) {
    return { ok: false, error: '이미 가입된 아이디예요. 다른 아이디를 사용해 주세요.' }
  }

  const passwordHash = await hashPassword(password)
  const user = { nickname: trimmed, joinedAt: new Date().toISOString(), email: trimmedEmail, phone: phoneDigits || undefined }
  const saved = saveAccounts([
    ...accounts,
    {
      nickname: trimmed,
      passwordHash,
      email: trimmedEmail,
      phone: phoneDigits || undefined,
      createdAt: user.joinedAt,
    },
  ])
  if (!saved) return { ok: false, error: '계정을 저장하지 못했어요. 브라우저 저장 설정을 확인해 주세요.' }

  return { ok: true, user }
}

export async function signIn(nickname, password) {
  const trimmed = nickname.trim()
  const account = loadAccounts().find((item) => item.nickname === trimmed)
  if (!account) {
    return { ok: false, error: '가입되지 않은 아이디예요. 회원가입부터 진행해 주세요.' }
  }

  const passwordHash = await hashPassword(password)
  if (account.passwordHash !== passwordHash) {
    return { ok: false, error: '비밀번호가 일치하지 않아요.' }
  }

  return {
    ok: true,
    user: {
      nickname: account.nickname,
      joinedAt: account.createdAt,
      email: account.email,
      phone: account.phone,
    },
  }
}
