"""Database tables. See PLANNING.md §3 for the meaning of each field.

Conventions: money is stored as integer cents (`*_cents`), playtime as integer minutes,
ratings as half-stars (0–10). Derived values (costs, cost per hour, …) are never stored;
they are computed in `app.calc`.
"""

from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class CategoryType(StrEnum):
    platform = "platform"
    hardware_only = "hardware_only"


class CategoryIcon(StrEnum):
    """Sidebar icon of a category; stored as plain text so new icons need no migration."""

    pc = "pc"
    playstation = "playstation"
    ps4 = "ps4"
    ps5 = "ps5"
    nintendo = "nintendo"
    switch2 = "switch2"
    xbox = "xbox"
    xbox360 = "xbox360"
    xbox_one = "xbox_one"
    xbox_series = "xbox_series"
    handheld = "handheld"
    folder = "folder"


class ItemKind(StrEnum):
    game = "game"
    hardware = "hardware"


class GameStatus(StrEnum):
    wishlist = "wishlist"
    backlog = "backlog"
    playing = "playing"
    on_hold = "on_hold"
    played = "played"
    finished = "finished"
    abandoned = "abandoned"
    endless = "endless"


class CopyFormat(StrEnum):
    physical = "physical"
    digital = "digital"


class CopyCondition(StrEnum):
    new = "new"
    used = "used"


class SplitMode(StrEnum):
    proportional = "proportional"
    equal = "equal"
    manual = "manual"


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    type: CategoryType = CategoryType.platform
    break_even_cph: int | None = None
    # use_alter breaks the category ↔ item foreign key cycle for table creation order
    default_device_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("item.id", use_alter=True, name="fk_category_default_device", ondelete="SET NULL"),
        ),
    )
    sort_order: int = 0
    icon: str | None = None  # a CategoryIcon; None = folder

    items: list["Item"] = Relationship(
        back_populates="category",
        sa_relationship_kwargs={"foreign_keys": "Item.category_id"},
    )


class Item(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="category.id", index=True)
    kind: ItemKind
    name: str = Field(index=True)
    status: GameStatus | None = None  # games only
    started_on: date | None = None
    last_played_on: date | None = None
    rating: int | None = None  # half-stars 0–10, games only
    favorite: bool = False  # games only
    notes: str | None = None

    # metadata (games), filled from RAWG (rawg.io)
    rawg_id: int | None = None
    rawg_slug: str | None = None
    summary: str | None = None
    release_date: date | None = None
    genres: str | None = None
    developer: str | None = None
    cover_path: str | None = None
    steam_app_id: int | None = None
    ggdeals_slug: str | None = None
    target_price_cents: int | None = None
    deal_since: datetime | None = None
    image_path: str | None = None

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow, sa_column_kwargs={"onupdate": utcnow})

    category: Category = Relationship(
        back_populates="items",
        sa_relationship_kwargs={"foreign_keys": "Item.category_id"},
    )
    copies: list["Copy"] = Relationship(
        back_populates="item",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "Copy.buy_date"},
    )
    play_links: list["PlayLink"] = Relationship(
        back_populates="game",
        sa_relationship_kwargs={"foreign_keys": "PlayLink.game_id", "cascade": "all, delete-orphan"},
    )
    device_links: list["PlayLink"] = Relationship(
        back_populates="hardware",
        sa_relationship_kwargs={"foreign_keys": "PlayLink.hardware_id"},
    )
    dlcs: list["Dlc"] = Relationship(
        back_populates="game",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "Dlc.buy_date"},
    )
    completions: list["Completion"] = Relationship(
        back_populates="game",
        sa_relationship_kwargs={
            "foreign_keys": "Completion.item_id",
            "cascade": "all, delete-orphan",
            "order_by": "Completion.finished_on",
        },
    )


class Bundle(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    buy_date: date
    total_price_cents: int
    store: str | None = None
    split_mode: SplitMode = SplitMode.proportional
    sold_as_bundle: bool = False
    sell_date: date | None = None
    sell_total_cents: int | None = None
    notes: str | None = None

    copies: list["Copy"] = Relationship(
        back_populates="bundle",
        sa_relationship_kwargs={"order_by": "Copy.id"},
    )


class Copy(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    item_id: int = Field(foreign_key="item.id", index=True, ondelete="CASCADE")
    buy_date: date | None = None  # None = unknown (e.g. imported from a CSV without buy dates)
    buy_price_cents: int
    store: str | None = None
    format: CopyFormat = CopyFormat.physical
    condition: CopyCondition | None = None
    sell_price_cents: int | None = None  # set = sold
    sell_date: date | None = None
    note: str | None = None
    bundle_id: int | None = Field(default=None, foreign_key="bundle.id", index=True, ondelete="CASCADE")
    reference_price_cents: int | None = None

    item: Item = Relationship(back_populates="copies")
    bundle: Bundle | None = Relationship(back_populates="copies")

    @property
    def is_sold(self) -> bool:
        return self.sell_price_cents is not None


class PlayLink(SQLModel, table=True):
    game_id: int = Field(foreign_key="item.id", primary_key=True, ondelete="CASCADE")
    hardware_id: int = Field(foreign_key="item.id", primary_key=True, ondelete="CASCADE")
    emulated: bool = False
    minutes: int = 0
    last_played_at: datetime | None = None

    game: Item = Relationship(
        back_populates="play_links",
        sa_relationship_kwargs={"foreign_keys": "PlayLink.game_id"},
    )
    hardware: Item = Relationship(
        back_populates="device_links",
        sa_relationship_kwargs={"foreign_keys": "PlayLink.hardware_id"},
    )


class Dlc(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    game_id: int = Field(foreign_key="item.id", index=True, ondelete="CASCADE")
    name: str
    buy_date: date
    store: str | None = None
    price_cents: int
    steam_app_id: int | None = None
    rawg_id: int | None = None
    notes: str | None = None

    game: Item = Relationship(back_populates="dlcs")


class Completion(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    item_id: int = Field(foreign_key="item.id", index=True, ondelete="CASCADE")
    finished_on: date | None = None  # None = finished, date unknown (e.g. imported)
    started_on: date | None = None
    hardware_id: int | None = Field(default=None, foreign_key="item.id", ondelete="SET NULL")
    mastered: bool = False
    review: str | None = None
    note: str | None = None

    game: Item = Relationship(
        back_populates="completions",
        sa_relationship_kwargs={"foreign_keys": "Completion.item_id"},
    )
    hardware: Item | None = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Completion.hardware_id"},
    )
