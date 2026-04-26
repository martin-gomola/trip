"""category icon

Revision ID: f2a6c8d14b90
Revises: e0f2d4c9b7a1
Create Date: 2026-04-26 21:05:00.000000

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "f2a6c8d14b90"
down_revision = "e0f2d4c9b7a1"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("category", schema=None) as batch_op:
        batch_op.add_column(sa.Column("icon", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("category", schema=None) as batch_op:
        batch_op.drop_column("icon")
