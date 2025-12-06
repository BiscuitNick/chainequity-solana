"""WebSocket endpoints for real-time updates"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Set, Optional
from datetime import datetime
import asyncio
import structlog

logger = structlog.get_logger()

router = APIRouter()


# Available channels for subscription
CHANNELS = {
    "transactions": "New transactions indexed",
    "allowlist": "Allowlist changes",
    "transfers": "Token transfers",
    "vesting": "Vesting events",
    "dividends": "Dividend events",
    "governance": "Governance events",
    "multisig": "Multi-sig events",
}


class ConnectionManager:
    """Manages WebSocket connections and broadcasts"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.subscriptions: dict[WebSocket, Set[str]] = {}
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._broadcast_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the broadcast worker"""
        if self._broadcast_task is None:
            self._broadcast_task = asyncio.create_task(self._broadcast_worker())
            logger.info("WebSocket broadcast worker started")

    async def stop(self):
        """Stop the broadcast worker"""
        if self._broadcast_task:
            self._broadcast_task.cancel()
            self._broadcast_task = None

    async def _broadcast_worker(self):
        """Background worker to process queued broadcasts"""
        while True:
            try:
                message, channel, token_id = await self._message_queue.get()
                await self._do_broadcast(message, channel, token_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Broadcast worker error", error=str(e))

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.subscriptions[websocket] = set()
        logger.info("WebSocket connected", total_connections=len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.subscriptions:
            del self.subscriptions[websocket]
        logger.info("WebSocket disconnected", total_connections=len(self.active_connections))

    async def subscribe(self, websocket: WebSocket, channels: List[str], token_id: Optional[str] = None):
        """Subscribe to event channels"""
        valid_channels = []
        for channel in channels:
            if channel in CHANNELS:
                key = f"{channel}:{token_id}" if token_id else channel
                self.subscriptions[websocket].add(key)
                valid_channels.append(channel)
        logger.info("WebSocket subscribed", channels=valid_channels, token_id=token_id)
        return valid_channels

    async def unsubscribe(self, websocket: WebSocket, channels: List[str], token_id: Optional[str] = None):
        """Unsubscribe from event channels"""
        for channel in channels:
            key = f"{channel}:{token_id}" if token_id else channel
            self.subscriptions[websocket].discard(key)
        logger.info("WebSocket unsubscribed", channels=channels, token_id=token_id)

    async def broadcast(self, message: dict, channel: str = None, token_id: str = None):
        """Queue a message for broadcast"""
        await self._message_queue.put((message, channel, token_id))

    async def _do_broadcast(self, message: dict, channel: str = None, token_id: str = None):
        """Broadcast message to subscribed connections"""
        # Generate subscription keys to match
        keys_to_match = set()
        if channel:
            keys_to_match.add(channel)  # Global channel subscription
            if token_id:
                keys_to_match.add(f"{channel}:{token_id}")  # Token-specific subscription

        disconnected = []
        for websocket in self.active_connections:
            # Check if subscribed to any matching key
            ws_subs = self.subscriptions.get(websocket, set())
            if not keys_to_match or keys_to_match.intersection(ws_subs):
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.warning("Failed to send to websocket", error=str(e))
                    disconnected.append(websocket)

        # Clean up disconnected sockets
        for ws in disconnected:
            self.disconnect(ws)

    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send message to a specific connection"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error("Personal send failed", error=str(e))
            self.disconnect(websocket)

    def get_stats(self) -> dict:
        """Get connection statistics"""
        return {
            "active_connections": len(self.active_connections),
            "queue_size": self._message_queue.qsize(),
        }


# Global connection manager
manager = ConnectionManager()


async def broadcast_event(
    event_type: str,
    data: dict,
    channel: str,
    token_id: Optional[str] = None,
):
    """Broadcast an event to WebSocket clients (used by indexer)"""
    message = {
        "type": "event",
        "event_type": event_type,
        "channel": channel,
        "token_id": token_id,
        "data": data,
        "timestamp": datetime.utcnow().isoformat(),
    }
    await manager.broadcast(message, channel, token_id)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time updates.

    Supported message types:
    - {"type": "subscribe", "channels": ["transfers", "vesting"], "token_id": "optional"}
    - {"type": "unsubscribe", "channels": ["transfers"]}
    - {"type": "ping"}
    - {"type": "list_channels"}
    """
    await manager.connect(websocket)

    # Send welcome message
    await manager.send_personal(websocket, {
        "type": "connected",
        "available_channels": list(CHANNELS.keys()),
    })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "subscribe":
                channels = data.get("channels", [])
                token_id = data.get("token_id")
                valid_channels = await manager.subscribe(websocket, channels, token_id)
                await manager.send_personal(websocket, {
                    "type": "subscribed",
                    "channels": valid_channels,
                    "token_id": token_id,
                })

            elif msg_type == "unsubscribe":
                channels = data.get("channels", [])
                token_id = data.get("token_id")
                await manager.unsubscribe(websocket, channels, token_id)
                await manager.send_personal(websocket, {
                    "type": "unsubscribed",
                    "channels": channels,
                    "token_id": token_id,
                })

            elif msg_type == "list_channels":
                await manager.send_personal(websocket, {
                    "type": "channels",
                    "channels": CHANNELS,
                })

            elif msg_type == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

            else:
                await manager.send_personal(websocket, {
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error("WebSocket error", error=str(e))
        manager.disconnect(websocket)


@router.get("/ws/stats")
async def websocket_stats():
    """Get WebSocket connection statistics"""
    return manager.get_stats()


websocket_router = router
