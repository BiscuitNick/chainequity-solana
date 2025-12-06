"""ChainEquity Backend Services"""
from .solana_client import SolanaClient

# Lazy imports for indexer (requires complete model setup)
def get_indexer():
    from .indexer import TransactionIndexer
    return TransactionIndexer

def get_event_processor():
    from .event_processor import EventProcessor
    return EventProcessor

__all__ = ["SolanaClient", "get_indexer", "get_event_processor"]
