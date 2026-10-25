from datetime import date

import pytest

from app import csv_import as ci


@pytest.mark.parametrize(
    ("raw", "cents"),
    [
        (" 13,47 € ", 1347),
        ("13,47", 1347),
        ("13.47", 1347),
        ("1.234,56 €", 123456),
        ("1,234.56", 123456),
        ("1.299", 129900),
        ("€ 5", 500),
        ("59,99 EUR", 5999),
        ("0", 0),
        ("1 299,00 €", 129900),
        ("", None),
        ("  ", None),
        ("-", None),
    ],
)
def test_parse_money(raw, cents):
    assert ci.parse_money(raw) == cents


@pytest.mark.parametrize("raw", ["abc", "12,3,4", "-5,00"])
def test_parse_money_errors(raw):
    with pytest.raises(ValueError):
        ci.parse_money(raw)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("17.09.2026", date(2026, 9, 17)), ("1.2.25", date(2025, 2, 1)), ("2024-12-31", date(2024, 12, 31)),
     ("31/12/2024", date(2024, 12, 31)), ("", None)],
)  # fmt: skip
def test_parse_date(raw, expected):
    assert ci.parse_date(raw) == expected


def test_parse_date_error():
    with pytest.raises(ValueError, match="unreadable date"):
        ci.parse_date("31.02.2024")


@pytest.mark.parametrize(
    ("raw", "hours"), [("10,5", 10.5), ("6", 6.0), ("12:30", 12.5), ("3h", 3.0), ("", 0.0), ("-", 0.0)]
)
def test_parse_hours(raw, hours):
    assert ci.parse_hours(raw) == hours


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("✓", (True, None)), ("x", (True, None)), ("Ja", (True, None)), ("", (False, None)), ("nein", (False, None)),
     ("03.05.2024", (True, date(2024, 5, 3)))],
)  # fmt: skip
def test_parse_finished(raw, expected):
    assert ci.parse_finished(raw) == expected


def test_parse_rating():
    assert ci.parse_rating("4,5") == 4.5
    assert ci.parse_rating("") is None
    with pytest.raises(ValueError):
        ci.parse_rating("4,3")


def test_decode_and_sniff():
    text, encoding = ci.decode("Spiel,Preis\nÜber,5\n".encode("cp1252"))
    assert (encoding, text.splitlines()[1]) == ("cp1252", "Über,5")
    text, encoding = ci.decode(b"\xef\xbb\xbfSpiel;Preis")  # UTF-8 BOM
    assert (encoding, text) == ("utf-8", "Spiel;Preis")
    assert ci.sniff_delimiter("a;b;c\n1,5;2;3") == ";"
    assert ci.sniff_delimiter("a,b,c") == ","
    assert ci.sniff_delimiter("a\tb") == "\t"


def test_auto_mapping_german_and_english():
    headers = [
        "Spiel",
        "Kaufdatum",
        "Preis",
        "Spielzeit",
        "Stundenpreis",
        "Kommentar",
        "Durchgespielt",
        "Verkaufspreis",
    ]
    mapping = ci.auto_mapping(headers)
    assert mapping == {"name": 0, "buy_date": 1, "buy_price": 2, "hours": 3, "notes": 5, "finished": 6, "sell_price": 7}
    english = ci.auto_mapping(["Title", "Purchase date", "Price", "Hours played", "Store", "Condition", "Sold for"])
    assert set(english) == {"name", "buy_date", "buy_price", "hours", "store", "condition", "sell_price"}
