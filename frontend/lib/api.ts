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

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

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

  async removeFromAllowlist(tokenId: number, address: string) {
    return this.request<any>(`/tokens/${tokenId}/allowlist/${address}`, {
      method: 'DELETE',
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

  // Dividend endpoints
  async getDividendRounds(tokenId: number) {
    return this.request<DividendRound[]>(`/tokens/${tokenId}/dividends`)
  }

  async createDividendRound(tokenId: number, data: CreateDividendRequest) {
    return this.request<any>(`/tokens/${tokenId}/dividends`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async claimDividend(tokenId: number, roundId: number) {
    return this.request<any>(`/tokens/${tokenId}/dividends/${roundId}/claim`, {
      method: 'POST',
    })
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

  // Admin endpoints
  async getMultiSigInfo(tokenId: number) {
    return this.request<MultiSigInfo>(`/tokens/${tokenId}/admin/multisig`)
  }

  async getPendingTransactions(tokenId: number) {
    return this.request<PendingTransaction[]>(`/tokens/${tokenId}/admin/transactions`)
  }

  async approveTransaction(tokenId: number, txId: number) {
    return this.request<any>(`/tokens/${tokenId}/admin/transactions/${txId}/approve`, {
      method: 'POST',
    })
  }

  async executeTransaction(tokenId: number, txId: number) {
    return this.request<any>(`/tokens/${tokenId}/admin/transactions/${txId}/execute`, {
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
    return this.request<any>(`/tokens/${tokenId}/admin/stock-split`, {
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
  mint_address: string
  symbol: string
  name: string
  decimals: number
  total_supply: number
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
  status: 'active' | 'pending' | 'revoked'
  added_at: string
  added_by: string
}

export interface CapTableResponse {
  total_supply: number
  holder_count: number
  holders: TokenHolder[]
  ownership_by_type: Record<string, number>
}

export interface VestingSchedule {
  id: string
  beneficiary: string
  total_amount: number
  released_amount: number
  start_time: string
  cliff_duration: number
  total_duration: number
  vesting_type: 'linear' | 'cliff_then_linear' | 'stepped'
  status: 'active' | 'terminated' | 'completed'
  termination_type?: 'standard' | 'for_cause' | 'accelerated'
}

export interface CreateVestingRequest {
  beneficiary: string
  total_amount: number
  start_time: number
  cliff_duration: number
  total_duration: number
  vesting_type: string
  revocable: boolean
}

export interface TerminateVestingRequest {
  termination_type: 'standard' | 'for_cause' | 'accelerated'
  notes?: string
}

export interface DividendRound {
  id: number
  total_pool: number
  amount_per_share: number
  payment_token: string
  status: 'pending' | 'active' | 'completed'
  created_at: string
  expires_at?: string
  claimed_count: number
  total_eligible: number
}

export interface CreateDividendRequest {
  total_pool: number
  payment_token: string
  expires_at?: string
}

export interface Proposal {
  id: number
  title: string
  description: string
  proposer: string
  status: 'active' | 'passed' | 'rejected' | 'executed'
  votes_for: number
  votes_against: number
  quorum: number
  end_date: string
  execution_deadline?: string
}

export interface CreateProposalRequest {
  title: string
  description: string
  action_type: string
  action_data?: Record<string, any>
  voting_period_days: number
}

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
