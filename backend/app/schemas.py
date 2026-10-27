"""Request/response models of the REST API.

API conventions: money in cents (`*_cents`), playtime in hours (float), ratings in stars (0–5, 0.5 steps).
Storage uses minutes and half-stars; the conversion happens here.
"""

from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app import calc
from app.models import (
    CategoryIcon,
    CategoryType,
    Completion,
    Copy,
    CopyCondition,
    CopyFormat,
    Dlc,
    GameStatus,
    Item,
    ItemKind,
    PcPartCategory,
    PlayLink,
    SplitMode,
)


def _check_stars(value: float | None) -> float | None:
    if value is not None and (not 0 <= value <= 5 or (value * 2) % 1 != 0):
        raise ValueError("rating must be between 0 and 5 in 0.5 steps")
    return value


Stars = Annotated[float, AfterValidator(_check_stars)]
Cents = Annotated[int, Field(ge=0)]
Hours = Annotated[float, Field(ge=0)]


def stars_to_half(stars: float | None) -> int | None:
    return None if stars is None else round(stars * 2)


def half_to_stars(half: int | None) -> float | None:
    return None if half is None else half / 2


def hours_to_minutes(hours: float) -> int:
    return round(hours * 60)


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- categories -------------------------------------------------------------------------------


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1)
    type: CategoryType = CategoryType.platform
    break_even_cph: int | None = Field(None, gt=0)
    default_device_id: int | None = None
    sort_order: int = 0
    icon: CategoryIcon | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    type: CategoryType | None = None
    break_even_cph: int | None = Field(None, gt=0)
    default_device_id: int | None = None
    sort_order: int | None = None
    icon: CategoryIcon | None = None  # null = folder


class CategoryRead(ApiModel):
    id: int
    name: str
    type: CategoryType
    break_even_cph: int | None
    default_device_id: int | None
    sort_order: int
    icon: CategoryIcon | None


# --- copies -----------------------------------------------------------------------------------


class CopyCreate(BaseModel):
    buy_date: date | None = None
    buy_price_cents: Cents
    store: str | None = None
    format: CopyFormat = CopyFormat.physical
    condition: CopyCondition | None = None
    sell_price_cents: Cents | None = None
    sell_date: date | None = None
    note: str | None = None


class CopyUpdate(BaseModel):
    buy_date: date | None = None
    buy_price_cents: Cents | None = None
    store: str | None = None
    format: CopyFormat | None = None
    condition: CopyCondition | None = None
    sell_price_cents: Cents | None = None
    sell_date: date | None = None
    note: str | None = None


class CopyRead(ApiModel):
    id: int
    buy_date: date | None
    buy_price_cents: int
    store: str | None
    format: CopyFormat
    condition: CopyCondition | None
    sell_price_cents: int | None
    sell_date: date | None
    note: str | None
    bundle_id: int | None
    reference_price_cents: int | None
    is_sold: bool
    days_owned: int | None = Field(description="None while the buy date is unknown")

    @classmethod
    def build(cls, copy: Copy, today: date) -> "CopyRead":
        days = ((copy.sell_date or today) - copy.buy_date).days if copy.buy_date else None
        return cls.model_validate({**copy.model_dump(), "is_sold": copy.is_sold, "days_owned": days})


class CopiesSummary(ApiModel):
    copies_count: int
    sold_copies: int
    owned_copies: int
    copies_paid_cents: int
    copies_received_cents: int
    first_bought_on: date | None
    sold: bool
    owned: bool
    formats: list[CopyFormat]
    stores: list[str]
    in_bundle: bool


# --- play links / hours -----------------------------------------------------------------------


class PlayLinkIn(BaseModel):
    hardware_id: int
    emulated: bool | None = None  # None = default from the device's category
    hours: Hours = 0


class PlayLinkRead(BaseModel):
    hardware_id: int
    hardware_name: str
    emulated: bool
    hours: float
    last_played_at: datetime | None

    @classmethod
    def build(cls, link: PlayLink) -> "PlayLinkRead":
        return cls(
            hardware_id=link.hardware_id,
            hardware_name=link.hardware.name,
            emulated=link.emulated,
            hours=calc.minutes_to_hours(link.minutes),
            last_played_at=link.last_played_at,
        )


