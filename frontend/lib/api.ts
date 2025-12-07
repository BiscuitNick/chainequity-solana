/**
 * API Client for ChainEquity Backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

interface ApiError {
  detail: string
  status: number
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
    } catch (networkError) {
      // Network-level errors (connection refused, DNS failure, etc.)
      const error: ApiError = {
        detail: `Failed to connect to API at ${this.baseUrl}. Is the backend running?`,
        status: 0,
      }
      throw error
    }

    if (!response.ok) {
      const error: ApiError = {
        detail: 'An error occurred',
        status: response.status,
      }
      try {
        const data = await response.json()
        error.detail = data.detail || data.message || error.detail
      } catch {}
      throw error
    }

    return response.json()
  }

  // Health check
  async health() {
    return this.request<{ status: string; version: string; cluster: string }>('/health')
  }

  // Factory endpoints
  async getFactoryInfo() {
    return this.request<any>('/factory/info')
  }

  async getTemplates() {
    return this.request<any[]>('/factory/templates')
  }

  // Token endpoints
  async listTokens(skip = 0, limit = 20) {
    return this.request<TokenListResponse[]>(`/tokens?skip=${skip}&limit=${limit}`)
  }

  async getTokenInfo(tokenId: number) {
    return this.request<TokenInfoResponse>(`/tokens/${tokenId}/info`)
  }

  async getBalance(tokenId: number, address: string) {
    return this.request<BalanceResponse>(`/tokens/${tokenId}/balance/${address}`)
  }

  async getHolders(tokenId: number, skip = 0, limit = 50) {
    return this.request<TokenHolder[]>(`/tokens/${tokenId}/holders?skip=${skip}&limit=${limit}`)
  }

  // Allowlist endpoints
  async getAllowlist(tokenId: number, skip = 0, limit = 50) {
    return this.request<AllowlistEntry[]>(`/tokens/${tokenId}/allowlist?skip=${skip}&limit=${limit}`)
  }

  async addToAllowlist(tokenId: number, data: { address: string; kyc_level: number }) {
    return this.request<any>(`/tokens/${tokenId}/allowlist`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async approveWallet(tokenId: number, data: { address: string; kyc_level: number }) {
    return this.request<any>(`/tokens/${tokenId}/allowlist/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async revokeWallet(tokenId: number, address: string) {
    return this.request<any>(`/tokens/${tokenId}/allowlist/revoke`, {
      method: 'POST',
      body: JSON.stringify({ address }),
    })
  }

  async removeFromAllowlist(tokenId: number, address: string) {
    return this.request<any>(`/tokens/${tokenId}/allowlist/${address}`, {
      method: 'DELETE',
    })
  }

  // Token Issuance endpoints
  async getIssuances(tokenId: number) {
    return this.request<TokenIssuance[]>(`/tokens/${tokenId}/issuance`)
  }

  async getRecentIssuances(tokenId: number, limit = 10) {
    return this.request<TokenIssuance[]>(`/tokens/${tokenId}/issuance/recent?limit=${limit}`)
  }

  async getIssuanceStats(tokenId: number) {
    return this.request<IssuanceStatsResponse>(`/tokens/${tokenId}/issuance/stats`)
  }

  async issueTokens(tokenId: number, data: IssueTokensRequest) {
    return this.request<IssueTokensResponse>(`/tokens/${tokenId}/issuance`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async confirmIssuance(tokenId: number, issuanceId: number, txSignature?: string) {
    return this.request<any>(`/tokens/${tokenId}/issuance/${issuanceId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ tx_signature: txSignature }),
    })
  }

  // Cap Table endpoints
  async getCapTable(tokenId: number) {
    return this.request<CapTableResponse>(`/tokens/${tokenId}/captable`)
  }

  async exportCapTable(tokenId: number, format: 'csv' | 'pdf' = 'csv') {
    const response = await fetch(`${this.baseUrl}/tokens/${tokenId}/captable/export?format=${format}`)
    return response.blob()
  }

  // Transfer endpoints
  async getTransfers(tokenId: number, skip = 0, limit = 50) {
    return this.request<TransferListResponse>(`/tokens/${tokenId}/transfers?skip=${skip}&limit=${limit}`)
  }

  async getTransferStats(tokenId: number) {
    return this.request<TransferStatsResponse>(`/tokens/${tokenId}/transfers/stats`)
  }

  async getRecentTransfers(tokenId: number, limit = 10) {
    return this.request<Transfer[]>(`/tokens/${tokenId}/transfers/recent?limit=${limit}`)
  }

  // Vesting endpoints
  async getVestingSchedules(tokenId: number) {
    return this.request<VestingSchedule[]>(`/tokens/${tokenId}/vesting`)
  }

  async createVestingSchedule(tokenId: number, data: CreateVestingRequest) {
    return this.request<any>(`/tokens/${tokenId}/vesting`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async releaseVestedTokens(tokenId: number, scheduleId: string) {
    return this.request<any>(`/tokens/${tokenId}/vesting/${scheduleId}/release`, {
      method: 'POST',
    })
  }

  async terminateVesting(tokenId: number, scheduleId: string, data: TerminateVestingRequest) {
    return this.request<any>(`/tokens/${tokenId}/vesting/${scheduleId}/terminate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Dividend endpoints (Auto-distribution model)
  async getDividendRounds(tokenId: number) {
    return this.request<DividendRound[]>(`/tokens/${tokenId}/dividends`)
  }

  async createDividendRound(tokenId: number, data: CreateDividendRequest) {
    return this.request<DividendRound>(`/tokens/${tokenId}/dividends`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getDistributionProgress(tokenId: number, roundId: number) {
    return this.request<DistributionProgress>(`/tokens/${tokenId}/dividends/${roundId}/progress`)
  }

  async getDividendPayments(tokenId: number, roundId: number) {
    return this.request<DividendPayment[]>(`/tokens/${tokenId}/dividends/${roundId}/payments`)
  }

  async retryFailedDistributions(tokenId: number, roundId: number) {
    return this.request<{ message: string; count: number }>(`/tokens/${tokenId}/dividends/${roundId}/retry`, {
      method: 'POST',
    })
  }

  // Legacy endpoint for backwards compatibility
  async getDividendClaims(tokenId: number, roundId: number) {
    return this.request<DividendClaim[]>(`/tokens/${tokenId}/dividends/${roundId}/claims`)
  }

  // Governance endpoints
  async getProposals(tokenId: number, status?: string) {
    const query = status ? `?status=${status}` : ''
    return this.request<Proposal[]>(`/tokens/${tokenId}/governance/proposals${query}`)
  }

  async createProposal(tokenId: number, data: CreateProposalRequest) {
    return this.request<any>(`/tokens/${tokenId}/governance/proposals`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async vote(tokenId: number, proposalId: number, voteFor: boolean) {
    return this.request<any>(`/tokens/${tokenId}/governance/proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote_for: voteFor }),
    })
  }

  async executeProposal(tokenId: number, proposalId: number) {
    return this.request<any>(`/tokens/${tokenId}/governance/proposals/${proposalId}/execute`, {
      method: 'POST',
    })
  }

  async getVotingPower(tokenId: number, address: string) {
    return this.request<VotingPowerResponse>(`/tokens/${tokenId}/governance/voting-power/${address}`)
  }

  // Admin endpoints
  async getMultiSigInfo(tokenId: number) {
    return this.request<MultiSigConfigResponse>(`/tokens/${tokenId}/admin/multisig/config`)
  }

  async getPendingTransactions(tokenId: number) {
    return this.request<PendingTransactionResponse[]>(`/tokens/${tokenId}/admin/multisig/pending`)
  }

  async approveTransaction(tokenId: number, txId: string) {
    return this.request<any>(`/tokens/${tokenId}/admin/multisig/${txId}/sign`, {
      method: 'POST',
    })
  }

  async executeTransaction(tokenId: number, txId: string) {
    return this.request<any>(`/tokens/${tokenId}/admin/multisig/${txId}/execute`, {
      method: 'POST',
    })
  }

  async setPaused(tokenId: number, paused: boolean) {
    return this.request<any>(`/tokens/${tokenId}/admin/pause`, {
      method: 'POST',
      body: JSON.stringify({ paused }),
    })
  }

  // Corporate Actions endpoints
  async getCorporateActions(tokenId: number) {
    return this.request<CorporateAction[]>(`/tokens/${tokenId}/admin/corporate-actions`)
  }

  async executeStockSplit(tokenId: number, data: { numerator: number; denominator: number }) {
    return this.request<any>(`/tokens/${tokenId}/admin/execute-split`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async changeSymbol(tokenId: number, newSymbol: string) {
    return this.request<any>(`/tokens/${tokenId}/admin/change-symbol`, {
      method: 'POST',
      body: JSON.stringify({ new_symbol: newSymbol }),
    })
  }
}

// Types
export interface TokenListResponse {
  id: number
  token_id: number
  mint_address: string
  symbol: string
  name: string
  decimals: number
  total_supply: number
  is_paused: boolean
  created_at: string
}

export interface TokenInfoResponse extends TokenListResponse {
  on_chain_exists: boolean
  features?: Record<string, any>
  holder_count?: number
  transfer_count_24h?: number
  error?: string
}

export interface BalanceResponse {
  address: string
  token_id: number
  balance: number
  ui_balance: number
  vested_balance?: number
  available_balance?: number
}

export interface TokenHolder {
  address: string
  balance: number
  ui_balance: number
  percentage: number
}

export interface AllowlistEntry {
  address: string
  kyc_level: number
  status: 'pending' | 'active' | 'revoked'
  added_at?: string
  approved_at?: string
  approved_by?: string
}

export interface TokenIssuance {
  id: number
  recipient: string
  amount: number
  issued_by?: string
  notes?: string
  tx_signature?: string
  slot?: number
  status: 'pending' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
}

export interface IssueTokensRequest {
  recipient: string
  amount: number
  notes?: string
}

export interface IssueTokensResponse {
  message: string
  issuance_id: number
  recipient: string
  amount: number
  instruction: {
    program: string
    action: string
    data: Record<string, any>
  }
}

export interface CapTableEntry {
  wallet: string
  balance: number
  ownership_pct: number
  vested: number
  unvested: number
  lockout_until?: string
  daily_limit?: number
  status: string
}

export interface CapTableResponse {
  slot: number
  timestamp: string
  total_supply: number
  holder_count: number
  holders: CapTableEntry[]
}

export interface Transfer {
  id: number
  signature: string
  from_wallet: string
  to_wallet: string
  amount: number
  slot: number
  block_time: string
  status: string
  failure_reason?: string
  created_at: string
}

export interface TransferListResponse {
  transfers: Transfer[]
  total: number
  skip: number
  limit: number
}

export interface TransferStatsResponse {
  total_transfers: number
  transfers_24h: number
  volume_24h: number
}

export interface IssuanceStatsResponse {
  total_issuances: number
  issuances_24h: number
  volume_24h: number
}

export interface VestingSchedule {
  id: string
  beneficiary: string
  total_amount: number
  released_amount: number
  vested_amount: number
  start_time: string
  cliff_duration: number
  total_duration: number
  vesting_type: string
  revocable: boolean
  is_terminated: boolean
  termination_type?: string
  terminated_at?: string
}

export interface CreateVestingRequest {
  beneficiary: string
  total_amount: number
  start_time: number
  cliff_seconds: number
  duration_seconds: number
  vesting_type: string
  revocable: boolean
}

export interface TerminateVestingRequest {
  termination_type: 'standard' | 'for_cause' | 'accelerated'
  notes?: string
}

export interface DividendRound {
  id: number
  round_number: number
  payment_token: string
  total_pool: number
  amount_per_share: number
  snapshot_slot: number
  status: 'pending' | 'distributing' | 'completed' | 'failed'
  created_at: string
  distributed_at?: string
  total_recipients: number
  total_batches: number
  completed_batches: number
  total_distributed: number
  distribution_count: number
}

export interface DividendPayment {
  id: number
  round_id: number
  wallet: string
  shares: number
  amount: number
  status: 'pending' | 'sent' | 'failed'
  batch_number: number
  created_at: string
  distributed_at?: string
  signature?: string
  error_message?: string
  dividend_per_share: number
}

// Legacy alias for backwards compatibility
export type DividendClaim = DividendPayment

export interface DistributionProgress {
  round_id: number
  status: string
  total_recipients: number
  total_batches: number
  completed_batches: number
  successful_payments: number
  failed_payments: number
  pending_payments: number
  total_distributed: number
  total_pool: number
}

export interface CreateDividendRequest {
  total_pool: number
  payment_token: string
}

export interface UnclaimedDividendsResponse {
  total_unclaimed: number
  rounds: DividendRound[]
}

export interface Proposal {
  id: number
  proposal_number: number
  proposer: string
  action_type: string
  action_data: Record<string, any>
  description?: string
  votes_for: number
  votes_against: number
  votes_abstain: number
  status: string
  voting_starts: string
  voting_ends: string
  executed_at?: string
  quorum_reached: boolean
  approval_reached: boolean
  can_execute: boolean
}

export interface CreateProposalRequest {
  title: string
  description: string
  action_type: string
  action_data?: Record<string, any>
  voting_period_days: number
}

export interface VotingPowerResponse {
  address: string
  balance: number
  voting_power: number
  delegated_to?: string | null
}

export interface MultiSigConfigResponse {
  signers: string[]
  threshold: number
  nonce: number
}

export interface PendingTransactionResponse {
  id: string
  instruction_type: string
  instruction_data: Record<string, any>
  signers_approved: string[]
  signers_pending: string[]
  created_at: string
  expires_at?: string
}

// Legacy types for frontend compatibility
export interface MultiSigInfo {
  signers: { address: string; name?: string }[]
  threshold: number
  transaction_count: number
}

export interface PendingTransaction {
  id: number
  type: string
  description: string
  approvals: number
  threshold: number
  proposed_by: string
  proposed_at: string
  deadline?: string
}

export interface CorporateAction {
  id: number
  action_type: 'stock_split' | 'reverse_split' | 'symbol_change'
  action_data: Record<string, any>
  executed_at: string
  executed_by: string
  signature?: string
  slot?: number
}

// Export singleton instance
export const api = new ApiClient()

export default api
