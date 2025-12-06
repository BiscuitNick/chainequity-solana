"""Application configuration"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    app_name: str = "ChainEquity API"
    app_version: str = "0.1.0"
    debug: bool = True

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_prefix: str = "/api/v1"

    # Database
    database_url: str = "postgresql+asyncpg://chainequity:chainequity@localhost:5432/chainequity"
    database_pool_size: int = 10

    # Solana
    solana_cluster: str = "devnet"
    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_ws_url: str = "wss://api.devnet.solana.com"

    # Program IDs (will be updated after deployment)
    factory_program_id: str = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
    token_program_id: str = "HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L"
    governance_program_id: str = "BPFLoaderUpgradeab1e11111111111111111111111"
    test_usdc_program_id: str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

    # Indexer
    indexer_poll_interval: int = 5  # seconds
    indexer_backfill_batch_size: int = 100

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
