"""Add share class to vesting schedules

Revision ID: add_vesting_share_class
Revises: add_investment_modeling
Create Date: 2024-12-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_vesting_share_class'
down_revision: Union[str, None] = 'add_investment_modeling'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add share_class_id to vesting_schedules
    op.add_column('vesting_schedules', sa.Column('share_class_id', sa.Integer(), nullable=True))
    op.add_column('vesting_schedules', sa.Column('cost_basis', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('vesting_schedules', sa.Column('price_per_share', sa.BigInteger(), nullable=False, server_default='0'))

    # Add foreign key constraint
    op.create_foreign_key(
        'fk_vesting_schedules_share_class_id',
        'vesting_schedules', 'share_classes',
        ['share_class_id'], ['id']
    )

    # Add index for share_class_id
    op.create_index('ix_vesting_schedules_share_class_id', 'vesting_schedules', ['share_class_id'])


def downgrade() -> None:
    op.drop_index('ix_vesting_schedules_share_class_id', table_name='vesting_schedules')
    op.drop_constraint('fk_vesting_schedules_share_class_id', 'vesting_schedules', type_='foreignkey')
    op.drop_column('vesting_schedules', 'price_per_share')
    op.drop_column('vesting_schedules', 'cost_basis')
    op.drop_column('vesting_schedules', 'share_class_id')
