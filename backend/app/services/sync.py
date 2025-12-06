"""Sync service to fetch on-chain data and store in database"""
import base64
import struct
from datetime import datetime
from typing import Optional, List, Dict, Any
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from solders.pubkey import Pubkey

from app.models.token import Token
from app.services.solana_client import get_solana_client, SolanaClient
from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

# TokenConfig account discriminator (first 8 bytes)
# This is derived from the account name hash in Anchor
TOKEN_CONFIG_DISCRIMINATOR = bytes([0x9f, 0x04, 0x7a, 0x00, 0x79, 0x03, 0x9c, 0x5e])


def parse_token_config(data: bytes) -> Optional[Dict[str, Any]]:
    """Parse TokenConfig account data from on-chain bytes.

    Struct layout (from Rust):
    - discriminator: 8 bytes
    - factory: Pubkey (32 bytes)
    - token_id: u64 (8 bytes)
    - authority: Pubkey (32 bytes)
    - mint: Pubkey (32 bytes)
    - symbol: String (4 bytes length + data)
    - name: String (4 bytes length + data)
    - decimals: u8
    - total_supply: u64
    - split_multiplier: u64
    - features: TokenFeatures struct
    - paused: bool
    """
    try:
        # Skip 8-byte discriminator
        offset = 8

        # factory: Pubkey (32 bytes) - skip
        offset += 32

        # token_id: u64 (8 bytes)
        token_id = struct.unpack_from('<Q', data, offset)[0]
        offset += 8

        # authority: Pubkey (32 bytes)
        authority = Pubkey.from_bytes(data[offset:offset+32])
        offset += 32

        # mint: Pubkey (32 bytes)
        mint = Pubkey.from_bytes(data[offset:offset+32])
        offset += 32

        # symbol: String (4 bytes length + data)
        symbol_len = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        symbol = data[offset:offset+symbol_len].decode('utf-8').rstrip('\x00')
        offset += symbol_len

        # name: String (4 bytes length + data)
        name_len = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        name = data[offset:offset+name_len].decode('utf-8').rstrip('\x00')
        offset += name_len

        # decimals: u8 (1 byte)
        decimals = data[offset]
        offset += 1

        # total_supply: u64 (8 bytes)
        total_supply = struct.unpack_from('<Q', data, offset)[0]
        offset += 8

        # split_multiplier: u64 (8 bytes) - skip
        offset += 8

        # features: TokenFeatures struct (5 bools = 5 bytes)
        vesting_enabled = bool(data[offset])
        governance_enabled = bool(data[offset + 1])
        dividends_enabled = bool(data[offset + 2])
        transfer_restrictions_enabled = bool(data[offset + 3])
        upgradeable = bool(data[offset + 4])
        offset += 5

        # paused: bool (1 byte)
        paused = bool(data[offset])

        return {
            'token_id': token_id,
            'mint': str(mint),
            'authority': str(authority),
            'symbol': symbol,
            'name': name,
            'decimals': decimals,
            'total_supply': total_supply,
            'features': {
                'vesting_enabled': vesting_enabled,
                'governance_enabled': governance_enabled,
                'dividends_enabled': dividends_enabled,
                'transfer_restrictions_enabled': transfer_restrictions_enabled,
                'upgradeable': upgradeable,
            },
            'paused': paused,
        }
    except Exception as e:
        logger.warning("Failed to parse TokenConfig", error=str(e))
        return None


async def sync_tokens_from_chain(db: AsyncSession) -> Dict[str, Any]:
    """
    Fetch all TokenConfig accounts from on-chain and sync to database.
    Returns stats about the sync operation.
    """
    stats = {
        'found_on_chain': 0,
        'created': 0,
        'updated': 0,
        'errors': 0,
    }

    try:
        client = await get_solana_client()
        # TokenConfig accounts are owned by the factory program
        factory_program_id = Pubkey.from_string(settings.factory_program_id)

        logger.info("Syncing tokens from chain", program_id=str(factory_program_id))

        # Get all accounts from the factory program
        # TokenConfig accounts are typically ~300-500 bytes
        accounts = await client.get_program_accounts(factory_program_id)

        logger.info(f"Found {len(accounts)} accounts from token program")

        for account_info in accounts:
            try:
                pubkey = account_info['pubkey']
                account_data = account_info['account']['data']

                # Handle data - might be bytes directly or base64 encoded
                if isinstance(account_data, bytes):
                    raw_data = account_data
                elif isinstance(account_data, list) and len(account_data) >= 1:
                    raw_data = base64.b64decode(account_data[0])
                elif isinstance(account_data, str):
                    raw_data = base64.b64decode(account_data)
                else:
                    continue

                # Check if this looks like a TokenConfig by size
                # TokenConfig accounts are exactly 220 bytes
                if len(raw_data) != 220:
                    continue

                # Try to parse as TokenConfig
                parsed = parse_token_config(raw_data)
                if parsed is None:
                    continue

                stats['found_on_chain'] += 1

                # Check if token already exists in DB
                result = await db.execute(
                    select(Token).where(Token.token_id == parsed['token_id'])
                )
                existing_token = result.scalar_one_or_none()

                if existing_token:
                    # Update existing token
                    existing_token.mint_address = parsed['mint']
                    existing_token.symbol = parsed['symbol']
                    existing_token.name = parsed['name']
                    existing_token.decimals = parsed['decimals']
                    existing_token.total_supply = parsed['total_supply']
                    existing_token.features = parsed['features']
                    existing_token.is_paused = parsed['paused']
                    existing_token.updated_at = datetime.utcnow()
                    stats['updated'] += 1
                    logger.info(f"Updated token {parsed['symbol']}", token_id=parsed['token_id'])
                else:
                    # Create new token
                    new_token = Token(
                        token_id=parsed['token_id'],
                        on_chain_config=pubkey,
                        mint_address=parsed['mint'],
                        symbol=parsed['symbol'],
                        name=parsed['name'],
                        decimals=parsed['decimals'],
                        total_supply=parsed['total_supply'],
                        features=parsed['features'],
                        is_paused=parsed['paused'],
                    )
                    db.add(new_token)
                    stats['created'] += 1
                    logger.info(f"Created token {parsed['symbol']}", token_id=parsed['token_id'])

            except Exception as e:
                stats['errors'] += 1
                logger.warning("Error processing account", error=str(e))
                continue

        await db.commit()
        logger.info("Token sync completed", **stats)

    except Exception as e:
        logger.error("Token sync failed", error=str(e))
        stats['errors'] += 1
        await db.rollback()

    return stats
