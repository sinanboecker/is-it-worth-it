"""Game metadata from RAWG, cover images and own uploads, DLC suggestions (PLANNING.md §5b)."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import media, rawg, steam_store
from app.models import Item, ItemKind
from app.names import name_key
from app.routers.deps import SessionDep, SettingsDep, TodayDep, load_game, load_item
from app.routers.items import read_item
from app.schemas import ItemRead

router = APIRouter(tags=["metadata"])


def _rawg_call(func, *args):
    try:
        return func(*args)
    except rawg.RawgError as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e


class MetadataStatus(BaseModel):
    rawg: bool = Field(description="RAWG API key configured")


class CandidateOut(BaseModel):
    rawg_id: int
    slug: str
    name: str
    released: date | None
    platforms: list[str]
    image_url: str | None


def _out(c: rawg.Candidate) -> CandidateOut:
    return CandidateOut(**vars(c))


@router.get("/metadata/status", response_model=MetadataStatus)
def status():
    return MetadataStatus(rawg=rawg.configured())


@router.get("/metadata/search", response_model=list[CandidateOut])
def search(q: Annotated[str, Query(min_length=1)]):
    return [_out(c) for c in _rawg_call(rawg.search, q)]


def apply_metadata(session: Session, game: Item, rawg_id: int, rename: bool = False) -> None:
    """Fill the game's metadata from RAWG and store its image (replacing an older RAWG image)."""
    info = _rawg_call(rawg.details, rawg_id)
    steam_id = _rawg_call(rawg.steam_app_id, rawg_id)
    cover = None
    if info.image_url:
        try:
            cover = media.save_image(media.download(info.image_url), "covers", f"{game.id}")
        except media.MediaError:
            cover = None  # metadata without image is still useful
    if cover:
        if game.cover_path != cover:
            media.delete(game.cover_path)
        game.cover_path = cover
    game.rawg_id = info.rawg_id
    game.rawg_slug = info.slug
    game.summary = info.description
    game.release_date = info.released
    game.genres = info.genres
    game.developer = info.developers
    if steam_id is not None:
        game.steam_app_id = steam_id
    if rename and info.name:
        game.name = info.name


class ApplyMetadata(BaseModel):
    rawg_id: int
    rename: bool = Field(False, description="also take the name from RAWG")


@router.post("/items/{item_id}/metadata", response_model=ItemRead)
def set_metadata(item_id: int, data: ApplyMetadata, session: SessionDep, settings: SettingsDep, today: TodayDep):
    game = load_game(session, item_id)
    apply_metadata(session, game, data.rawg_id, data.rename)
    session.commit()
    return read_item(session, item_id, settings, today)


@router.delete("/items/{item_id}/metadata", response_model=ItemRead)
def clear_metadata(item_id: int, session: SessionDep, settings: SettingsDep, today: TodayDep):
    """Unlink from RAWG (wrong match): removes RAWG data and image. Steam app ID and own image stay."""
    game = load_game(session, item_id)
    media.delete(game.cover_path)
    game.cover_path = game.rawg_id = game.rawg_slug = None
    game.summary = game.release_date = game.genres = game.developer = None
    session.commit()
    return read_item(session, item_id, settings, today)


# --- bulk matching ----------------------------------------------------------------------------


class FetchMissing(BaseModel):
    category_id: int | None = None
    limit: int = Field(8, ge=1, le=50, description="games per call; call again until `remaining` is 0")
    skip: list[int] = Field([], description="games already shown for review in this run")


class AppliedMatch(BaseModel):
    item_id: int
    name: str
    rawg_name: str


class ReviewItem(BaseModel):
    item_id: int
    name: str
    candidates: list[CandidateOut]


class FetchMissingResult(BaseModel):
    applied: list[AppliedMatch]
    review: list[ReviewItem]
    remaining: int


