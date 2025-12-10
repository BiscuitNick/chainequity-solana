"""Pytest configuration and fixtures for ChainEquity backend tests"""
import asyncio
import os
import pytest
import pytest_asyncio
from typing import AsyncGenerator, Generator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

from app.main import app
from app.models.database import Base, get_db
from app.config import get_settings

# Load environment variables
load_dotenv()

# Test database URL - use PostgreSQL from environment (same as dev, uses transaction rollback for isolation)
TEST_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://chainequity:chainequity@localhost:5432/chainequity")

# Create test engine with NullPool to avoid connection pool issues in tests
# NullPool creates a new connection for each request and closes it immediately after
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    poolclass=NullPool,
)

# Create test session factory
TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an event loop for the test session"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Create a database session for each test.

    Uses the actual database - tests should use unique identifiers to avoid conflicts.
    """
    session = TestSessionLocal()
    try:
        yield session
    finally:
        await session.close()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client"""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def mock_token_data():
    """Mock token data for tests"""
    return {
        "id": 1,
        "mint_address": "Hk4M8xYq123456789012345678901234567890123456",
        "symbol": "TEST",
        "name": "Test Token",
        "decimals": 0,
        "total_supply": 1000000,
    }


@pytest.fixture
def mock_allowlist_entry():
    """Mock allowlist entry for tests"""
    return {
        "address": "Jm2N9zWr123456789012345678901234567890123456",
        "kyc_level": 2,
        "status": "active",
    }


@pytest.fixture
def mock_vesting_schedule():
    """Mock vesting schedule for tests"""
    return {
        "beneficiary": "Lp5Q3vTs123456789012345678901234567890123456",
        "total_amount": 100000,
        "start_time": 1704067200,  # 2024-01-01
        "cliff_duration": 31536000,  # 1 year
        "total_duration": 126144000,  # 4 years
        "vesting_type": "cliff_then_linear",
        "revocable": True,
    }


@pytest.fixture
def mock_proposal():
    """Mock governance proposal for tests"""
    return {
        "title": "Test Proposal",
        "description": "A test proposal for unit testing",
        "action_type": "stock_split",
        "action_data": {"numerator": 2, "denominator": 1},
        "voting_period_days": 7,
    }
