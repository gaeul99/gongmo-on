# ==========================================================
# 이메일 발송기
# SMTP(SMTP_HOST 등) 설정이 있으면 smtplib로 실제 발송하고,
# 설정이 없으면 콘솔에 기록하고 아웃박스에만 남깁니다(데모 모드).
# ==========================================================
import os
import smtplib
from email.message import EmailMessage

from app.stores import notification_store


def _smtp_settings() -> tuple[str, int, str, str, str]:
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT") or 587)
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    mail_from = os.environ.get("MAIL_FROM") or "공모온 <no-reply@gongmo-on.app>"
    return host, port, user, password, mail_from


def email_configured() -> bool:
    host, _, user, password, _ = _smtp_settings()
    return bool(host and user and password)


def _smtp_send(
    host: str, port: int, user: str, password: str, mail_from: str,
    to: str, subject: str, text: str,
) -> None:
    message = EmailMessage()
    # nodemailer의 from 헤더('이름 <addr>') 형식을 그대로 쓰면 파싱에 실패할 수 있어
    # 표시 이름과 주소를 분리해 헤더로 넣는다.
    if "<" in mail_from and mail_from.endswith(">"):
        display = mail_from[: mail_from.index("<")].strip()
        addr = mail_from[mail_from.index("<") + 1 : -1]
        message["From"] = formataddr((display, addr))
    else:
        message["From"] = mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(message)


from email.utils import formataddr


def send_email(to: str, subject: str, text: str) -> str:
    """반환값: 'sent'(SMTP 발송) | 'failed'(발송 실패) | 'log'(설정 부재) | 'skipped'(수신처 없음)"""
    if not to:
        return "skipped"

    host, port, user, password, mail_from = _smtp_settings()
    via = "log"
    if host and user and password:
        try:
            _smtp_send(host, port, user, password, mail_from, to, subject, text)
            via = "smtp"
        except Exception as error:
            print("[알림] 이메일 발송 실패 — 아웃박스에만 기록합니다.", error)
            via = "failed"

    notification_store.append_outbox(
        channel="email", to=to, subject=subject, text=text, via=via
    )
    if via == "log":
        print(f"[알림·로그 모드] 이메일 → {to} | {subject}\n{text}")
    return "sent" if via == "smtp" else via
