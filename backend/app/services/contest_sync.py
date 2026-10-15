# ==========================================================
# 공모전 자동 등록(스크래핑 동기화)
# 위비티(wevity.com)와 콘테스트코리아(contestkorea.com)의 접수 중·접수 예정
# 공모전 목록을 주기적으로 읽어 PostgreSQL DB(contests 테이블)에 등록한다.
# 수동으로 정제한 목업 데이터(frontend mockData.js)는 프론트엔드 폴백이며,
# 이 서버는 그 외의 공모전을 자동으로 수집해 /api/contests로 내려준다.
# robots.txt가 Allow:/ 인 공개 목록 페이지만 읽고, 요청 사이에 지연을 둔다.
# ==========================================================
import json
import re
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx

from app.db.pool import get_pool
from app.utils.timeutil import iso_now, iso_utc

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) GongmoOnContestSync/1.0"
)
REQUEST_DELAY_SEC = 0.4
DETAIL_FETCH_LIMIT = 200  # 동기화 1회당 상세 페이지 최대 요청 수(초기 수집이 몇 패스에 걸쳐 끝난다)
MAX_PAGES = 15
KEEP_PRUNED_DAYS = 60  # 마감 후에도 이 기간은 기록으로 남겨 조회되게 하고, 지나면 다음 동기화 때 제거한다
SYNC_INTERVAL_SEC = 6 * 60 * 60  # 6시간
SYNC_MIN_GAP_SEC = 60 * 60  # 재시작 직후 중복 실행 방지용 최소 간격

CONTEST_COLUMNS = (
    "id, source, source_id, title, organizer, field, start_date, deadline, "
    "eligibility, age_groups, image, url, description, apply_steps"
)


def _sleep(sec: float) -> None:
    time.sleep(sec)


# ---------- 소스별 분야 매핑 ----------
# 콘테스트코리아 게시판(bcode) → 앱 분야.
CK_BCODE_FIELD = {
    "030110001": "문학 (문예·글짓기)",
    "030210001": "디자인 (네이밍·슬로건)",
    "030310001": "과학기술 (학문·IT)",
    "030610001": "디자인 (미술·웹툰)",
    "030810001": "예체능 (스포츠)",
    "030910001": "예체능 (음악·댄스)",
    "031210001": "기타 (사진·영상)",
    "031410001": "창업 (아이디어·건축)",
    "031610001": "기타 (요리·뷰티·오디션)",
    "031810001": "기타 (다양한 분야)",
}

# 콘테스트코리아 '대표분야' 문구 → 앱 분야(bcode를 못 읽었을 때의 폴백)
CK_CATEGORY_FIELD = [
    (r"과학|학문|IT", "과학기술 (학문·IT)"),
    (r"디자인|웹툰|미술", "디자인 (미술·웹툰)"),
    (r"네이밍|슬로건", "디자인 (네이밍·슬로건)"),
    (r"문학|문예", "문학 (문예·글짓기)"),
    (r"아이디어|건축|창업", "창업 (아이디어·건축)"),
    (r"음악|콩쿠르|댄스", "예체능 (음악·댄스)"),
    (r"사진|영상|영화", "기타 (사진·영상)"),
    (r"요리|뷰티|오디션|배우", "기타 (요리·뷰티·오디션)"),
    (r"스포츠", "예체능 (스포츠)"),
]

# 위비티 '분야' 문구 → 앱 분야
WEVITY_FIELD = [
    (r"기획|아이디어", "기타 (아이디어·기획)"),
    (r"광고|마케팅|홍보", "생활 (광고·마케팅)"),
    (r"논문|리포트", "기타 (논문·리포트)"),
    (r"영상|UCC|사진", "기타 (사진·영상)"),
    (r"디자인|캐릭터|웹툰", "디자인 (캐릭터·웹툰)"),
    (r"웹|모바일|플래시", "과학기술 (웹·모바일)"),
    (r"게임|소프트웨어|프로그램", "과학기술 (게임·소프트웨어)"),
    (r"과학|공학", "과학기술 (과학·공학)"),
    (r"문학|글|시나리오", "문학 (글·시나리오)"),
    (r"건축|건설|인테리어", "창업 (건축·인테리어)"),
    (r"네이밍|슬로건", "디자인 (네이밍·슬로건)"),
    (r"예체능|미술|음악", "예체능 (미술·음악)"),
    (r"취업|창업|스타트업", "창업 (취업·창업)"),
    (r"해외", "기타 (해외)"),
]


