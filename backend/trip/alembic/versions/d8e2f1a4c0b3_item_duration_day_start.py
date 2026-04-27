"""tripitem.duration_minutes + tripday.day_start_time

Revision ID: d8e2f1a4c0b3
Revises: c41f0d2f891a
Create Date: 2026-04-27 10:50:00.000000

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "d8e2f1a4c0b3"
down_revision = "c41f0d2f891a"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.add_column(sa.Column("duration_minutes", sa.Integer(), nullable=True))

    with op.batch_alter_table("tripday", schema=None) as batch_op:
        batch_op.add_column(sa.Column("day_start_time", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("tripday", schema=None) as batch_op:
        batch_op.drop_column("day_start_time")

    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.drop_column("duration_minutes")
