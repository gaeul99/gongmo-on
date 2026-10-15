# ==========================================================
# 공모전 마감 알림 스케줄러
# 30분마다 구독자의 응모·관심 공모전 마감일을 확인해
# D-7·D-3·당일에 이메일로 알립니다.
# 같은 알림을 하루에 여러 번 보내지 않도록 sentKeys로 기록합니다.
# ==========================================================
import threading
from datetime import date, datetime

from app.services.notification_senders import send_email
from app.stores import notification_store

CHECK_INTERVAL_SEC = 30 * 60
REMIND_DAYS_BEFORE = [7, 3, 0]


def today_key(now: datetime | None = None) -> str:
    value = now or datetime.now()
    return f"{value.year}-{value.month:02d}-{value.day:02d}"


# 마감일(자정)과 오늘(자정)의 날짜 차이. 당일이면 0, 하루 남으면 1.
def days_until(deadline: str, now: datetime | None = None) -> int | None:
    try:
        deadline_date = datetime.strptime(deadline, "%Y-%m-%d")
    except ValueError:
        return None
    value = now or datetime.now()
    today = datetime(value.year, value.month, value.day)
    return (deadline_date - today).days


def _notify_subscriber(subscriber: dict, now: datetime | None = None) -> int:
    if not subscriber.get("optIn") or not subscriber.get("email"):
        return 0

    today = today_key(now)
    seen = list(subscriber.get("sentKeys") or [])
    seen_set = set(seen)
    sent_count = 0

    for contest in subscriber.get("contests") or []:
        left = days_until(contest.get("deadline", ""), now)
        if left is None or left not in REMIND_DAYS_BEFORE:
            continue

        key = f"{contest.get('id')}-d{left}-{today}"
        if key in seen_set:
            continue
        seen_set.add(key)
        seen.append(key)

        when = "오늘 마감" if left == 0 else f"마감 {left}일 전"
        email_subject = f"[공모온] '{contest.get('title')}' {when}"
        lines = [
            f"{subscriber['nickname']}님, 공모전 마감이 다가왔어요.",
            "",
            f"· 공모전: {contest.get('title')}",
            f"· 마감일: {contest.get('deadline')} ({when})",
            f"· 바로 가기: {contest['url']}" if contest.get("url") else "",
            "",
            "공모온 — 아이디어에서 공모전까지, 가장 빠른 길",
        ]
        text = "\n".join(line for line in lines if line)
        send_email(subscriber["email"], email_subject, text)
        sent_count += 1

    # sentKeys는 최근 200개만 유지해 테이블이 커지지 않게 합니다.
    subscriber["sentKeys"] = seen[-200:]
    notification_store.save_subscriber(subscriber)
    return sent_count


def run_deadline_check(now: datetime | None = None) -> int:
    subscribers = notification_store.list_subscribers()
    total = 0
    for subscriber in subscribers:
        total += _notify_subscriber(subscriber, now)
    return total


def start_notification_scheduler() -> None:
    # 시작 5초 뒤 1회 실행해 서버 재시작 사이에 밀린 알림도 보냅니다.

    def first_run():
        try:
            count = run_deadline_check()
            if count > 0:
                print(f"[알림] 시작 시 마감 알림 {count}건을 발송했습니다.")
        except Exception as error:
            print("[알림] 시작 시 확인 실패", error)

    def loop():
        while True:
            try:
                run_deadline_check()
            except Exception as error:
                print("[알림] 마감 확인 실패", error)
            threading.Event().wait(CHECK_INTERVAL_SEC)

    timer = threading.Timer(5.0, first_run)
    timer.daemon = True
    timer.start()
    worker = threading.Thread(target=loop, daemon=True)
    worker.start()