def map_field(source: str, category: str, bcode: str | None = None) -> str:
    if source == "contestkorea":
        if bcode and bcode in CK_BCODE_FIELD:
            return CK_BCODE_FIELD[bcode]
        for pattern, field in CK_CATEGORY_FIELD:
            if re.search(pattern, category):
                return field
        return f"기타 ({category.replace('•', '·')})" if category else "기타"
    for pattern, field in WEVITY_FIELD:
        if re.search(pattern, category):
            return field
    return f"기타 ({category.replace('/', '·')})" if category else "기타"


# ---------- DB 상태 ----------

def _to_contest(row) -> dict:
    contest = {
        "id": row[0],
        "source": row[1] if row[1] == "wevity" else "contestkorea",
        "sourceId": row[2],
        "title": row[3],
        "organizer": row[4],
        "field": row[5],
        "deadline": row[7],
        "eligibility": row[8],
        "ageGroups": row[9] or [],
        "image": row[10],
        "url": row[11],
        "description": row[12],
        "applySteps": row[13] or [],
    }
    if row[6]:
        contest["startDate"] = row[6]
    return contest


def _load_state() -> dict:
    with get_pool().connection() as conn:
        state_row = conn.execute(
            "SELECT next_id, registry, last_sync FROM sync_state WHERE id = 1"
        ).fetchone()
        contest_rows = conn.execute(
            f"SELECT {CONTEST_COLUMNS} FROM contests ORDER BY id ASC"
        ).fetchall()
    state = {
        "nextId": int(state_row[0]) if state_row and state_row[0] and int(state_row[0]) > 0 else 1000,
        "registry": (state_row[1] if state_row and state_row[1] else {}) or {},
        "contests": [_to_contest(row) for row in contest_rows],
    }
    if state_row and state_row[2]:
        state["lastSync"] = iso_utc(state_row[2])
    return state


# 동기화 결과를 DB에 반영한다. 사라진 항목(마감 정리)은 삭제하고, 새 항목은
# 넣는다 — 기존 항목은 절대 고치지 않는다는 동기화 규칙을 그대로 유지한다.
def _persist_state(state: dict) -> None:
    with get_pool().connection() as conn:
        with conn.transaction():
            keep_ids = [contest["id"] for contest in state["contests"]]
            if not keep_ids:
                conn.execute("DELETE FROM contests")
            else:
                conn.execute(
                    "DELETE FROM contests WHERE NOT (id = ANY(%s::int[]))",
                    (keep_ids,),
                )
            for contest in state["contests"]:
                conn.execute(
                    f"""INSERT INTO contests
                          ({CONTEST_COLUMNS})
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT DO NOTHING""",
                    (
                        contest["id"],
                        contest["source"],
                        contest["sourceId"],
                        contest["title"],
                        contest["organizer"],
                        contest["field"],
                        contest.get("startDate"),
                        contest["deadline"],
                        contest["eligibility"],
                        json.dumps(contest.get("ageGroups") or [], ensure_ascii=False),
                        contest["image"],
                        contest["url"],
                        contest["description"],
                        json.dumps(contest.get("applySteps") or [], ensure_ascii=False),
                    ),
                )
            conn.execute(
                """INSERT INTO sync_state (id, next_id, registry, last_sync)
                   VALUES (1, %s, %s, %s)
                   ON CONFLICT (id) DO UPDATE SET
                     next_id = EXCLUDED.next_id,
                     registry = EXCLUDED.registry,
                     last_sync = EXCLUDED.last_sync""",
                (
                    state["nextId"],
                    json.dumps(state["registry"], ensure_ascii=False),
                    state.get("lastSync"),
                ),
            )


# ---------- HTML 유틸 ----------

_ENTITY_MAP = [
    ("&nbsp;", " "),
    ("&amp;", "&"),
    ("&lt;", "<"),
    ("&gt;", ">"),
    ("&quot;", '"'),
    ("&#0?39;", "'"),
    ("&rsquo;", "'"),
    ("&middot;", "·"),
    ("&bull;", "·"),
]


def decode_entities(text: str) -> str:
    for entity, char in _ENTITY_MAP:
        text = text.replace(entity, char)
    return text


def strip_tags(html: str) -> str:
    return re.sub(r"\s+", " ", decode_entities(re.sub(r"<[^>]+>", " ", html))).strip()


