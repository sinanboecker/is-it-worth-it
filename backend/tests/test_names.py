import pytest

from app.names import name_key


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("Marvel’s Spider-Man", "Marvel's Spider Man"),
        ("Little Nightmares II – Deluxe Edition", "little nightmares ii - deluxe edition"),
        ("Ratchet & Clank", "Ratchet and Clank"),
        ("DOOM™ Eternal", "Doom Eternal"),
        ("Pokémon Legends: Arceus", "Pokemon Legends Arceus"),
        ("  Hades  II ", "Hades II"),
    ],
)
def test_same_game(a, b):
    assert name_key(a) == name_key(b)


@pytest.mark.parametrize(("a", "b"), [("Hades", "Hades II"), ("Halo 2", "Halo 3"), ("Doom Eternal", "DoomEternal")])
def test_different_games(a, b):
    assert name_key(a) != name_key(b)
