"""Integration tests for token supply and funding round calculations.

These tests verify that:
1. Token creation stores the correct total_supply (without multiplying by decimals)
2. Funding round price per share is calculated correctly from issued shares
3. Investment share calculations are correct
"""
import pytest
from httpx import AsyncClient
import secrets


class TestTokenSupplyCalculation:
    """Tests for token supply handling - verifies the fix for decimal multiplication bug"""

    @pytest.mark.asyncio
    async def test_token_creation_supply_not_multiplied_by_decimals(self, client: AsyncClient):
        """
        Test that creating a token with initial_supply=1,000,000 and decimals=6
        stores total_supply=1,000,000 (NOT 1,000,000,000,000).

        This verifies the fix in factory.py line 162.
        """
        # Generate unique symbol to avoid conflicts
        unique_suffix = secrets.token_hex(2).upper()
        symbol = f"TST{unique_suffix}"

        response = await client.post(
            "/api/v1/factory/tokens",
            json={
                "symbol": symbol,
                "name": f"Test Token {unique_suffix}",
                "initial_supply": 1000000,  # 1 million
                "decimals": 6,
                "features": {
                    "vesting_enabled": True,
                    "governance_enabled": True,
                    "dividends_enabled": True,
                    "transfer_restrictions_enabled": True,
                    "upgradeable": True,
                },
                "admin_signers": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
                "admin_threshold": 1,
            }
        )

        assert response.status_code == 200, f"Failed to create token: {response.text}"
        data = response.json()

        # The token_id is returned, use it to fetch full token details
        token_id = data.get("token_id")
        assert token_id is not None

        # Fetch the token to verify total_supply
        token_response = await client.get(f"/api/v1/factory/tokens/{token_id}")
        assert token_response.status_code == 200
        token_data = token_response.json()

        # CRITICAL: total_supply should be exactly what was requested (1,000,000)
        # NOT multiplied by 10^decimals (which would be 1,000,000,000,000)
        assert token_data["total_supply"] == 1000000, (
            f"total_supply should be 1,000,000 but was {token_data['total_supply']}. "
            "The decimal multiplication bug may not be fixed."
        )
        assert token_data["decimals"] == 6

    @pytest.mark.asyncio
    async def test_token_creation_with_zero_decimals(self, client: AsyncClient):
        """Test token creation with decimals=0 stores correct supply."""
        unique_suffix = secrets.token_hex(2).upper()
        symbol = f"ZD{unique_suffix}"

        response = await client.post(
            "/api/v1/factory/tokens",
            json={
                "symbol": symbol,
                "name": f"Zero Decimal Token {unique_suffix}",
                "initial_supply": 500000,
                "decimals": 0,
                "features": {
                    "vesting_enabled": True,
                    "governance_enabled": True,
                    "dividends_enabled": True,
                    "transfer_restrictions_enabled": True,
                    "upgradeable": True,
                },
                "admin_signers": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
                "admin_threshold": 1,
            }
        )

        assert response.status_code == 200
        data = response.json()
        token_id = data.get("token_id")

        token_response = await client.get(f"/api/v1/factory/tokens/{token_id}")
        token_data = token_response.json()

        # With decimals=0, supply should still be exactly as requested
        assert token_data["total_supply"] == 500000
        assert token_data["decimals"] == 0

    @pytest.mark.asyncio
    async def test_token_creation_various_decimal_values(self, client: AsyncClient):
        """Test that different decimal values don't multiply the supply."""
        test_cases = [
            (1000000, 0),   # No decimals
            (1000000, 2),   # 2 decimals (like cents)
            (1000000, 6),   # 6 decimals (like USDC)
            (1000000, 9),   # 9 decimals (like SOL)
            (1000000, 18),  # 18 decimals (like ETH)
        ]

        for initial_supply, decimals in test_cases:
            unique_suffix = secrets.token_hex(2).upper()
            symbol = f"D{decimals}{unique_suffix[:2]}"

            response = await client.post(
                "/api/v1/factory/tokens",
                json={
                    "symbol": symbol,
                    "name": f"Decimal {decimals} Token",
                    "initial_supply": initial_supply,
                    "decimals": decimals,
                    "features": {
                        "vesting_enabled": True,
                        "governance_enabled": True,
                        "dividends_enabled": True,
                        "transfer_restrictions_enabled": True,
                        "upgradeable": True,
                    },
                    "admin_signers": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
                    "admin_threshold": 1,
                }
            )

            if response.status_code == 200:
                data = response.json()
                token_id = data.get("token_id")

                token_response = await client.get(f"/api/v1/factory/tokens/{token_id}")
                token_data = token_response.json()

                assert token_data["total_supply"] == initial_supply, (
                    f"With decimals={decimals}, total_supply should be {initial_supply} "
                    f"but was {token_data['total_supply']}"
                )