def strip_tags_keep_breaks(html: str) -> str:
    decoded = decode_entities(
        re.sub(r"<[^>]+>", "", re.sub(r"<(?:br|/p|/div|/li)[^>]*>", "\n", html, flags=re.I))
    )
    decoded = re.sub(r"[ \t ]+", " ", decoded)
    decoded = re.sub(r"\n{3,}", "\n\n", decoded)
    return decoded.strip()


def meta_content(html: str, property_name: str) -> str:
    match = re.search(
        rf'<meta[^>]+property=["\']{property_name}["\'][^>]+content=["\']([\s\S]*?)["\']',
        html,
        re.I,
    )
    return decode_entities(match.group(1)).strip() if match else ""


# ---------- 날짜 ----------

def to_iso_date(year: int, month: int, day: int) -> str:
    return f"{year:04d}-{month:02d}-{day:02d}"


def today_iso() -> str:
    now = datetime.now()
    return to_iso_date(now.year, now.month, now.day)


def add_days_iso(base_iso: str, days: int) -> str:
    base = datetime.strptime(base_iso, "%Y-%m-%d")
    return (base + timedelta(days=days)).strftime("%Y-%m-%d")


_FULL_PERIOD_PATTERN = re.compile(
    r"(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\s*(?:~|–|—|-)\s*(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})"
)


def parse_full_period(text: str) -> dict:
    match = _FULL_PERIOD_PATTERN.search(text)
    if not match:
        return {}
    return {
        "startDate": to_iso_date(int(match.group(1)), int(match.group(2)), int(match.group(3))),
        "deadline": to_iso_date(int(match.group(4)), int(match.group(5)), int(match.group(6))),
    }


_SHORT_PART_PATTERN = re.compile(r"(\d{1,2})[.\-/](\d{1,2})")


def parse_short_period(text: str, dday: str | None = None) -> dict:
    """
    연도 없는 목록 기간('09.30~10.25')과 D-day로 기간을 복원한다.
    D-day는 접수 마감(마지막 날짜)을 가리키므로 deadline = 오늘 + D, 연도는
    목록의 마지막 MM.DD와 일치하는 해로 고른다.
    """
    parts = list(_SHORT_PART_PATTERN.finditer(text))
    if not parts:
        return {}
    first = parts[0]
    last = parts[-1]
    last_month = int(last.group(1))
    last_day = int(last.group(2))

    d_match = re.search(r"D[+-](\d{1,3})", dday) if isinstance(dday, str) else None
    if d_match:
        days = int(d_match.group(1))
        deadline = add_days_iso(today_iso(), days)
        dl_year, dl_month, dl_day = (int(v) for v in deadline.split("-"))
        # D-day로 계산한 날짜가 목록의 마지막 MM.DD와 어긋나면(표시 지연 등) 무시한다.
        if dl_month != last_month or dl_day != last_day:
            return {}
        # 시작 월이 마감 월보다 6개월 이상 크면 연도가 바뀌는 구간(12월→1월)이다.
        start_month = int(first.group(1))
        start_year = dl_year - 1 if start_month - last_month > 6 else dl_year
        return {
            "startDate": to_iso_date(start_year, start_month, int(first.group(2))),
            "deadline": deadline,
        }

    # D-day를 못 믿으면 올해~내년 중 MM.DD가 오늘 이후인 해를 고른다.
    now_year = datetime.now().year
    for year in (now_year, now_year + 1):
        candidate = to_iso_date(year, last_month, last_day)
        if candidate >= today_iso():
            return {"deadline": candidate}
    return {}


# ---------- 참가 자격 → 연령 ----------

_TEEN_PATTERN = re.compile(r"(유치원|초등|중학생|고등학생|중고등|청소년|아동|학생\(자\)|미성년)")
_ADULT_PATTERN = re.compile(r"(대학생|대학원생|대학\)|재학생|휴학생|일반인|성인|외국인|직장인|주부|시니어|누구나|전체|국민)")


def derive_age_groups(eligibility: str) -> list[str]:
    text = eligibility or ""
    teen = _TEEN_PATTERN.search(text) is not None
    adult = _ADULT_PATTERN.search(text) is not None
    if teen and adult:
        return ["teen", "adult"]
    if teen:
        return ["teen"]
    if adult:
        return ["adult"]
    # 자격 문구가 비어 있으면 성인 기본값으로 둔다(필터에서 놓치지 않게).
    return ["adult"]


