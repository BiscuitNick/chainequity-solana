"""WebSocket endpoints for real-time updates"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Set
import json
import asyncio
import structlog

logger = structlog.get_logger()

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections and broadcasts"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.subscriptions: dict[WebSocket, Set[str]] = {}

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

    async def subscribe(self, websocket: WebSocket, channels: List[str], token_id: int = None):
        """Subscribe to event channels"""
        for channel in channels:
            key = f"{channel}:{token_id}" if token_id else channel
            self.subscriptions[websocket].add(key)
        logger.info("WebSocket subscribed", channels=channels, token_id=token_id)

    async def broadcast(self, message: dict, channel: str = None, token_id: int = None):
        """Broadcast message to subscribed connections"""
        key = f"{channel}:{token_id}" if channel and token_id else channel

        for websocket in self.active_connections:
            if key is None or key in self.subscriptions.get(websocket, set()):
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error("Broadcast failed", error=str(e))

    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send message to a specific connection"""
        await websocket.send_json(message)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "subscribe":
                channels = data.get("channels", [])
                token_id = data.get("token_id")
                await manager.subscribe(websocket, channels, token_id)
                await manager.send_personal(websocket, {
                    "type": "subscribed",
                    "channels": channels,
                    "token_id": token_id,
                })

            elif data.get("type") == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error("WebSocket error", error=str(e))
        manager.disconnect(websocket)


websocket_router = router
