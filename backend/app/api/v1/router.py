"""API v1 router aggregation"""
from fastapi import APIRouter

from app.api.v1 import factory, tokens, allowlist, captable, vesting, dividends, governance, admin

api_router = APIRouter()

# Include all sub-routers
api_router.include_router(factory.router, prefix="/factory", tags=["Factory"])
api_router.include_router(tokens.router, prefix="/tokens", tags=["Tokens"])
api_router.include_router(allowlist.router, prefix="/tokens/{token_id}/allowlist", tags=["Allowlist"])
api_router.include_router(captable.router, prefix="/tokens/{token_id}/captable", tags=["Cap Table"])
api_router.include_router(vesting.router, prefix="/tokens/{token_id}/vesting", tags=["Vesting"])
api_router.include_router(dividends.router, prefix="/tokens/{token_id}/dividends", tags=["Dividends"])
api_router.include_router(governance.router, prefix="/tokens/{token_id}/governance", tags=["Governance"])
api_router.include_router(admin.router, prefix="/tokens/{token_id}/admin", tags=["Admin"])
