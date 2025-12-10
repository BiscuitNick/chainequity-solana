/**
 * React hooks for ChainEquity API
 */
import { useState, useEffect, useCallback } from 'react'
import api, {
  TokenListResponse,
  TokenInfoResponse,
  BalanceResponse,
  TokenHolder,
  AllowlistEntry,
  VestingSchedule,
  DividendRound,
  Proposal,
  MultiSigConfigResponse,
  PendingTransactionResponse,
} from '@/lib/api'
import { useAppStore } from '@/stores/useAppStore'

// Generic hook for API calls with loading and error states
function useApiCall<T>(
  fetchFn: () => Promise<T>,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchFn()
      setData(result)
    } catch (e: any) {
      setError(e.detail || e.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, dependencies)

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

// Token hooks
export function useTokens() {
  const setTokens = useAppStore((state) => state.setTokens)

  const result = useApiCall(async () => {
    const tokens = await api.listTokens()
    // Transform to app store format - use token_id (business ID) not id (internal DB ID)
    const appTokens = tokens.map((t) => ({
      tokenId: t.token_id,
      symbol: t.symbol,
      name: t.name,
      mintAddress: t.mint_address,
      totalSupply: t.total_supply,
      isPaused: t.is_paused,
    }))
    setTokens(appTokens)
    return tokens
  }, [])

  return result
}

export function useTokenInfo(tokenId: number | null) {
  return useApiCall<TokenInfoResponse | null>(
    async () => {
      if (tokenId === null || tokenId === undefined) return null
      return api.getTokenInfo(tokenId)
    },
    [tokenId]
  )
}

export function useBalance(tokenId: number | null, address: string | null) {
  return useApiCall<BalanceResponse | null>(
    async () => {
      if (tokenId === null || tokenId === undefined || !address) return null
      return api.getBalance(tokenId, address)
    },
    [tokenId, address]
  )
}

export function useHolders(tokenId: number | null) {
  return useApiCall<TokenHolder[]>(
    async () => {
      if (tokenId === null || tokenId === undefined) return []
      return api.getHolders(tokenId)
    },
    [tokenId]
  )
}

// Allowlist hooks
export function useAllowlist(tokenId: number | null) {
  return useApiCall<AllowlistEntry[]>(
    async () => {
      if (tokenId === null || tokenId === undefined) return []
      return api.getAllowlist(tokenId)
    },
    [tokenId]
  )
}

export function useAddToAllowlist(tokenId: number | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addToAllowlist = async (address: string) => {
    if (tokenId === null || tokenId === undefined) return null
    setLoading(true)
    setError(null)
    try {
      const result = await api.addToAllowlist(tokenId, { address })
      return result
    } catch (e: any) {
      setError(e.detail || e.message || 'Failed to add to allowlist')
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { addToAllowlist, loading, error }
}

// Vesting hooks
export function useVestingSchedules(tokenId: number | null) {
  return useApiCall<VestingSchedule[]>(
    async () => {
      if (tokenId === null || tokenId === undefined) return []
      return api.getVestingSchedules(tokenId)
    },
    [tokenId]
  )
}

export function useReleaseVesting(tokenId: number | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const releaseVesting = async (scheduleId: string) => {
    if (tokenId === null || tokenId === undefined) return null
    setLoading(true)
    setError(null)
    try {
      const result = await api.releaseVestedTokens(tokenId, scheduleId)
      return result
    } catch (e: any) {
      setError(e.detail || e.message || 'Failed to release vested tokens')
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { releaseVesting, loading, error }
}

// Dividend hooks
export function useDividendRounds(tokenId: number | null) {
  return useApiCall<DividendRound[]>(
    async () => {
      if (tokenId === null || tokenId === undefined) return []
      return api.getDividendRounds(tokenId)
    },
    [tokenId]
  )
}

export function useRetryFailedDistributions(tokenId: number | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const retryFailed = async (roundId: number) => {
    if (tokenId === null || tokenId === undefined) return null
    setLoading(true)
    setError(null)
    try {
      const result = await api.retryFailedDistributions(tokenId, roundId)
      return result
    } catch (e: any) {
      setError(e.detail || e.message || 'Failed to retry distributions')
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { retryFailed, loading, error }
}

// Governance hooks
export function useProposals(tokenId: number | null, status?: string) {
  return useApiCall<Proposal[]>(
    async () => {
      if (tokenId === null || tokenId === undefined) return []
      return api.getProposals(tokenId, status)
    },
    [tokenId, status]
  )
}

export function useVote(tokenId: number | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vote = async (proposalId: number, voteChoice: 'for' | 'against' | 'abstain') => {
    if (tokenId === null || tokenId === undefined) return null
    setLoading(true)
    setError(null)
    try {
      const result = await api.vote(tokenId, proposalId, voteChoice)
      return result
    } catch (e: any) {
      setError(e.detail || e.message || 'Failed to vote')
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { vote, loading, error }
}

// Admin hooks
export function useMultiSigInfo(tokenId: number | null) {
  return useApiCall<MultiSigConfigResponse | null>(
    async () => {
      if (tokenId === null || tokenId === undefined) return null
      return api.getMultiSigInfo(tokenId)
    },
    [tokenId]
  )
}

export function usePendingTransactions(tokenId: number | null) {
  return useApiCall<PendingTransactionResponse[]>(
    async () => {
      if (tokenId === null || tokenId === undefined) return []
      return api.getPendingTransactions(tokenId)
    },
    [tokenId]
  )
}

export function useApproveTransaction(tokenId: number | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const approve = async (txId: string) => {
    if (tokenId === null || tokenId === undefined) return null
    setLoading(true)
    setError(null)
    try {
      const result = await api.approveTransaction(tokenId, txId)
      return result
    } catch (e: any) {
      setError(e.detail || e.message || 'Failed to approve transaction')
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { approve, loading, error }
}