# ---------- HTTP ----------

def fetch_html(url: str) -> str:
    last_error: Exception | None = None
    for _attempt in range(2):
        try:
            with httpx.Client(
                timeout=15.0,
                headers={"User-Agent": USER_AGENT, "Accept-Language": "ko-KR,ko;q=0.9"},
                follow_redirects=True,
            ) as client:
                response = client.get(url)
                response.raise_for_status()
                return response.text
        except Exception as error:
            last_error = error
            _sleep(0.7)
    raise last_error if last_error else RuntimeError("fetch failed")


# ---------- 콘테스트코리아 ----------
CK_BASE = "https://www.contestkorea.com"

_CK_ITEM_PATTERN = re.compile(
    r'<a href="view\.php\?int_gbn=(?:\d+)(?:&amp;|&)Txt_bcode=(\d+)(?:&amp;|&)str_no=(\d+)"[^>]*>'
    r"([\s\S]{0,600}?)</a>([\s\S]{0,4000}?)(?=<a href=\"view\.php|<div class=\"paging|</table|$)"
)


def parse_ck_list(html: str) -> list[dict]:
    candidates: list[dict] = []
    # 항목 경계: 각 공모전의 좋아요 버튼(str_no)이 항목 안에 한 번씩 나온다.
    for match in _CK_ITEM_PATTERN.finditer(html):
        bcode = match.group(1) or ""
        str_no = match.group(2) or ""
        anchor_inner = match.group(3) or ""
        tail = match.group(4) or ""
        title_match = re.search(r'<span class="txt">([\s\S]{0,300}?)</span>', anchor_inner)
        title = strip_tags(title_match.group(1)) if title_match else ""
        if not str_no or not title:
            continue
        category_match = re.search(r'<span class="category">([\s\S]{0,120}?)</span>', anchor_inner)
        category = strip_tags(category_match.group(1)) if category_match else ""

        organizer_match = re.search(r"<strong>주최</strong>\s*\.?\s*([\s\S]{0,200}?)</li>", tail)
        organizer = strip_tags(organizer_match.group(1)) if organizer_match else ""
        eligibility_match = re.search(r"<strong>대상</strong>\s*\.?\s*([\s\S]{0,300}?)</li>", tail)
        eligibility = strip_tags(eligibility_match.group(1)) if eligibility_match else ""
        dates_match = re.search(r"<em>접수[^<]*</em>\s*([\s\S]{0,80}?)</span>", tail)
        dates_text = strip_tags(dates_match.group(1)) if dates_match else ""
        dday_match = re.search(r'<span class="day">([^<]{0,20})<', tail)
        dday = strip_tags(dday_match.group(1)) if dday_match else ""
        status_match = re.search(r'<span class="day">[^<]*</span>\s*<span class="condition">([^<]{0,20})<', tail)
        status = strip_tags(status_match.group(1)) if status_match else ""

        # 공지·문의 게시물과 마감된 공모전은 등록하지 않는다.
        if re.search(r"뉴스와정보|공지사항|문의|질문과답변", category):
            continue
        if status and re.search(r"마감$|^마감|접수마감", status):
            continue

        candidates.append(
            {
                "source": "contestkorea",
                "sourceId": str_no,
                "url": f"{CK_BASE}/sub/view.php?int_gbn=1&Txt_bcode={bcode}&str_no={str_no}",
                "title": title,
                "category": category,
                "organizer": organizer,
                "eligibility": eligibility,
                "datesText": dates_text,
                "dday": dday or None,
            }
        )
    return candidates


def parse_ck_detail(html: str) -> dict:
    og_image = meta_content(html, "og:image")
    og_description = meta_content(html, "og:description")

    def row_value(label_pattern: str) -> str:
        patterns = [
            rf"<th[^>]*>\s*{label_pattern}\s*</th>\s*<td[^>]*>([\s\S]{{0,300}}?)</td>",
            rf"<th[^>]*>[^<]*{label_pattern}[\s\S]{{0,60}}?</th>\s*<td[^>]*>([\s\S]{{0,300}}?)</td>",
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.I)
            if match:
                value = strip_tags(match.group(1))
                if value:
                    return value
        return ""

    period = parse_full_period(row_value("접수기간"))
    return {
        "image": og_image or None,
        "description": re.sub(r"\s+", " ", og_description).strip()[:400] if og_description else None,
        "startDate": period.get("startDate"),
        "deadline": period.get("deadline"),
        "organizer": row_value("주최[^<]*") or None,
        "eligibility": row_value("참가대상") or None,
        "category": row_value("대표분야") or None,
    }


