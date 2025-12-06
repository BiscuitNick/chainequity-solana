"""Integration tests for ChainEquity API endpoints"""
import pytest
from httpx import AsyncClient


class TestHealthEndpoint:
    """Tests for health check endpoint"""

    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        """Test that health endpoint returns healthy status"""
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "cluster" in data


class TestTokenEndpoints:
    """Tests for token-related endpoints"""

    @pytest.mark.asyncio
    async def test_list_tokens_empty(self, client: AsyncClient):
        """Test listing tokens when database is empty"""
        response = await client.get("/api/v1/tokens")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    @pytest.mark.asyncio
    async def test_list_tokens_with_pagination(self, client: AsyncClient):
        """Test token listing with pagination parameters"""
        response = await client.get("/api/v1/tokens?skip=0&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_get_token_not_found(self, client: AsyncClient):
        """Test getting a non-existent token"""
        response = await client.get("/api/v1/tokens/999/info")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_balance_invalid_address(self, client: AsyncClient):
        """Test getting balance with invalid address format"""
        response = await client.get("/api/v1/tokens/1/balance/invalid")
        # Should return 404 since token doesn't exist
        assert response.status_code == 404


class TestAllowlistEndpoints:
    """Tests for allowlist-related endpoints"""

    @pytest.mark.asyncio
    async def test_get_allowlist_no_token(self, client: AsyncClient):
        """Test getting allowlist for non-existent token"""
        response = await client.get("/api/v1/tokens/999/allowlist")
        # Depends on implementation - might return 404 or empty list
        assert response.status_code in [200, 404]

    @pytest.mark.asyncio
    async def test_add_to_allowlist_validation(self, client: AsyncClient, mock_allowlist_entry):
        """Test allowlist entry validation"""
        response = await client.post(
            "/api/v1/tokens/1/allowlist",
            json=mock_allowlist_entry
        )
        # Should fail since token doesn't exist
        assert response.status_code in [404, 422]


class TestVestingEndpoints:
    """Tests for vesting-related endpoints"""

    @pytest.mark.asyncio
    async def test_get_vesting_schedules_empty(self, client: AsyncClient):
        """Test getting vesting schedules when none exist"""
        response = await client.get("/api/v1/tokens/1/vesting")
        # Returns 404 if token doesn't exist, or empty list
        assert response.status_code in [200, 404]

    @pytest.mark.asyncio
    async def test_create_vesting_validation(self, client: AsyncClient, mock_vesting_schedule):
        """Test vesting schedule creation validation"""
        response = await client.post(
            "/api/v1/tokens/1/vesting",
            json=mock_vesting_schedule
        )
        # Should fail validation or 404 for missing token
        assert response.status_code in [404, 422]


class TestDividendEndpoints:
    """Tests for dividend-related endpoints"""

    @pytest.mark.asyncio
    async def test_get_dividend_rounds_empty(self, client: AsyncClient):
        """Test getting dividend rounds when none exist"""
        response = await client.get("/api/v1/tokens/1/dividends")
        assert response.status_code in [200, 404]

    @pytest.mark.asyncio
    async def test_create_dividend_validation(self, client: AsyncClient):
        """Test dividend creation validation"""
        response = await client.post(
            "/api/v1/tokens/1/dividends",
            json={
                "total_pool": 50000,
                "payment_token": "USDC",
            }
        )
        assert response.status_code in [404, 422]


class TestGovernanceEndpoints:
    """Tests for governance-related endpoints"""

    @pytest.mark.asyncio
    async def test_get_proposals_empty(self, client: AsyncClient):
        """Test getting proposals when none exist"""
        response = await client.get("/api/v1/tokens/1/governance/proposals")
        assert response.status_code in [200, 404]

    @pytest.mark.asyncio
    async def test_create_proposal_validation(self, client: AsyncClient, mock_proposal):
        """Test proposal creation validation"""
        response = await client.post(
            "/api/v1/tokens/1/governance/proposals",
            json=mock_proposal
        )
        assert response.status_code in [404, 422]

    @pytest.mark.asyncio
    async def test_vote_on_nonexistent_proposal(self, client: AsyncClient):
        """Test voting on non-existent proposal"""
        response = await client.post(
            "/api/v1/tokens/1/governance/proposals/999/vote",
            json={"vote_for": True}
        )
        assert response.status_code in [404, 422]


class TestAdminEndpoints:
    """Tests for admin-related endpoints"""

    @pytest.mark.asyncio
    async def test_get_multisig_info(self, client: AsyncClient):
        """Test getting multi-sig info"""
        response = await client.get("/api/v1/tokens/1/admin/multisig")
        assert response.status_code in [200, 404]

    @pytest.mark.asyncio
    async def test_get_pending_transactions(self, client: AsyncClient):
        """Test getting pending transactions"""
        response = await client.get("/api/v1/tokens/1/admin/transactions")
        assert response.status_code in [200, 404]

    @pytest.mark.asyncio
    async def test_pause_token(self, client: AsyncClient):
        """Test pausing token transfers"""
        response = await client.post(
            "/api/v1/tokens/1/admin/pause",
            json={"paused": True}
        )
        assert response.status_code in [200, 404]


class TestWebSocket:
    """Tests for WebSocket functionality"""

    @pytest.mark.asyncio
    async def test_websocket_stats(self, client: AsyncClient):
        """Test WebSocket stats endpoint"""
        response = await client.get("/ws/stats")
        assert response.status_code == 200
        data = response.json()
        assert "active_connections" in data
        assert "queue_size" in data
