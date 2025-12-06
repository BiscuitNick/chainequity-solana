/**
 * ChainEquity React Hooks
 *
 * Export all hooks for easy importing
 */

// API hooks
export {
  useTokens,
  useTokenInfo,
  useBalance,
  useHolders,
  useAllowlist,
  useAddToAllowlist,
  useVestingSchedules,
  useReleaseVesting,
  useDividendRounds,
  useClaimDividend,
  useProposals,
  useVote,
  useMultiSigInfo,
  usePendingTransactions,
  useApproveTransaction,
} from './useApi'

// Solana wallet hooks
export {
  useSolanaWallet,
  useChainEquityPDAs,
} from './useSolana'

// WebSocket hooks
export {
  useWebSocket,
  useTransferEvents,
  useVestingEvents,
  useGovernanceEvents,
} from './useWebSocket'

export type { WebSocketChannel } from './useWebSocket'
