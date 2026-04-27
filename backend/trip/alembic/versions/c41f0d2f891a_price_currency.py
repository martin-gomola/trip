"""price currency

Revision ID: c41f0d2f891a
Revises: aa4d0f7b2c91
Create Date: 2026-04-27 10:10:00.000000

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "c41f0d2f891a"
down_revision = "aa4d0f7b2c91"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.add_column(sa.Column("price_currency", sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.add_column(sa.Column("price_currency", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.drop_column("price_currency")

    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_column("price_currency")