@router.post("/metadata/fetch-missing", response_model=FetchMissingResult)
def fetch_missing(data: FetchMissing, session: SessionDep):
    """Match games without metadata: confident matches are applied, the rest is returned for review."""
    if not rawg.configured():
        raise HTTPException(status_code=503, detail="RAWG is not set up: add RAWG_API_KEY to the server's environment")
    query = select(Item).where(Item.kind == ItemKind.game, Item.rawg_id.is_(None)).order_by(Item.id)
    if data.category_id is not None:
        query = query.where(Item.category_id == data.category_id)
    todo = [g for g in session.exec(query) if g.id not in data.skip]

    result = FetchMissingResult(applied=[], review=[], remaining=max(0, len(todo) - data.limit))
    for game in todo[: data.limit]:
        candidates = _rawg_call(rawg.search, game.name)
        match = rawg.best_match(game.name, candidates)
        if match is None:
            result.review.append(
                ReviewItem(item_id=game.id, name=game.name, candidates=[_out(c) for c in candidates[:6]])
            )
            continue
        apply_metadata(session, game, match.rawg_id)
        session.commit()
        result.applied.append(AppliedMatch(item_id=game.id, name=game.name, rawg_name=match.name))
    return result


# --- images -----------------------------------------------------------------------------------


@router.post("/items/{item_id}/image", response_model=ItemRead)
async def upload_image(
    item_id: int,
    session: SessionDep,
    settings: SettingsDep,
    today: TodayDep,
    file: Annotated[UploadFile, File(description="JPEG, PNG, WebP, …")],
):
    """Own image for a game or device; shown instead of the RAWG image."""
    item = load_item(session, item_id)
    try:
        path = media.save_image(await file.read(media.MAX_BYTES + 1), "uploads", f"{item.id}")
    except media.MediaError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    if item.image_path != path:
        media.delete(item.image_path)
    item.image_path = path
    session.commit()
    return read_item(session, item_id, settings, today)


@router.delete("/items/{item_id}/image", response_model=ItemRead)
def delete_image(item_id: int, session: SessionDep, settings: SettingsDep, today: TodayDep):
    item = load_item(session, item_id)
    media.delete(item.image_path)
    item.image_path = None
    session.commit()
    return read_item(session, item_id, settings, today)


@router.get("/media/{path:path}", include_in_schema=False)
def get_media(path: str):
    file = media.resolve(path)
    if file is None or not file.is_file():
        raise HTTPException(status_code=404, detail="image not found")
    # file names contain a content hash, so they never change
    return FileResponse(file, headers={"Cache-Control": "public, max-age=31536000, immutable"})


# --- DLC suggestions --------------------------------------------------------------------------


class DlcSuggestion(BaseModel):
    name: str
    source: Literal["steam", "rawg"]
    steam_app_id: int | None = None
    rawg_id: int | None = None
    price_cents: int | None = Field(None, description="current Steam price (Steam suggestions only)")
    currency: str | None = None
    owned: bool = False


@router.get("/items/{item_id}/dlc/available", response_model=list[DlcSuggestion])
def available_dlc(item_id: int, session: SessionDep, settings: SettingsDep, q: str | None = None):
    """Steam DLC with current prices if the game is on Steam, otherwise DLC names from RAWG."""
    game = load_game(session, item_id)
    suggestions: list[DlcSuggestion] = []
    if game.steam_app_id:
        suggestions = [
            DlcSuggestion(
                name=d.name, source="steam", steam_app_id=d.steam_app_id, price_cents=d.price_cents, currency=d.currency
            )
            for d in steam_store.dlc_list(game.steam_app_id, settings.ggdeals_region)
        ]
    if not suggestions and game.rawg_id and rawg.configured():
        suggestions = [
            DlcSuggestion(name=a.name, source="rawg", rawg_id=a.rawg_id)
            for a in _rawg_call(rawg.additions, game.rawg_id)
        ]
    owned_names = {name_key(d.name) for d in game.dlcs}
    owned_steam = {d.steam_app_id for d in game.dlcs if d.steam_app_id}
    owned_rawg = {d.rawg_id for d in game.dlcs if d.rawg_id}
    for s in suggestions:
        s.owned = (
            name_key(s.name) in owned_names
            or (s.steam_app_id is not None and s.steam_app_id in owned_steam)
            or (s.rawg_id is not None and s.rawg_id in owned_rawg)
        )
    if q:
        needle = name_key(q)
        suggestions = [s for s in suggestions if needle in name_key(s.name)]
    return suggestions