class HoursAdd(BaseModel):
    hours: float = Field(gt=0)
    hardware_id: int | None = None  # None = device used last for this game
    played_on: date | None = None


# --- DLC --------------------------------------------------------------------------------------


class DlcCreate(BaseModel):
    name: str = Field(min_length=1)
    buy_date: date
    store: str | None = None
    price_cents: Cents
    steam_app_id: int | None = None
    rawg_id: int | None = None
    notes: str | None = None


class DlcUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    buy_date: date | None = None
    store: str | None = None
    price_cents: Cents | None = None
    steam_app_id: int | None = None
    rawg_id: int | None = None
    notes: str | None = None


class DlcRead(ApiModel):
    id: int
    name: str
    buy_date: date
    store: str | None
    price_cents: int
    steam_app_id: int | None
    rawg_id: int | None
    notes: str | None

    @classmethod
    def build(cls, dlc: Dlc) -> "DlcRead":
        return cls.model_validate(dlc)


# --- completions ------------------------------------------------------------------------------


class CompletionCreate(BaseModel):
    finished_on: date | None  # null = date unknown
    started_on: date | None = None
    hardware_id: int | None = None
    mastered: bool = False
    review: str | None = None
    note: str | None = None


class CompletionUpdate(BaseModel):
    finished_on: date | None = None
    started_on: date | None = None
    hardware_id: int | None = None
    mastered: bool | None = None
    review: str | None = None
    note: str | None = None


class CompletionRead(BaseModel):
    id: int
    finished_on: date | None
    started_on: date | None
    hardware_id: int | None
    hardware_name: str | None
    mastered: bool
    review: str | None
    note: str | None

    @classmethod
    def build(cls, c: Completion) -> "CompletionRead":
        return cls(
            id=c.id,
            finished_on=c.finished_on,
            started_on=c.started_on,
            hardware_id=c.hardware_id,
            hardware_name=c.hardware.name if c.hardware else None,
            mastered=c.mastered,
            review=c.review,
            note=c.note,
        )


# --- items ------------------------------------------------------------------------------------


class ItemCreate(BaseModel):
    category_id: int
    kind: ItemKind
    name: str = Field(min_length=1)
    status: GameStatus | None = None  # games: default backlog with a first copy, else wishlist
    rating: Stars | None = None
    notes: str | None = None
    steam_app_id: int | None = None
    ggdeals_slug: str | None = None
    target_price_cents: Cents | None = None
    first_copy: CopyCreate | None = None


class ItemUpdate(BaseModel):
    category_id: int | None = None
    name: str | None = Field(None, min_length=1)
    status: GameStatus | None = None
    finished_on: date | None = None  # used when setting status "finished" on a game without completions
    rating: Stars | None = None
    favorite: bool | None = None
    notes: str | None = None
    started_on: date | None = None
    last_played_on: date | None = None
    rawg_id: int | None = None
    summary: str | None = None
    release_date: date | None = None
    genres: str | None = None
    developer: str | None = None
    steam_app_id: int | None = None
    ggdeals_slug: str | None = None
    target_price_cents: Cents | None = None


class ValueRead(BaseModel):
    hours: float
    net_cost_cents: int
    cost_per_hour_cents: int | None
    worth_it: bool
    hours_to_break_even: float
    threshold_cph: int
    dlc_cost_cents: int
    total_paid_cents: int
    times_finished: int
    last_finished_on: date | None
    games_played_on: int
    emulated_games: int

    @classmethod
    def build(cls, value: calc.Value | None) -> "ValueRead | None":
        if value is None:
            return None
        return cls(hours=value.hours, **{k: v for k, v in vars(value).items() if k != "minutes"})


