"""Solana RPC Client wrapper for ChainEquity"""
import asyncio
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
import structlog
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Commitment, Confirmed, Finalized
from solders.pubkey import Pubkey
from solders.signature import Signature
from anchorpy import Program, Provider, Wallet
from anchorpy.idl import Idl

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


@dataclass
class ProgramAddresses:
    """Program addresses for ChainEquity"""
    factory: Pubkey
    token: Pubkey
    governance: Pubkey
    test_usdc: Pubkey


class SolanaClient:
    """Async Solana RPC client with program interaction support"""

    def __init__(self, rpc_url: Optional[str] = None):
        self.rpc_url = rpc_url or settings.solana_rpc_url
        self._client: Optional[AsyncClient] = None
        self._programs: Dict[str, Program] = {}

        # Program IDs from settings
        self.program_addresses = ProgramAddresses(
            factory=Pubkey.from_string(settings.factory_program_id),
            token=Pubkey.from_string(settings.token_program_id),
            governance=Pubkey.from_string(settings.governance_program_id),
            test_usdc=Pubkey.from_string(settings.test_usdc_program_id),
        )

    async def connect(self) -> None:
        """Establish connection to Solana RPC"""
        if self._client is None:
            self._client = AsyncClient(self.rpc_url, commitment=Confirmed)
            logger.info("Connected to Solana RPC", url=self.rpc_url)

    async def disconnect(self) -> None:
        """Close RPC connection"""
        if self._client:
            await self._client.close()
            self._client = None
            logger.info("Disconnected from Solana RPC")

    @property
    def client(self) -> AsyncClient:
        """Get the async client, raise if not connected"""
        if self._client is None:
            raise RuntimeError("Solana client not connected. Call connect() first.")
        return self._client

    async def get_slot(self) -> int:
        """Get current slot"""
        response = await self.client.get_slot(commitment=Confirmed)
        return response.value

    async def get_block_time(self, slot: int) -> Optional[int]:
        """Get block time for a slot"""
        response = await self.client.get_block_time(slot)
        return response.value

    async def get_signatures_for_address(
        self,
        address: Pubkey,
        before: Optional[Signature] = None,
        until: Optional[Signature] = None,
        limit: int = 1000,
    ) -> List[Dict[str, Any]]:
        """Get transaction signatures for an address"""
        response = await self.client.get_signatures_for_address(
            address,
            before=before,
            until=until,
            limit=limit,
            commitment=Confirmed,
        )
        return [
            {
                "signature": str(sig.signature),
                "slot": sig.slot,
                "err": sig.err,
                "memo": sig.memo,
                "block_time": sig.block_time,
            }
            for sig in response.value
        ]

    async def get_transaction(
        self,
        signature: str,
        max_supported_version: int = 0,
    ) -> Optional[Dict[str, Any]]:
        """Get transaction details"""
        sig = Signature.from_string(signature)
        response = await self.client.get_transaction(
            sig,
            encoding="jsonParsed",
            commitment=Finalized,
            max_supported_transaction_version=max_supported_version,
        )
        if response.value is None:
            return None
        return response.value.to_json()

    async def get_account_info(
        self,
        address: Pubkey,
    ) -> Optional[Dict[str, Any]]:
        """Get account info"""
        response = await self.client.get_account_info(
            address,
            commitment=Confirmed,
            encoding="base64",
        )
        if response.value is None:
            return None
        return {
            "lamports": response.value.lamports,
            "owner": str(response.value.owner),
            "data": response.value.data,
            "executable": response.value.executable,
            "rent_epoch": response.value.rent_epoch,
        }

    async def get_program_accounts(
        self,
        program_id: Pubkey,
        filters: Optional[List[Dict]] = None,
    ) -> List[Dict[str, Any]]:
        """Get all accounts owned by a program"""
        response = await self.client.get_program_accounts(
            program_id,
            commitment=Confirmed,
            encoding="base64",
            filters=filters,
        )
        return [
            {
                "pubkey": str(account.pubkey),
                "account": {
                    "lamports": account.account.lamports,
                    "data": account.account.data,
                    "owner": str(account.account.owner),
                }
            }
            for account in response.value
        ]

    async def get_token_accounts_by_owner(
        self,
        owner: Pubkey,
        mint: Optional[Pubkey] = None,
    ) -> List[Dict[str, Any]]:
        """Get token accounts owned by an address"""
        # Token-2022 program ID
        token_program = Pubkey.from_string("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")

        if mint:
            opts = {"mint": mint}
        else:
            opts = {"programId": token_program}

        response = await self.client.get_token_accounts_by_owner(
            owner,
            opts,
            commitment=Confirmed,
            encoding="jsonParsed",
        )
        return [
            {
                "pubkey": str(account.pubkey),
                "account": account.account,
            }
            for account in response.value
        ]

    async def get_token_balance(
        self,
        token_account: Pubkey,
    ) -> Dict[str, Any]:
        """Get token account balance"""
        response = await self.client.get_token_account_balance(
            token_account,
            commitment=Confirmed,
        )
        return {
            "amount": response.value.amount,
            "decimals": response.value.decimals,
            "ui_amount": response.value.ui_amount,
        }

    # PDA derivation helpers
    def derive_factory_pda(self) -> tuple[Pubkey, int]:
        """Derive factory PDA"""
        return Pubkey.find_program_address(
            [b"factory"],
            self.program_addresses.factory,
        )

    def derive_token_config_pda(self, mint: Pubkey) -> tuple[Pubkey, int]:
        """Derive token config PDA"""
        return Pubkey.find_program_address(
            [b"token_config", bytes(mint)],
            self.program_addresses.factory,
        )

    def derive_allowlist_pda(self, token_config: Pubkey, wallet: Pubkey) -> tuple[Pubkey, int]:
        """Derive allowlist entry PDA"""
        return Pubkey.find_program_address(
            [b"allowlist", bytes(token_config), bytes(wallet)],
            self.program_addresses.token,
        )

    def derive_vesting_pda(
        self, token_config: Pubkey, beneficiary: Pubkey, start_time: int
    ) -> tuple[Pubkey, int]:
        """Derive vesting schedule PDA"""
        return Pubkey.find_program_address(
            [
                b"vesting",
                bytes(token_config),
                bytes(beneficiary),
                start_time.to_bytes(8, "little"),
            ],
            self.program_addresses.token,
        )

    def derive_multisig_pda(self, token_mint: Pubkey) -> tuple[Pubkey, int]:
        """Derive multi-sig PDA"""
        return Pubkey.find_program_address(
            [b"multisig", bytes(token_mint)],
            self.program_addresses.factory,
        )

    def derive_dividend_round_pda(self, token_config: Pubkey, round_id: int) -> tuple[Pubkey, int]:
        """Derive dividend round PDA"""
        return Pubkey.find_program_address(
            [b"dividend_round", bytes(token_config), round_id.to_bytes(8, "little")],
            self.program_addresses.token,
        )

    def derive_proposal_pda(self, token_config: Pubkey, proposal_id: int) -> tuple[Pubkey, int]:
        """Derive governance proposal PDA"""
        return Pubkey.find_program_address(
            [b"proposal", bytes(token_config), proposal_id.to_bytes(8, "little")],
            self.program_addresses.governance,
        )


# Singleton instance
_solana_client: Optional[SolanaClient] = None


async def get_solana_client() -> SolanaClient:
    """Get or create Solana client singleton"""
    global _solana_client
    if _solana_client is None:
        _solana_client = SolanaClient()
        await _solana_client.connect()
    return _solana_client


async def close_solana_client() -> None:
    """Close Solana client singleton"""
    global _solana_client
    if _solana_client is not None:
        await _solana_client.disconnect()
        _solana_client = None
