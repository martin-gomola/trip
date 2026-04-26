"""rename place google maps url to url

Revision ID: 9b42c6a7f0d1
Revises: 8d3f0b8e9c2a
Create Date: 2026-04-26 20:10:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "9b42c6a7f0d1"
down_revision = "8d3f0b8e9c2a"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.alter_column("google_maps_url", new_column_name="url")


def downgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.alter_column("url", new_column_name="google_maps_url")
