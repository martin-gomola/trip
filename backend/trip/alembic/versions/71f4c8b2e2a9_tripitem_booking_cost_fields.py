"""tripitem booking and cost fields

Revision ID: 71f4c8b2e2a9
Revises: 5b6e7d8c9f01
Create Date: 2026-04-27 16:40:00.000000

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "71f4c8b2e2a9"
down_revision = "5b6e7d8c9f01"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.add_column(sa.Column("booking_status", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column("booking_reference", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column("booking_cancellation_deadline", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("cost_status", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column("fee_amount", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("fee_label", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.drop_column("fee_label")
        batch_op.drop_column("fee_amount")
        batch_op.drop_column("cost_status")
        batch_op.drop_column("booking_cancellation_deadline")
        batch_op.drop_column("booking_reference")
        batch_op.drop_column("booking_status")
