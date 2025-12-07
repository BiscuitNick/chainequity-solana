"""Add slot column to token_issuances

Revision ID: add_slot_to_issuances
Revises: 07e0f54ce8e5
Create Date: 2025-12-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_slot_to_issuances'
down_revision: Union[str, None] = '07e0f54ce8e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('token_issuances', sa.Column('slot', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('token_issuances', 'slot')
