"""ChainEquity Backend API - Main Application"""
import asyncio
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.v1.router import api_router
from app.api.websocket import websocket_router
from app.models.database import init_db, close_db, async_session_factory
from app.services.solana_client import close_solana_client, get_solana_client
from app.services.sync import sync_tokens_from_chain

# Indexer is optional - only imported if available
try:
    from app.services.indexer import start_indexer, stop_indexer
    INDEXER_AVAILABLE = True
except ImportError:
    INDEXER_AVAILABLE = False
    async def start_indexer(): pass
    async def stop_indexer(): pass

# Vesting scheduler for explicit release events
from app.services.vesting_scheduler import start_vesting_scheduler, stop_vesting_scheduler

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.dev.ConsoleRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting ChainEquity API", version=settings.app_version)

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Sync on-chain tokens to database on startup
    try:
        async with async_session_factory() as db:
            sync_stats = await sync_tokens_from_chain(db)
            logger.info("On-chain token sync completed", **sync_stats)
    except Exception as e:
        logger.warning("Failed to sync on-chain tokens on startup", error=str(e))

    # Start indexer background task (if available)
    if INDEXER_AVAILABLE:
        await start_indexer()
        logger.info("Transaction indexer started")
    else:
        logger.warning("Transaction indexer not available - running in limited mode")

    # Start vesting scheduler for explicit release events
    await start_vesting_scheduler(interval_seconds=60)
    logger.info("Vesting scheduler started")

    yield

    # Cleanup
    await stop_vesting_scheduler()
    await stop_indexer()
    await close_solana_client()
    await close_db()
    logger.info("ChainEquity API shutdown complete")


def create_app() -> FastAPI:
    """Create FastAPI application"""
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="API for ChainEquity tokenized securities platform",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(api_router, prefix=settings.api_prefix)
    app.include_router(websocket_router)

    @app.get("/health")
    async def health_check():
        """Health check endpoint"""
        return {
            "status": "healthy",
            "version": settings.app_version,
            "cluster": settings.solana_cluster,
        }

    @app.get("/slot")
    async def get_current_slot():
        """Get the current Solana slot number"""
        try:
            solana_client = await get_solana_client()
            slot = await solana_client.get_slot()
            return {
                "slot": slot,
                "cluster": settings.solana_cluster,
            }
        except Exception as e:
            logger.error("Failed to get current slot", error=str(e))
            return {
                "slot": None,
                "cluster": settings.solana_cluster,
                "error": str(e),
            }

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
    )
