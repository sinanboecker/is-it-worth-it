"""Reading cells of spreadsheet exports (CSV): text encoding, delimiter, money, dates, hours, ✓ marks.

Shared by the imports (games, bundles, finish dates). German and English spellings are understood: "59,99 €",
"1.299", "17.09.2026", "12:30" (hours), "✓"/"ja"/"x".
"""

import re
import unicodedata
from datetime import date, datetime

TRUE_MARKS = {"✓", "✔", "☑", "✅", "x", "ja", "j", "yes", "y", "true", "wahr", "1"}
FALSE_MARKS = {"", "nein", "n", "no", "false", "falsch", "0", "-"}


def norm(text: str) -> str:
    """For comparing headers and cell values: lower case ASCII words ("Kaufdatum ", "kaufdatum" → "kaufdatum")."""
    text = text.strip().lower().replace("ß", "ss")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def decode(data: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding), "utf-8" if encoding == "utf-8-sig" else encoding
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1"), "latin-1"


def sniff_delimiter(text: str) -> str:
    first_line = text.splitlines()[0] if text else ""
    return max([";", ",", "\t"], key=first_line.count)


def parse_money(raw: str) -> int | None:
    text = raw.replace("€", "").replace("EUR", "").replace("eur", "")
    has_currency = text != raw
    text = re.sub(r"[\s  ']", "", text)
    if text == "-" and has_currency:
        return 0  # spreadsheet accounting format shows 0 € as " - € "
    if not text or text == "-":
        return None
    if "," in text and "." in text:
        decimal = "," if text.rfind(",") > text.rfind(".") else "."
        thousands = "." if decimal == "," else ","
        text = text.replace(thousands, "").replace(decimal, ".")
    elif "," in text:
        text = text.replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", text):
        text = text.replace(".", "")  # German thousands separator, e.g. "1.299"
    try:
        value = round(float(text) * 100)
    except ValueError as e:
        raise ValueError(f"unreadable price {raw.strip()!r}") from e
    if value < 0:
        raise ValueError(f"negative price {raw.strip()!r}")
    return value


DATE_FORMATS = ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y")


def parse_date(raw: str) -> date | None:
    text = raw.strip()
    if not text:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"unreadable date {text!r}")


def parse_hours(raw: str) -> float:
    text = raw.strip().lower().removesuffix("h").strip().replace(",", ".")
    if not text or text == "-":
        return 0.0
    if ":" in text:  # 12:30 = 12.5 h
        hours, _, minutes = text.partition(":")
        try:
            return int(hours) + int(minutes) / 60
        except ValueError as e:
            raise ValueError(f"unreadable playtime {raw.strip()!r}") from e
    try:
        value = float(text)
    except ValueError as e:
        raise ValueError(f"unreadable playtime {raw.strip()!r}") from e
    if value < 0:
        raise ValueError(f"negative playtime {raw.strip()!r}")
    return value


def parse_finished(raw: str) -> tuple[bool, date | None]:
    text = raw.strip()
    if text.lower() in FALSE_MARKS:
        return False, None
    if text.lower() in TRUE_MARKS:
        return True, None
    try:
        return True, parse_date(text)
    except ValueError as e:
        raise ValueError(f"unreadable 'finished' value {text!r} (use ✓, x, ja or a date)") from e


def parse_rating(raw: str) -> float | None:
    text = raw.strip().replace(",", ".").replace("★", "").strip()
    if not text:
        return None
    try:
        value = float(text)
    except ValueError as e:
        raise ValueError(f"unreadable rating {raw.strip()!r}") from e
    if not 0 <= value <= 5 or (value * 2) % 1:
        raise ValueError(f"rating {raw.strip()!r} must be 0–5 in 0.5 steps")
    return value
