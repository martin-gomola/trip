"""place google maps url

Revision ID: 8d3f0b8e9c2a
Revises: 49c47b1b8d0f
Create Date: 2026-04-26 19:12:00.000000

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "8d3f0b8e9c2a"
down_revision = "49c47b1b8d0f"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.add_column(sa.Column("google_maps_url", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_column("google_maps_url")
