"""API v1 router aggregation"""
from fastapi import APIRouter

from app.api.v1 import factory, tokens, allowlist, captable, vesting, dividends, governance, admin, sync, issuance

api_router = APIRouter()

# Create a combined tokens router that includes all token-related sub-routers
tokens_router = APIRouter()

# Include base tokens endpoints
tokens_router.include_router(tokens.router, tags=["Tokens"])

# Include token-specific sub-routers (these have {token_id} in their paths)
tokens_router.include_router(allowlist.router, prefix="/{token_id}/allowlist", tags=["Allowlist"])
tokens_router.include_router(captable.router, prefix="/{token_id}/captable", tags=["Cap Table"])
tokens_router.include_router(vesting.router, prefix="/{token_id}/vesting", tags=["Vesting"])
tokens_router.include_router(issuance.router, prefix="/{token_id}/issuance", tags=["Issuance"])
tokens_router.include_router(dividends.router, prefix="/{token_id}/dividends", tags=["Dividends"])
tokens_router.include_router(governance.router, prefix="/{token_id}/governance", tags=["Governance"])
tokens_router.include_router(admin.router, prefix="/{token_id}/admin", tags=["Admin"])

# Include all top-level routers
api_router.include_router(factory.router, prefix="/factory", tags=["Factory"])
api_router.include_router(tokens_router, prefix="/tokens")
api_router.include_router(sync.router, prefix="/sync", tags=["Sync"])
