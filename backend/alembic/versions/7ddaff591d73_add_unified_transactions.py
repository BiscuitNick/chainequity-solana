"""add_unified_transactions

Revision ID: 7ddaff591d73
Revises: 
Create Date: 2025-12-09 18:19:26.774883

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7ddaff591d73'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # unified_transactions table was created manually before alembic tracking.
    # This migration exists to establish alembic history.
    # The table already exists with all required columns and indexes.
    pass


def downgrade() -> None:
    """Downgrade schema."""
    # Do not drop unified_transactions on downgrade - it contains historical data
    pass
