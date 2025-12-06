"""Cap-table API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import io

from app.models.database import get_db
from app.schemas.captable import CapTableResponse, CapTableEntryResponse, ExportFormat

router = APIRouter()


@router.get("", response_model=CapTableResponse)
async def get_captable(token_id: int, db: AsyncSession = Depends(get_db)):
    """Get current cap-table"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/at/{slot}", response_model=CapTableResponse)
async def get_captable_at_slot(token_id: int, slot: int, db: AsyncSession = Depends(get_db)):
    """Get cap-table at a specific slot"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/snapshots")
async def list_snapshots(token_id: int, db: AsyncSession = Depends(get_db)):
    """List available cap-table snapshots"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/export")
async def export_captable(
    token_id: int,
    format: ExportFormat = ExportFormat.CSV,
    slot: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Export cap-table as CSV, JSON, or PDF"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")
