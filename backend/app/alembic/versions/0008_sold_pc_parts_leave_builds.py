"""sold pc parts leave their build

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-27 16:00:00.000000
"""

from collections.abc import Sequence

from alembic import op


revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE pcpart SET build_id = NULL WHERE sell_price_cents IS NOT NULL")


def downgrade() -> None:
    pass  # which build a sold part was in isn't known any more
