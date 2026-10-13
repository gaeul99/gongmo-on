import type { Request, Response } from "express";

export function normaliseText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function hasControlChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

export function isValidEmail(value: unknown): boolean {
  const email = normaliseText(value);
  return email.length > 0 && email.length <= 60 && /^\S+@\S+\.\S+$/.test(email);
}

export function isValidPhone(value: unknown): boolean {
  const digits = normaliseText(value).replace(/\D/g, "");
  return digits.length === 0 || (digits.length >= 9 && digits.length <= 12);
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

export function getBearerToken(req: Request): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

export function assertLength(
  value: string,
  max: number,
  label: string,
): string | null {
  if (value.length === 0) return `${label}을(를) 입력해 주세요.`;
  if (value.length > max)
    return `${label}은(는) ${max}자 이내로 입력해 주세요.`;
  return null;
}