# ---------- 위비티 ----------
WEVITY_BASE = "https://www.wevity.com"

_WEVITY_ROW_PATTERN = re.compile(
    r'<a href="[^"]*gbn=view[^"]*ix=(\d+)[^"]*">([\s\S]{0,400}?)</a>[\s\S]{0,600}?'
    r'<div class="organ">([\s\S]{0,200}?)</div>[\s\S]{0,400}?<div class="day">([\s\S]{0,300}?)</div>'
)

_WEVITY_SPECIAL_PATTERN = re.compile(
    r'<a href="[^"]*gbn=view[^"]*ix=(\d+)[^"]*"><img src="([^"]+)" alt="([^"]*)"[^>]*></a>\s*'
    r'<div class="hide-info">[\s\S]{0,200}?<div class="hide-dday">([^<]*)</div>[\s\S]{0,600}?'
    r'<div class="hide-cat">\s*([\s\S]{0,300}?)</div>'
)


def parse_wevity_list(html: str) -> list[dict]:
    candidates: dict[str, dict] = {}

    # 일반 목록(ms-list): 제목 링크·분야(sub-tit)·주최사(organ)·D-day·상태(dday span)
    for match in _WEVITY_ROW_PATTERN.finditer(html):
        ix = match.group(1) or ""
        anchor_html = match.group(2) or ""
        organizer = strip_tags(match.group(3) or "")
        day_html = match.group(4) or ""
        if not ix:
            continue
        status_match = re.search(r'<span class="dday[^"]*">([^<]*)</span>', day_html)
        status = strip_tags(status_match.group(1)) if status_match else ""
        if re.search(r"마감$", status):
            continue
        title = strip_tags(re.sub(r"<span[^>]*>[\s\S]*?</span>", "", anchor_html))
        start = match.start()
        cat_match = re.search(r'<div class="sub-tit">\s*분야\s*:\s*([\s\S]{0,200}?)</div>', html[start : start + 1600])
        categories = strip_tags(cat_match.group(1)) if cat_match else ""
        dday_match = re.search(r"D-(\d{1,3})", day_html)
        dday = dday_match.group(0) if dday_match else ""
        if not title:
            continue
        candidates[ix] = {
            "source": "wevity",
            "sourceId": ix,
            "url": f"{WEVITY_BASE}/?c=find&s=1&gbn=view&gp=1&ix={ix}",
            "title": title,
            "category": categories.split(",")[0].strip() if categories else "",
            "organizer": organizer,
            "eligibility": "",
            "datesText": "",
            "dday": dday or None,
        }

    # 스페셜 배너(hide-info): 이미지 alt=제목, hide-dday·hide-cat가 함께 나온다.
    for match in _WEVITY_SPECIAL_PATTERN.finditer(html):
        ix = match.group(1) or ""
        image = match.group(2) or ""
        title = strip_tags(match.group(3) or "")
        dday = strip_tags(match.group(4) or "")
        categories = strip_tags(match.group(5) or "")
        if not ix:
            continue
        existing = candidates.get(ix)
        if existing:
            # 일반 목록에 없던 이미지를 채워 준다.
            if not existing.get("image") and image:
                existing["image"] = image if image.startswith("http") else f"{WEVITY_BASE}{image}"
            continue
        if re.search(r"마감$", strip_tags(dday)):
            continue
        candidates[ix] = {
            "source": "wevity",
            "sourceId": ix,
            "url": f"{WEVITY_BASE}/?c=find&s=1&gbn=view&gp=1&ix={ix}",
            "title": title,
            "category": categories.split(",")[0].strip() if categories else "",
            "organizer": "",
            "eligibility": "",
            "datesText": "",
            "dday": dday or None,
            "image": image if image.startswith("http") else f"{WEVITY_BASE}{image}",
        }

    return list(candidates.values())


