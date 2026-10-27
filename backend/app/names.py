"""Comparing game names: one key for every import and lookup, so "Marvel’s Spider-Man", "Marvel's Spider-Man" and
"MARVEL'S SPIDER MAN" are the same game."""

import re
import unicodedata


def name_key(name: str) -> str:
    """Case, accents, ™/®/©, punctuation (’ ' – - : …) and extra spaces don't matter; "&" is "and"."""
    key = re.sub(r"[™®©]", "", name.casefold())  # before NFKD, which would turn ™ into "tm"
    key = key.replace("&", " and ")
    key = unicodedata.normalize("NFKD", key)
    key = "".join(ch for ch in key if not unicodedata.combining(ch))
    key = re.sub(r"[^\w\s]", " ", key)
    return re.sub(r"\s+", " ", key).strip()
