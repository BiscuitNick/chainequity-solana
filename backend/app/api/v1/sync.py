"""Sync API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.services.sync import sync_tokens_from_chain

router = APIRouter()


@router.post("/tokens")
async def sync_tokens(db: AsyncSession = Depends(get_db)):
    """
    Sync tokens from on-chain to database.
    Fetches all TokenConfig accounts from the token program and upserts them.
    """
    try:
        stats = await sync_tokens_from_chain(db)
        return {
            "message": "Token sync completed",
            "stats": stats,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.get("/status")
async def sync_status():
    """Get sync service status"""
    return {
        "status": "available",
        "message": "Use POST /api/v1/sync/tokens to sync on-chain tokens to database",
    }
