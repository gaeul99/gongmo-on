// ==========================================================
// 회원가입·로그인·로그아웃 컨트롤러 — 검증과 에러 매핑을 담당합니다.
// 계정은 userStore(backend/data/accounts.json)에, 비밀번호는
// salt+scrypt 해시로만 저장합니다.
// ==========================================================

import type { Request, Response } from "express";
import {
  createSession,
  deleteAccount,
  deleteSession,
  findAccount,
  getSessionUser,
  hashPassword,
  makeSalt,
  renameSessions,
  renameUserdata,
  saveAccount,
  verifyPassword,
  type Account,
} from "../services/userStore";
import {
  getBearerToken,
  hasControlChars,
  isValidEmail,
  isValidPhone,
  normaliseText,
  sendError,
} from "../utils/apiValidation";

const NICKNAME_MAX = 20;
const PASSWORD_MAX = 40;
const EMAIL_MAX = 60;

type SignupBody = {
  nickname?: unknown;
  password?: unknown;
  email?: unknown;
  phone?: unknown;
};

function publicUser(account: Account) {
  return {
    nickname: account.nickname,
    joinedAt: account.createdAt,
    email: account.email,
    phone: account.phone,
  };
}

function readString(value: unknown): string {
  return normaliseText(value);
}

export function postSignUp(req: Request, res: Response) {
  const body = (req.body ?? {}) as SignupBody;
  const nickname = readString(body.nickname);
  const password = typeof body.password === "string" ? body.password : "";
  const email = readString(body.email);
  const phoneDigits = readString(body.phone).replace(/\D/g, "");

  if (
    !nickname ||
    nickname.length > NICKNAME_MAX ||
    hasControlChars(nickname)
  ) {
    sendError(res, 400, "INVALID_NICKNAME", "아이디는 1~20자로 입력해 주세요.");
    return;
  }
  if (password.length < 8 || password.length > PASSWORD_MAX) {
    sendError(res, 400, "INVALID_PASSWORD", "비밀번호는 8자 이상이어야 해요.");
    return;
  }
  if (!isValidEmail(email) || email.length > EMAIL_MAX) {
    sendError(
      res,
      400,
      "INVALID_EMAIL",
      "알림을 받을 이메일 주소를 입력해 주세요.",
    );
    return;
  }
  if (!isValidPhone(phoneDigits)) {
    sendError(
      res,
      400,
      "INVALID_PHONE",
      "휴대폰 번호 형식이 올바르지 않아요. 숫자만 9~12자로 입력해 주세요.",
    );
    return;
  }
  if (findAccount(nickname)) {
    sendError(
      res,
      409,
      "NICKNAME_TAKEN",
      "이미 가입된 아이디예요. 다른 아이디를 사용해 주세요.",
    );
    return;
  }

  const salt = makeSalt();
  const account: Account = {
    nickname,
    salt,
    passwordHash: hashPassword(password, salt),
    email,
    phone: phoneDigits || undefined,
    createdAt: new Date().toISOString(),
  };
  saveAccount(account);
  const token = createSession(nickname);
  res.json({ success: true, data: { user: publicUser(account), token } });
}

export function postSignIn(req: Request, res: Response) {
  const body = (req.body ?? {}) as SignupBody;
  const nickname = readString(body.nickname);
  const password = typeof body.password === "string" ? body.password : "";

  // 미가입 아이디와 비밀번호 불일치를 같은 응답으로 묶는다 — 응답 차이로
  // 아이디 존재 여부를 탐지(계정 열거)할 수 없게 하기 위해서입니다.
  const account = findAccount(nickname);
  if (!account || !verifyPassword(account, password)) {
    sendError(
      res,
      401,
      "AUTH_FAILED",
      "아이디 또는 비밀번호가 올바르지 않아요.",
    );
    return;
  }

  const token = createSession(nickname);
  res.json({ success: true, data: { user: publicUser(account), token } });
}

export function postLogout(req: Request, res: Response) {
  const token = getBearerToken(req);
  if (token) deleteSession(token);
  res.json({ success: true });
}

// ---------- 회원정보 수정 ----------

type ProfileBody = {
  currentPassword?: unknown;
  nickname?: unknown;
  email?: unknown;
  phone?: unknown;
};

// 회원정보 수정 — 현재 비밀번호 확인 후 아이디(표시 이름)·이메일·휴대폰을 바꿉니다.
// 아이디는 로그인 ID이자 저장소 키라, 바꾸면 세션과 사용자 데이터 백업도
// 함께 옮겨 로그인 상태와 내역이 그대로 유지됩니다.
export function putProfile(req: Request, res: Response) {
  const token = getBearerToken(req);
  const current = token ? getSessionUser(token) : undefined;
  if (!current) {
    sendError(res, 401, "UNAUTHORIZED", "로그인 후 이용해 주세요.");
    return;
  }
  const account = findAccount(current);
  if (!account) {
    sendError(
      res,
      404,
      "ACCOUNT_NOT_FOUND",
      "계정을 찾을 수 없어요. 다시 로그인해 주세요.",
    );
    return;
  }

  const body = (req.body ?? {}) as ProfileBody;
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword || !verifyPassword(account, currentPassword)) {
    sendError(res, 401, "WRONG_PASSWORD", "현재 비밀번호가 일치하지 않아요.");
    return;
  }

  const nextNickname = readString(body.nickname) || account.nickname;
  const nextEmail = readString(body.email) || account.email;
  const phoneDigits = readString(body.phone).replace(/\D/g, "");

  if (
    !nextNickname ||
    nextNickname.length > NICKNAME_MAX ||
    hasControlChars(nextNickname)
  ) {
    sendError(res, 400, "INVALID_NICKNAME", "아이디는 1~20자로 입력해 주세요.");
    return;
  }
  if (!isValidEmail(nextEmail) || nextEmail.length > EMAIL_MAX) {
    sendError(
      res,
      400,
      "INVALID_EMAIL",
      "알림을 받을 이메일 주소를 입력해 주세요.",
    );
    return;
  }
  if (!isValidPhone(phoneDigits)) {
    sendError(
      res,
      400,
      "INVALID_PHONE",
      "휴대폰 번호 형식이 올바르지 않아요. 숫자만 9~12자로 입력해 주세요.",
    );
    return;
  }
  if (nextNickname !== account.nickname && findAccount(nextNickname)) {
    sendError(
      res,
      409,
      "NICKNAME_TAKEN",
      "이미 사용 중인 아이디예요. 다른 아이디를 사용해 주세요.",
    );
    return;
  }

  const updated: Account = {
    ...account,
    nickname: nextNickname,
    email: nextEmail,
    phone: phoneDigits || undefined,
  };
  if (nextNickname !== account.nickname) {
    // 아이디 변경은 3개 파일에 걸친 다단계 쓰기다. 중간에 죽어도 계정·세션이
    // 남아 있도록 기존 계정 삭제를 마지막으로 미룬다 — 최악의 경우 두 아이디가
    // 잠시 공존하지만(재시도로 정리 가능), 계정이 통째로 사라지는 일은 없다.
    saveAccount(updated);
    renameUserdata(account.nickname, nextNickname);
    renameSessions(account.nickname, nextNickname);
    deleteAccount(account.nickname);
  } else {
    saveAccount(updated);
  }
  res.json({ success: true, data: { user: publicUser(updated) } });
}
