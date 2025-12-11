"""make_vesting_type_nullable

Revision ID: 85b1c516e14f
Revises: 7ddaff591d73
Create Date: 2025-12-10 20:30:25.031905

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '85b1c516e14f'
down_revision: Union[str, Sequence[str], None] = '7ddaff591d73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Make vesting_type nullable as it's deprecated in favor of interval-based vesting.
    All vesting schedules now use discrete intervals (minute/hour/day/month) instead
    of vesting_type (linear/cliff_then_linear/stepped).
    """
    op.alter_column(
        'vesting_schedules',
        'vesting_type',
        existing_type=sa.String(20),
        nullable=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Set a default value for any NULL vesting_type before making non-nullable
    op.execute("UPDATE vesting_schedules SET vesting_type = 'linear' WHERE vesting_type IS NULL")
    op.alter_column(
        'vesting_schedules',
        'vesting_type',
        existing_type=sa.String(20),
        nullable=False
    )