class ItemSummary(BaseModel):
    id: int
    category_id: int
    kind: ItemKind
    name: str
    status: GameStatus | None
    rating: float | None
    favorite: bool
    started_on: date | None
    last_played_on: date | None
    cover_path: str | None
    image_path: str | None
    target_price_cents: int | None
    copies_summary: CopiesSummary
    devices: list[PlayLinkRead]
    value: ValueRead | None

    @classmethod
    def fields_for(cls, item: Item, global_break_even_cph: int) -> dict:
        stats = calc.copy_stats(item.copies)
        return {
            "id": item.id,
            "category_id": item.category_id,
            "kind": item.kind,
            "name": item.name,
            "status": item.status,
            "rating": half_to_stars(item.rating),
            "favorite": item.favorite,
            "started_on": item.started_on,
            "last_played_on": item.last_played_on,
            "cover_path": item.cover_path,
            "image_path": item.image_path,
            "target_price_cents": item.target_price_cents,
            "copies_summary": CopiesSummary(
                **vars(stats),
                formats=sorted({c.format for c in item.copies}),
                stores=sorted({c.store for c in item.copies if c.store}),
                in_bundle=any(c.bundle_id for c in item.copies),
            ),
            "devices": [PlayLinkRead.build(link) for link in item.play_links],
            "value": ValueRead.build(calc.item_value(item, global_break_even_cph)),
        }

    @classmethod
    def build(cls, item: Item, global_break_even_cph: int) -> "ItemSummary":
        return cls(**cls.fields_for(item, global_break_even_cph))


class ItemRead(ItemSummary):
    notes: str | None
    rawg_id: int | None
    rawg_slug: str | None
    summary: str | None
    release_date: date | None
    genres: str | None
    developer: str | None
    steam_app_id: int | None
    ggdeals_slug: str | None
    deal_since: datetime | None
    created_at: datetime
    updated_at: datetime
    copies: list[CopyRead]
    dlcs: list[DlcRead]
    completions: list[CompletionRead]
    played_games: list[PlayLinkRead] = []  # hardware only: games played on this device (hardware_name = game name)

    @classmethod
    def build(cls, item: Item, global_break_even_cph: int, today: date | None = None) -> "ItemRead":
        today = today or date.today()
        played = [
            PlayLinkRead(
                hardware_id=link.game_id,
                hardware_name=link.game.name,
                emulated=link.emulated,
                hours=calc.minutes_to_hours(link.minutes),
                last_played_at=link.last_played_at,
            )
            for link in item.device_links
        ]
        return cls(
            **cls.fields_for(item, global_break_even_cph),
            notes=item.notes,
            rawg_id=item.rawg_id,
            rawg_slug=item.rawg_slug,
            summary=item.summary,
            release_date=item.release_date,
            genres=item.genres,
            developer=item.developer,
            steam_app_id=item.steam_app_id,
            ggdeals_slug=item.ggdeals_slug,
            deal_since=item.deal_since,
            created_at=item.created_at,
            updated_at=item.updated_at,
            copies=[CopyRead.build(c, today) for c in item.copies],
            dlcs=[DlcRead.build(d) for d in item.dlcs],
            completions=[CompletionRead.build(c) for c in item.completions],
            played_games=played,
        )


class HoursResult(BaseModel):
    item: ItemRead
    suggested_status: GameStatus | None


# --- bundles ----------------------------------------------------------------------------------


class NewBundleItem(BaseModel):
    category_id: int
    kind: ItemKind
    name: str = Field(min_length=1)


class BundleEntryIn(BaseModel):
    item_id: int | None = None
    new_item: NewBundleItem | None = None
    reference_price_cents: Cents | None = None
    buy_price_cents: Cents | None = None  # only for split mode "manual"
    format: CopyFormat = CopyFormat.physical
    condition: CopyCondition | None = None
    note: str | None = None

    @model_validator(mode="after")
    def _one_target(self):
        if (self.item_id is None) == (self.new_item is None):
            raise ValueError("give either item_id or new_item")
        return self


HttpUrl = Annotated[str, Field(pattern=r"^https?://\S+$", max_length=2000)]


class BundleCreate(BaseModel):
    name: str = Field(min_length=1)
    buy_date: date
    total_price_cents: Cents
    url: HttpUrl | None = None
    other_sales_cents: Cents = 0
    store: str | None = None
    split_mode: SplitMode | None = None  # None = default from settings
    notes: str | None = None
    entries: list[BundleEntryIn] = []  # may be empty, e.g. when all games of the bundle were sold


class BundleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    buy_date: date | None = None
    total_price_cents: Cents | None = None
    url: HttpUrl | None = None
    other_sales_cents: Cents | None = None
    store: str | None = None
    split_mode: SplitMode | None = None
    sold_as_bundle: bool | None = None
    sell_date: date | None = None
    sell_total_cents: Cents | None = None
    notes: str | None = None
    reference_prices: dict[int, Cents] | None = None  # copy_id → standalone value
    manual_shares: dict[int, Cents] | None = None  # copy_id → buy price (split mode "manual")


class BundleCopyRead(BaseModel):
    copy_id: int
    item_id: int
    item_name: str
    kind: ItemKind
    reference_price_cents: int | None
    buy_price_cents: int
    sell_price_cents: int | None
    sell_date: date | None
    status: GameStatus | None
    cover_path: str | None
    image_path: str | None
    value: ValueRead | None = Field(description="the whole game or device, not only this copy")


class BundleRead(BaseModel):
    id: int
    name: str
    buy_date: date
    total_price_cents: int
    url: str | None
    other_sales_cents: int
    store: str | None
    split_mode: SplitMode
    sold_as_bundle: bool
    sell_date: date | None
    sell_total_cents: int | None
    notes: str | None
    copies: list[BundleCopyRead]
    sold_cents: int = Field(description="what the bundle's copies and untracked parts were sold for so far")
    value: ValueRead = Field(description="the bundle as one purchase; hours are those of its games")


class SplitPreviewIn(BaseModel):
    total_price_cents: Cents
    split_mode: SplitMode
    reference_prices: list[Cents | None] | None = None
    manual_shares: list[Cents | None] | None = None
    count: int | None = Field(None, gt=0)


class SplitPreviewOut(BaseModel):
    shares_cents: list[int]


# --- PC builds & parts ------------------------------------------------------------------------


class PcPartCreate(BaseModel):
    name: str = Field(min_length=1)
    category: PcPartCategory = PcPartCategory.other
    build_id: int | None = Field(None, description="ignored for a sold part: sold parts aren't in a build")
    buy_date: date
    used_until: date | None = None  # empty = still in use
    buy_price_cents: Cents
    sell_price_cents: Cents | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _dates_in_order(self):
        if self.used_until is not None and self.used_until < self.buy_date:
            raise ValueError("'used until' is before the buy date")
        return self


class PcPartUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    category: PcPartCategory | None = None
    build_id: int | None = None
    buy_date: date | None = None
    used_until: date | None = None
    buy_price_cents: Cents | None = None
    sell_price_cents: Cents | None = None
    notes: str | None = None


class PcPartRead(BaseModel):
    id: int
    name: str
    category: PcPartCategory
    build_id: int | None
    build_name: str | None
    buy_date: date
    used_until: date | None
    buy_price_cents: int
    sell_price_cents: int | None
    notes: str | None
    in_use: bool
    used_days: int = Field(description="from the buy date until 'used until', or today while in use")
    used_years: float
    net_cost_cents: int = Field(description="buy price minus sell price")
    cost_per_day_cents: int | None = Field(description="net cost per used day; null for less than a day")


class PcBuildCreate(BaseModel):
    name: str = Field(min_length=1)
    hardware_id: int | None = None
    notes: str | None = None


class PcBuildUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    hardware_id: int | None = None
    notes: str | None = None


class PcBuildRead(BaseModel):
    id: int
    name: str
    hardware_id: int | None
    hardware_name: str | None
    notes: str | None
    parts: list[PcPartRead] = Field(description="its parts; sold parts aren't in a build")
    buy_price_cents: int
    first_bought_on: date | None
    used_until: date | None = Field(description="when the last part went out of use; null while a part is in use")
    in_use: bool
    hours: float | None = Field(description="game hours of the linked device")
    cost_per_hour_cents: int | None = Field(description="buy price of the parts per game hour")