def parse_wevity_detail(html: str) -> dict:
    # 정보표: '분야', '응모대상', '주최/주관', '접수기간' 등이 dt/dd(또는 th/td)로 나온다.
    def row_value(label: str) -> str:
        patterns = [
            rf"<dt[^>]*>\s*{label}\s*</dt>\s*<dd[^>]*>([\s\S]{{0,300}}?)</dd>",
            rf"<th[^>]*>\s*{label}\s*</th>\s*<td[^>]*>([\s\S]{{0,300}}?)</td>",
            rf"{label}\s*</(?:dt|th|span|b)>\s*(?:<[^>]+>\s*)*([^<>]{{1,200}})",
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.I)
            if match:
                value = strip_tags(match.group(1))
                if value:
                    return value
        return ""

    period_text = row_value("접수기간")
    period = parse_full_period(period_text)

    # 대표 이미지: 업로드 디렉터리의 첫 이미지.
    image_match = re.search(
        r'<img[^>]+src="((?:https?://www\.wevity\.com)?/upload/[^"]+\.(?:jpg|jpeg|png|gif)[^"]*)"',
        html,
        re.I,
    )
    image_src = image_match.group(1) if image_match else ""
    image = (image_src if image_src.startswith("http") else f"{WEVITY_BASE}{image_src}") if image_src else None

    # 본문: '상세내용' 구간의 텍스트를 요약으로 쓴다.
    description = None
    body_index = html.find("상세내용")
    if body_index >= 0:
        body_html = html[body_index : body_index + 12000]
        trimmed = re.sub(r"^[\s\S]{0,200}?상세내용", "", body_html)
        text = strip_tags_keep_breaks(trimmed)
        text = re.sub(r"※ 본 내용은 참고 자료입니다[\s\S]*?확인하세요\.?", "", text).strip()
        if len(text) >= 40:
            description = re.sub(r"\s+", " ", text)[:400]

    return {
        "image": image,
        "description": description,
        "startDate": period.get("startDate"),
        "deadline": period.get("deadline"),
        "organizer": row_value("주최(?:/주관)?") or None,
        "eligibility": row_value("응모대상") or None,
        "category": row_value("분야") or None,
    }


# ---------- 항목 조립 ----------

def _build_description(contest: dict, scraped: str | None) -> str:
    scraped_text = (scraped or "").strip()
    if len(scraped_text) >= 40:
        return scraped_text
    start_text = f" {contest['startDate']}부터" if contest.get("startDate") else ""
    return (
        f"{contest['organizer'] or '주최 기관'} 주최 '{contest['title']}' 공모전입니다. "
        f"{contest['field']} 분야 대회로 참가 자격은 {contest['eligibility'] or '공고문 확인'}이며,"
        f"접수 기간은{start_text or ' 공고문 확인 후'} {contest['deadline']}까지입니다. "
        "주제 범위·총 상금·제출 양식 등 세부 요강은 공고문에서 확인해 주세요."
    )


def _build_apply_steps(contest: dict) -> list[str]:
    period = f"{contest['startDate']} ~ {contest['deadline']}" if contest.get("startDate") else contest["deadline"]
    return [
        "공고문에서 주제 범위, 제출 양식, 상금 등 공모 요강을 확인합니다.",
        "요강에 맞춰 작품 또는 참가 신청서를 준비합니다.",
        f"접수 기간({period}) 안에 공고문 안내 경로로 제출합니다.",
        "주최 측 심사를 거쳐 수상 작품이 발표되면 결과를 확인합니다.",
    ]


def build_contest(candidate: dict, contest_id: int, detail: dict | None) -> dict | None:
    start_date = detail.get("startDate") if detail else None
    deadline = detail.get("deadline") if detail else None

    # 상세에서 기간을 못 읽었으면 목록 정보로 복원한다.
    if not deadline:
        from_list = parse_short_period(candidate.get("datesText", ""), candidate.get("dday"))
        start_date = start_date or from_list.get("startDate")
        deadline = from_list.get("deadline")
    if not deadline:
        return None
    if deadline < today_iso():
        return None  # 이미 마감된 공모전은 등록하지 않는다

    organizer = re.sub(r"\s+", " ", (detail.get("organizer") if detail else None) or candidate.get("organizer") or "").strip()
    eligibility = ((detail.get("eligibility") if detail else None) or candidate.get("eligibility") or "").strip()
    # 위비티는 분야를 여러 개 나열하므로 첫 번째(대표) 분야만 매핑에 쓴다.
    raw_category = (detail.get("category") if detail else None) or candidate.get("category") or ""
    category = raw_category.split(",")[0].strip() if raw_category else ""
    bcode_match = re.search(r"Txt_bcode=(\d+)", candidate.get("url", "")) if candidate["source"] == "contestkorea" else None
    field = map_field(candidate["source"], category, bcode_match.group(1) if bcode_match else None)

    contest = {
        "id": contest_id,
        "source": candidate["source"],
        "sourceId": candidate["sourceId"],
        "title": candidate["title"],
        "organizer": organizer,
        "field": field,
        "deadline": deadline,
        "eligibility": eligibility,
        "ageGroups": derive_age_groups(eligibility),
        "image": (detail.get("image") if detail else None) or candidate.get("image") or "",
        "url": candidate["url"],
    }
    if start_date:
        contest["startDate"] = start_date
    contest["description"] = _build_description(contest, detail.get("description") if detail else None)
    contest["applySteps"] = _build_apply_steps(contest)
    return contest


