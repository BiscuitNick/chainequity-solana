"""Add investment modeling tables

Revision ID: add_investment_modeling
Revises: add_slot_to_issuances
Create Date: 2025-12-08

This migration adds:
- share_classes: Define share types with liquidation preferences
- share_positions: Track holder positions by share class
- funding_rounds: Track investment rounds with valuations
- investments: Individual investments within rounds
- convertible_instruments: SAFEs and convertible notes
- valuation_events: Historical valuation tracking
- Valuation columns on tokens table
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_investment_modeling'
down_revision: Union[str, None] = 'add_slot_to_issuances'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Share classes table
    op.create_table(
        'share_classes',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('token_id', sa.Integer(), sa.ForeignKey('tokens.token_id'), nullable=False, index=True),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='99'),
        sa.Column('preference_multiple', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('is_convertible', sa.Boolean(), server_default='false'),
        sa.Column('converts_to_class_id', sa.Integer(), sa.ForeignKey('share_classes.id'), nullable=True),
        sa.Column('votes_per_share', sa.Integer(), server_default='1'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Share positions table
    op.create_table(
        'share_positions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('token_id', sa.Integer(), sa.ForeignKey('tokens.token_id'), nullable=False, index=True),
        sa.Column('share_class_id', sa.Integer(), sa.ForeignKey('share_classes.id'), nullable=False, index=True),
        sa.Column('wallet', sa.String(44), nullable=False, index=True),
        sa.Column('shares', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('cost_basis', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('price_per_share', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('acquired_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_share_positions_wallet_class', 'share_positions', ['wallet', 'share_class_id'])

    # Funding rounds table
    op.create_table(
        'funding_rounds',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('token_id', sa.Integer(), sa.ForeignKey('tokens.token_id'), nullable=False, index=True),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('round_type', sa.String(20), nullable=False),
        sa.Column('pre_money_valuation', sa.BigInteger(), nullable=False),
        sa.Column('amount_raised', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('post_money_valuation', sa.BigInteger(), nullable=False),
        sa.Column('price_per_share', sa.BigInteger(), nullable=False),
        sa.Column('shares_issued', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('share_class_id', sa.Integer(), sa.ForeignKey('share_classes.id'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('tx_signature', sa.String(88), nullable=True),
        sa.Column('slot', sa.BigInteger(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('terms', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Investments table
    op.create_table(
        'investments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('token_id', sa.Integer(), sa.ForeignKey('tokens.token_id'), nullable=False, index=True),
        sa.Column('funding_round_id', sa.Integer(), sa.ForeignKey('funding_rounds.id'), nullable=False, index=True),
        sa.Column('investor_wallet', sa.String(44), nullable=False, index=True),
        sa.Column('investor_name', sa.String(100), nullable=True),
        sa.Column('amount', sa.BigInteger(), nullable=False),
        sa.Column('shares_received', sa.BigInteger(), nullable=False),
        sa.Column('price_per_share', sa.BigInteger(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('tx_signature', sa.String(88), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Convertible instruments table
    op.create_table(
        'convertible_instruments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('token_id', sa.Integer(), sa.ForeignKey('tokens.token_id'), nullable=False, index=True),
        sa.Column('instrument_type', sa.String(20), nullable=False),
        sa.Column('name', sa.String(100), nullable=True),
        sa.Column('holder_wallet', sa.String(44), nullable=False, index=True),
        sa.Column('holder_name', sa.String(100), nullable=True),
        sa.Column('principal_amount', sa.BigInteger(), nullable=False),
        sa.Column('valuation_cap', sa.BigInteger(), nullable=True),
        sa.Column('discount_rate', sa.Float(), nullable=True),
        sa.Column('interest_rate', sa.Float(), nullable=True),
        sa.Column('maturity_date', sa.Date(), nullable=True),
        sa.Column('safe_type', sa.String(20), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='outstanding'),
        sa.Column('converted_at', sa.DateTime(), nullable=True),
        sa.Column('conversion_round_id', sa.Integer(), sa.ForeignKey('funding_rounds.id'), nullable=True),
        sa.Column('shares_received', sa.BigInteger(), nullable=True),
        sa.Column('conversion_price', sa.BigInteger(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Valuation events table
    op.create_table(
        'valuation_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('token_id', sa.Integer(), sa.ForeignKey('tokens.token_id'), nullable=False, index=True),
        sa.Column('event_type', sa.String(20), nullable=False),
        sa.Column('valuation', sa.BigInteger(), nullable=False),
        sa.Column('price_per_share', sa.BigInteger(), nullable=False),
        sa.Column('fully_diluted_shares', sa.BigInteger(), nullable=False),
        sa.Column('funding_round_id', sa.Integer(), sa.ForeignKey('funding_rounds.id'), nullable=True),
        sa.Column('effective_date', sa.DateTime(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(44), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Add valuation columns to tokens table
    op.add_column('tokens', sa.Column('current_valuation', sa.BigInteger(), nullable=True))
    op.add_column('tokens', sa.Column('current_price_per_share', sa.BigInteger(), nullable=True))
    op.add_column('tokens', sa.Column('last_valuation_date', sa.DateTime(), nullable=True))


def downgrade() -> None:
    # Remove valuation columns from tokens table
    op.drop_column('tokens', 'last_valuation_date')
    op.drop_column('tokens', 'current_price_per_share')
    op.drop_column('tokens', 'current_valuation')

    # Drop tables in reverse order (due to foreign key constraints)
    op.drop_table('valuation_events')
    op.drop_table('convertible_instruments')
    op.drop_table('investments')
    op.drop_table('funding_rounds')
    op.drop_index('ix_share_positions_wallet_class', 'share_positions')
    op.drop_table('share_positions')
    op.drop_table('share_classes')
