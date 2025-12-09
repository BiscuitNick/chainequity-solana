"""ChainEquity Backend Services"""
from .solana_client import SolanaClient
from .waterfall import calculate_waterfall, calculate_waterfall_scenarios, WaterfallPosition
from .dilution import calculate_dilution, CurrentHolder, SimulatedRound

# Lazy imports for indexer (requires complete model setup)
def get_indexer():
    from .indexer import TransactionIndexer
    return TransactionIndexer

def get_event_processor():
    from .event_processor import EventProcessor
    return EventProcessor

__all__ = [
    "SolanaClient",
    "get_indexer",
    "get_event_processor",
    # Waterfall calculator
    "calculate_waterfall",
    "calculate_waterfall_scenarios",
    "WaterfallPosition",
    # Dilution calculator
    "calculate_dilution",
    "CurrentHolder",
    "SimulatedRound",
]
