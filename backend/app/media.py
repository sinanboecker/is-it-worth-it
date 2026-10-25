"""Images stored in the data folder: `covers/` (from RAWG) and `uploads/` (own images).

Images are re-encoded (validates them, strips metadata) and shrunk to a sensible size.
"""

import hashlib
import io
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError

from app import config, http

FOLDERS = ("covers", "uploads")
MAX_BYTES = 20 * 1024 * 1024
MAX_SIZE = (1280, 1280)


class MediaError(ValueError):
    pass


def resolve(relative: str) -> Path | None:
    """Absolute path of a stored image, or None if the path is outside the media folders."""
    root = config.DATA_DIR.resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or path.relative_to(root).parts[:1] not in [(f,) for f in FOLDERS]:
        return None
    return path


def save_image(content: bytes, folder: str, stem: str) -> str:
    """Store an image as JPEG; returns the path relative to the data folder (e.g. "covers/12-ab12cd34.jpg")."""
    if folder not in FOLDERS:
        raise ValueError(folder)
    if len(content) > MAX_BYTES:
        raise MediaError("image too large (max. 20 MB)")
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            image = image.convert("RGB")
            image.thumbnail(MAX_SIZE)
            out = io.BytesIO()
            image.save(out, "JPEG", quality=85, optimize=True)
    except (UnidentifiedImageError, OSError) as e:
        raise MediaError("not a readable image file") from e
    data = out.getvalue()
    relative = f"{folder}/{stem}-{hashlib.sha256(data).hexdigest()[:10]}.jpg"
    target = config.DATA_DIR / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return relative


def download(url: str) -> bytes:
    try:
        with http.client() as client, client.stream("GET", url) as response:
            response.raise_for_status()
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise MediaError("image too large (max. 20 MB)")
                chunks.append(chunk)
    except httpx.HTTPError as e:
        raise MediaError(f"image download failed: {e.__class__.__name__}") from e
    return b"".join(chunks)


def delete(relative: str | None) -> None:
    if relative and (path := resolve(relative)) is not None:
        path.unlink(missing_ok=True)
