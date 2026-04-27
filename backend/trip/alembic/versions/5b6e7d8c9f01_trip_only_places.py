"""Trip-only places

Revision ID: 5b6e7d8c9f01
Revises: e3a7b58c1f04
Create Date: 2026-04-27 14:05:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "5b6e7d8c9f01"
down_revision = "e3a7b58c1f04"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.add_column(sa.Column("trip_only", sa.Boolean(), nullable=True, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_column("trip_only")
