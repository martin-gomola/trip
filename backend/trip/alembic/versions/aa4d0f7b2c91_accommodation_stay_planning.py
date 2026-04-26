"""accommodation stay planning

Revision ID: aa4d0f7b2c91
Revises: f2a6c8d14b90
Create Date: 2026-04-26 22:05:00.000000

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "aa4d0f7b2c91"
down_revision = "f2a6c8d14b90"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.add_column(sa.Column("checkin_time", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column("checkout_time", sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.add_column(sa.Column("stay_checkout_day_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("stay_checkout_time", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.drop_column("stay_checkout_time")
        batch_op.drop_column("stay_checkout_day_id")

    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_column("checkout_time")
        batch_op.drop_column("checkin_time")
