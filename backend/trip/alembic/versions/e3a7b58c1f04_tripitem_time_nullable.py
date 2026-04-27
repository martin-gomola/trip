"""tripitem.time nullable for stay check-in override semantics

Revision ID: e3a7b58c1f04
Revises: d8e2f1a4c0b3
Create Date: 2026-04-27 13:50:00.000000

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

revision = "e3a7b58c1f04"
down_revision = "d8e2f1a4c0b3"
branch_labels = None
depends_on = None


def upgrade():
    # Allow tripitem.time to be NULL. For accommodation rows it now means
    # "use the place's checkin_time"; activities still set it via the form.
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.alter_column(
            "time",
            existing_type=sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        )


def downgrade():
    # Reverting to NOT NULL requires every row to have a value. Existing
    # data should already have one (legacy behaviour set time on every
    # row), but we guard with a coalesce to be safe.
    op.execute("UPDATE tripitem SET time = '00:00' WHERE time IS NULL")
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.alter_column(
            "time",
            existing_type=sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
        )
