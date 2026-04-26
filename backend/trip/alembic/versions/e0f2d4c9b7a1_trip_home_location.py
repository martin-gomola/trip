"""trip home location

Revision ID: e0f2d4c9b7a1
Revises: 9b42c6a7f0d1
Create Date: 2026-04-26 20:45:00.000000

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "e0f2d4c9b7a1"
down_revision = "9b42c6a7f0d1"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("trip", schema=None) as batch_op:
        batch_op.add_column(sa.Column("home_name", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column("home_lat", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("home_lng", sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table("trip", schema=None) as batch_op:
        batch_op.drop_column("home_lng")
        batch_op.drop_column("home_lat")
        batch_op.drop_column("home_name")
