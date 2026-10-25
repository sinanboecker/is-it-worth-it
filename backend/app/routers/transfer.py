"""CSV game import per category, bundle import, JSON export and import/restore."""

import json
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError

from app import bundle_import, config, csv_import, json_io
from app.models import CopyFormat
from app.routers.deps import SessionDep, invalid, load_category, load_hardware

router = APIRouter(tags=["import & export"])

MAX_UPLOAD_BYTES = 200 * 1024 * 1024


async def _read_upload(file: UploadFile) -> bytes:
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise invalid("file too large")
    return content


# --- CSV --------------------------------------------------------------------------------------


@router.post("/categories/{category_id}/import-csv/preview", response_model=csv_import.ImportPreview)
async def csv_preview(
    category_id: int,
    session: SessionDep,
    file: Annotated[UploadFile, File(description="CSV file (; or , separated)")],
    hardware_id: Annotated[int | None, Form(description="device the hours are booked on")] = None,
    default_store: Annotated[str | None, Form()] = None,
    default_format: Annotated[CopyFormat, Form()] = CopyFormat.digital,
    mapping: Annotated[str | None, Form(description='JSON object, e.g. {"name": "Spiel", "notes": null}')] = None,
):
    """Parse the file and show what would be imported. Nothing is saved."""
    category = load_category(session, category_id)
    if hardware_id is not None:
        load_hardware(session, hardware_id)
    try:
        options = csv_import.ImportOptions(
            hardware_id=hardware_id,
            default_store=default_store or None,
            default_format=default_format,
            mapping=json.loads(mapping) if mapping else {},
        )
        return csv_import.preview(session, category, await _read_upload(file), options)
    except (ValueError, ValidationError) as e:
        raise invalid(str(e)) from e


class CsvCommit(BaseModel):
    rows: list[csv_import.ImportRow]


@router.post("/categories/{category_id}/import-csv/commit", response_model=csv_import.CommitResult)
def csv_commit(category_id: int, data: CsvCommit, session: SessionDep):
    """Import the (possibly edited) rows from the preview. All or nothing."""
    category = load_category(session, category_id)
    try:
        return csv_import.commit(session, category, data.rows)
    except csv_import.ImportError_ as e:
        raise invalid(e.problems) from e


# --- bundles ----------------------------------------------------------------------------------


async def _bundle_import_args(
    session: SessionDep,
    category_id: int,
    file: UploadFile,
    hardware_id: int | None,
    store: str | None,
    format: CopyFormat,
):
    category = load_category(session, category_id)
    if hardware_id is not None:
        load_hardware(session, hardware_id)
    options = bundle_import.BundleImportOptions(hardware_id=hardware_id, store=store or None, format=format)
    return category, await _read_upload(file), options


BundleFile = Annotated[UploadFile, File(description="CSV: a bundle row, its game rows, an empty row, the next bundle")]
CategoryForm = Annotated[int, Form(description="platform category of the games")]
DeviceForm = Annotated[int | None, Form(description="device the hours of new games are booked on")]


@router.post("/bundles/import/preview", response_model=bundle_import.BundleImportPreview)
async def bundle_import_preview(
    session: SessionDep,
    file: BundleFile,
    category_id: CategoryForm,
    hardware_id: DeviceForm = None,
    store: Annotated[str | None, Form()] = None,
    format: Annotated[CopyFormat, Form()] = CopyFormat.digital,
):
    """What importing the bundles would do. Nothing is saved."""
    category, data, options = await _bundle_import_args(session, category_id, file, hardware_id, store, format)
    try:
        return bundle_import.plan(session, category, data, options)
    except ValueError as e:
        raise invalid(str(e)) from e


@router.post("/bundles/import/commit", response_model=bundle_import.BundleImportResult)
async def bundle_import_commit(
    session: SessionDep,
    file: BundleFile,
    category_id: CategoryForm,
    hardware_id: DeviceForm = None,
    store: Annotated[str | None, Form()] = None,
    format: Annotated[CopyFormat, Form()] = CopyFormat.digital,
):
    """Import the bundles of the file (planned again, like the preview). All or nothing."""
    category, data, options = await _bundle_import_args(session, category_id, file, hardware_id, store, format)
    try:
        return bundle_import.commit(session, category, data, options)
    except bundle_import.BundleImportError as e:
        raise invalid(e.problems) from e
    except ValueError as e:
        raise invalid(str(e)) from e


@router.get("/import-csv/template", response_class=Response)
def csv_template():
    return Response(
        csv_import.template_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="is-it-worth-it-template.csv"'},
    )


# --- JSON -------------------------------------------------------------------------------------


@router.get("/export/json", response_class=Response)
def export_json(session: SessionDep, images: bool = False):
    stamp = date.today().isoformat()
    if images:
        content, media_type, extension = json_io.export_zip(session, config.DATA_DIR), "application/zip", "zip"
    else:
        content, media_type, extension = json_io.export_json(session), "application/json", "json"
    return Response(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="is-it-worth-it-{stamp}.{extension}"'},
    )


@router.post("/import/json")
async def import_json(
    session: SessionDep,
    file: Annotated[UploadFile, File(description=".json or .zip export")],
    mode: Literal["empty", "replace"] = "empty",
) -> dict[str, int]:
    """Restore an export. `empty` only works on a database without games/hardware; `replace` overwrites everything."""
    try:
        data, media = json_io.read_upload(await _read_upload(file))
        counts = json_io.import_data(session, data, mode)
    except json_io.JsonImportError as e:
        raise invalid(str(e)) from e
    json_io.write_media(config.DATA_DIR, media)
    return counts