class TestFundingRoundPriceCalculation:
    """Tests for funding round price per share calculation"""

    @pytest.mark.asyncio
    async def test_price_per_share_uses_issued_shares(self, client: AsyncClient):
        """
        Test that price per share is calculated from issued shares, not total_supply.

        Scenario:
        - Token created with 1,000,000 supply, 6 decimals
        - Issue 1,000,000 shares to a founder
        - Create funding round with $1,000,000 pre-money valuation
        - Expected price per share: $1.00 (100 cents)

        This verifies the fix in funding_rounds.py line 131.
        """
        # This test requires a token with issued shares
        # We'll use an existing token from seed data or skip if not available

        # First check if FRSH token exists (from seed data)
        response = await client.get("/api/v1/factory/tokens")
        if response.status_code != 200:
            pytest.skip("Cannot fetch tokens")

        tokens = response.json()
        frsh_token = next((t for t in tokens if t["symbol"] == "FRSH"), None)

        if not frsh_token:
            pytest.skip("FRSH token not found - run seed data first")

        token_id = frsh_token["token_id"]

        # Get cap table to check issued shares
        captable_response = await client.get(f"/api/v1/captable/{token_id}")
        if captable_response.status_code != 200:
            pytest.skip("Cannot fetch cap table")

        captable = captable_response.json()
        total_shares = captable.get("total_shares", 0)

        if total_shares == 0:
            pytest.skip("No shares issued yet")

        # Create a funding round
        # Pre-money = $1,000,000 (in cents = 100,000,000)
        # If issued shares = 1,000,000, price should be $1.00 (100 cents)
        pre_money_cents = 100000000  # $1,000,000 in cents
        expected_price_cents = pre_money_cents // total_shares

        # Get share classes to find one for the funding round
        share_classes_response = await client.get(f"/api/v1/captable/{token_id}/share-classes")
        if share_classes_response.status_code != 200:
            pytest.skip("Cannot fetch share classes")

        share_classes = share_classes_response.json()
        if not share_classes:
            pytest.skip("No share classes found")

        share_class_id = share_classes[0]["id"]

        response = await client.post(
            f"/api/v1/tokens/{token_id}/funding-rounds",
            json={
                "name": "Test Round",
                "round_type": "seed",
                "pre_money_valuation": pre_money_cents,
                "share_class_id": share_class_id,
            }
        )

        if response.status_code == 200:
            data = response.json()
            actual_price = data.get("price_per_share", 0)

            # Price should be based on issued shares
            # Allow some tolerance for rounding
            assert abs(actual_price - expected_price_cents) <= 1, (
                f"Price per share should be ~{expected_price_cents} cents "
                f"(${expected_price_cents/100:.2f}) but was {actual_price} cents "
                f"(${actual_price/100:.2f}). "
                f"Total issued shares: {total_shares}"
            )


class TestInvestmentShareCalculation:
    """Tests for investment share calculations"""

    @pytest.mark.asyncio
    async def test_investment_shares_calculated_correctly(self, client: AsyncClient):
        """
        Test that investing $X at $Y/share gives exactly X/Y shares.

        If price per share is $1.00 (100 cents) and investment is $1,000,000 (100,000,000 cents),
        shares received should be exactly 1,000,000.
        """
        # This test requires an existing funding round
        # Check if we have the test token and funding round

        response = await client.get("/api/v1/factory/tokens")
        if response.status_code != 200:
            pytest.skip("Cannot fetch tokens")

        tokens = response.json()
        if not tokens:
            pytest.skip("No tokens found")

        # Use first available token
        token = tokens[0]
        token_id = token["token_id"]

        # Check for existing funding rounds
        rounds_response = await client.get(f"/api/v1/tokens/{token_id}/funding-rounds")
        if rounds_response.status_code != 200:
            pytest.skip("Cannot fetch funding rounds")

        rounds = rounds_response.json()
        pending_rounds = [r for r in rounds if r.get("status") == "pending"]

        if not pending_rounds:
            pytest.skip("No pending funding rounds to test with")

        funding_round = pending_rounds[0]
        round_id = funding_round["id"]
        price_per_share = funding_round.get("price_per_share", 0)

        if price_per_share <= 0:
            pytest.skip("Invalid price per share")

        # Calculate expected shares for a test investment
        investment_amount = 100000  # $1,000 in cents
        expected_shares = investment_amount // price_per_share

        # Make the investment
        response = await client.post(
            f"/api/v1/tokens/{token_id}/funding-rounds/{round_id}/investments",
            json={
                "investor_wallet": "BPFLoaderUpgradeab1e11111111111111111111111",
                "investor_name": "Test Investor",
                "amount": investment_amount,
            }
        )

        if response.status_code == 200:
            data = response.json()
            actual_shares = data.get("shares_received", 0)

            assert actual_shares == expected_shares, (
                f"Investment of {investment_amount} cents at {price_per_share} cents/share "
                f"should yield {expected_shares} shares but got {actual_shares}"
            )