# ---------- 목록 수집 ----------

def collect_contest_korea() -> list[dict]:
    all_items: dict[str, dict] = {}
    for page in range(1, MAX_PAGES + 1):
        try:
            html = fetch_html(f"{CK_BASE}/sub/list.php?int_gbn=1&displayrow=100&page={page}")
        except Exception as error:
            print(f"[contestSync] 콘테스트코리아 {page}페이지 수집 실패: {error}")
            break
        items = parse_ck_list(html)
        before = len(all_items)
        for item in items:
            all_items[item["sourceId"]] = item
        print(f"[contestSync] 콘테스트코리아 {page}페이지: {len(items)}건 (누적 {len(all_items)})")
        if len(all_items) == before or not items:
            break
        _sleep(REQUEST_DELAY_SEC)
    return list(all_items.values())


def collect_wevity() -> list[dict]:
    all_items: dict[str, dict] = {}
    for page in range(1, MAX_PAGES + 1):
        try:
            html = fetch_html(f"{WEVITY_BASE}/?c=find&s=1&gub=1&gp={page}")
        except Exception as error:
            print(f"[contestSync] 위비티 {page}페이지 수집 실패: {error}")
            break
        items = parse_wevity_list(html)
        before = len(all_items)
        for item in items:
            all_items[item["sourceId"]] = item
        print(f"[contestSync] 위비티 {page}페이지: {len(items)}건 (누적 {len(all_items)})")
        if len(all_items) == before or not items:
            break
        _sleep(REQUEST_DELAY_SEC)
    return list(all_items.values())


# ---------- 동기화 본체 ----------
_sync_lock = threading.Lock()
_sync_in_flight = False


def sync_contests(force: bool = False) -> dict:
    global _sync_in_flight
    with _sync_lock:
        if _sync_in_flight:
            return {"added": 0, "refreshed": 0, "pruned": 0, "skippedDetailFail": 0, "total": 0}
        # 재시작 직후 중복 실행 방지 — DB의 마지막 동기화 시각만 가볍게 읽는다.
        with get_pool().connection() as conn:
            gate_row = conn.execute(
                "SELECT last_sync, (SELECT count(*) FROM contests) FROM sync_state WHERE id = 1"
            ).fetchone()
        last_sync = gate_row[0] if gate_row else None
        total_now = int(gate_row[1]) if gate_row else 0
        if not force and last_sync is not None:
            if last_sync.tzinfo is None:
                last_sync = last_sync.replace(tzinfo=timezone.utc)
            elapsed = datetime.now(timezone.utc) - last_sync
            if elapsed.total_seconds() < SYNC_MIN_GAP_SEC:
                return {
                    "added": 0,
                    "refreshed": 0,
                    "pruned": 0,
                    "skippedDetailFail": 0,
                    "total": total_now,
                    "lastSync": iso_utc(last_sync),
                }
        _sync_in_flight = True
    try:
        return _run_sync()
    finally:
        with _sync_lock:
            _sync_in_flight = False


