"""metadata from RAWG instead of IGDB

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # IGDB was never used, so the ids are simply renamed (all still empty).
    with op.batch_alter_table("item", schema=None) as batch_op:
        batch_op.alter_column("igdb_id", new_column_name="rawg_id")
        batch_op.add_column(sa.Column("rawg_slug", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    with op.batch_alter_table("dlc", schema=None) as batch_op:
        batch_op.alter_column("igdb_id", new_column_name="rawg_id")


def downgrade() -> None:
    with op.batch_alter_table("dlc", schema=None) as batch_op:
        batch_op.alter_column("rawg_id", new_column_name="igdb_id")
    with op.batch_alter_table("item", schema=None) as batch_op:
        batch_op.drop_column("rawg_slug")
        batch_op.alter_column("rawg_id", new_column_name="igdb_id")
