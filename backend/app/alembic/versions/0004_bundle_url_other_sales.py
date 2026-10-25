"""bundle link and money from other sales

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-25 22:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op


revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('bundle', schema=None) as batch_op:
        batch_op.add_column(sa.Column('url', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('other_sales_cents', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('bundle', schema=None) as batch_op:
        batch_op.drop_column('other_sales_cents')
        batch_op.drop_column('url')