def _run_sync() -> dict:
    state = _load_state()
    try:
        ck_items = collect_contest_korea()
    except Exception as error:
        print(f"[contestSync] 콘테스트코리아 수집 실패: {error}")
        ck_items = []
    try:
        wevity_items = collect_wevity()
    except Exception as error:
        print("[contestSync] 위비티 수집 실패(이번 패스는 콘테스트코리아만 반영):", error)
        wevity_items = []
    candidates = ck_items + wevity_items

    added = 0
    refreshed = 0
    skipped_detail_fail = 0
    detail_fetches = 0

    contests_by_id = {contest["id"]: contest for contest in state["contests"]}
    for candidate in candidates:
        key = f"{candidate['source']}:{candidate['sourceId']}"
        known = state["registry"].get(key)
        existing = contests_by_id.get(known.get("id")) if known else None
        if existing:
            continue  # 이미 등록된 항목은 그대로 둔다
        if known and known.get("dead"):
            continue  # 마감·무효로 판정된 게시물은 상세를 다시 읽지 않는다

        # 신규이거나(unknown) 정리됐던 항목이 다시 보이는 경우(pruned) — 상세를 읽어 등록한다.
        # 한도를 넘은 신규 항목은 다음 동기화에서 처리된다.
        if detail_fetches >= DETAIL_FETCH_LIMIT:
            continue

        detail = None
        fetch_ok = False
        try:
            html = fetch_html(candidate["url"])
            detail = parse_ck_detail(html) if candidate["source"] == "contestkorea" else parse_wevity_detail(html)
            fetch_ok = True
        except Exception as error:
            print(f"[contestSync] 상세 수집 실패({key}): {error}")
            skipped_detail_fail += 1
            detail = None
        detail_fetches += 1
        _sleep(REQUEST_DELAY_SEC)

        # 읽었는데 등록 불가(이미 마감 등)면 dead로 기억해 다음 패스의 낭비를 막고,
        # 읽기 자체가 실패했으면 다음 동기화에 재시도한다.
        probe = build_contest(candidate, 0, detail)
        if probe is None:
            if fetch_ok:
                state["registry"][key] = {"id": 0, "dead": True}
            else:
                skipped_detail_fail += 1
            continue

        known_id = known.get("id", 0) if known else 0
        contest_id = known_id if known_id > 0 else state["nextId"]
        if not known_id > 0:
            state["nextId"] += 1
        contest = {**probe, "id": contest_id}
        state["registry"][key] = {"id": contest_id}
        state["contests"].append(contest)
        contests_by_id[contest_id] = contest
        if known and known.get("pruned"):
            refreshed += 1
        else:
            added += 1

    # 마감 뒤 일정 기간 지난 항목은 목록에서 치운다(id는 registry에 남아 재등록돼도 유지된다).
    prune_before = add_days_iso(today_iso(), -KEEP_PRUNED_DAYS)
    kept = []
    pruned = 0
    for contest in state["contests"]:
        if contest["deadline"] < prune_before:
            for key, entry in state["registry"].items():
                if entry.get("id") == contest["id"]:
                    state["registry"][key] = {**entry, "pruned": True}
            pruned += 1
        else:
            kept.append(contest)
    state["contests"] = kept
    state["lastSync"] = iso_now()
    _persist_state(state)

    summary = {
        "added": added,
        "refreshed": refreshed,
        "pruned": pruned,
        "skippedDetailFail": skipped_detail_fail,
        "total": len(kept),
    }
    if state.get("lastSync"):
        summary["lastSync"] = state["lastSync"]
    print(f"[contestSync] 동기화 완료 — 신규 {added}, 재등록 {refreshed}, 정리 {pruned}, 보관 {len(kept)}건")
    return summary


# ---------- 조회·스케줄러 ----------

def get_contests() -> list[dict]:
    with get_pool().connection() as conn:
        rows = conn.execute(f"SELECT {CONTEST_COLUMNS} FROM contests ORDER BY id ASC").fetchall()
    return [_to_contest(row) for row in rows]


_scheduler_started = False


def start_contest_sync_scheduler() -> None:
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True

    # 시작 직후 서버가 먼저 뜨도록 잠시 뒤 첫 동기화를 실행한다(강제 아님 — 최근에
    # 동기화했다면 건너뛴다). 이후 6시간마다 갱신한다.
    def first_sync():
        try:
            sync_contests()
        except Exception as error:
            print(f"[contestSync] 자동 동기화 실패: {error}")

    def loop():
        while True:
            try:
                sync_contests()
            except Exception as error:
                print(f"[contestSync] 주기 동기화 실패: {error}")
            time.sleep(SYNC_INTERVAL_SEC)

    timer = threading.Timer(3.0, first_sync)
    timer.daemon = True
    timer.start()
    worker = threading.Thread(target=loop, daemon=True)
    worker.start()
