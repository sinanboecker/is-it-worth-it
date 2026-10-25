"""copy buy date optional (unknown)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-25 20:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('copy', schema=None) as batch_op:
        batch_op.alter_column('buy_date', existing_type=sa.Date(), nullable=True)


def downgrade() -> None:
    # unknown buy dates can't be kept in a NOT NULL column; fall back to the day of the downgrade
    op.execute("UPDATE copy SET buy_date = CURRENT_DATE WHERE buy_date IS NULL")
    with op.batch_alter_table('copy', schema=None) as batch_op:
        batch_op.alter_column('buy_date', existing_type=sa.Date(), nullable=False)
