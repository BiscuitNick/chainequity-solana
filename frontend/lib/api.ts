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

  // Get current Solana slot (endpoint is at root, not under /api/v1)
  async getCurrentSlot() {
    const url = this.baseUrl.replace('/api/v1', '') + '/slot'
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('Failed to fetch current slot')
    }
    return response.json() as Promise<{ slot: number | null; cluster: string; error?: string }>
  }

  // Factory endpoints
  async getFactoryInfo() {
    return this.request<any>('/factory/info')
  }

  async getTemplates() {
    return this.request<any[]>('/factory/templates')
  }

  async createToken(data: CreateTokenRequest): Promise<CreateTokenResponseData> {
    return this.request<CreateTokenResponseData>('/factory/tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Token endpoints
  async listTokens(skip = 0, limit = 20) {
    return this.request<TokenListResponse[]>(`/tokens/?skip=${skip}&limit=${limit}`)
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

  async addToAllowlist(tokenId: number, data: { address: string }) {
    return this.request<any>(`/tokens/${tokenId}/allowlist`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async approveWallet(tokenId: number, data: { address: string }) {
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

  async getRecentIssuances(tokenId: number, limit = 10, maxSlot?: number) {
    let url = `/tokens/${tokenId}/issuance/recent?limit=${limit}`
    if (maxSlot !== undefined) {
      url += `&max_slot=${maxSlot}`
    }
    return this.request<TokenIssuance[]>(url)
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
  async getCapTable(tokenId: number, slot?: number) {
    if (slot !== undefined) {
      return this.request<CapTableResponse>(`/tokens/${tokenId}/captable/at/${slot}`)
    }
    return this.request<CapTableResponse>(`/tokens/${tokenId}/captable`)
  }

  async getCapTableSnapshots(tokenId: number) {
    return this.request<CapTableSnapshot[]>(`/tokens/${tokenId}/captable/snapshots`)
  }

  // V2 Snapshot endpoints (full historical reconstruction)
  async getCapTableSnapshotsV2(tokenId: number, limit = 100) {
    return this.request<CapTableSnapshotV2[]>(`/tokens/${tokenId}/captable/snapshots/v2?limit=${limit}`)
  }

  async getCapTableSnapshotV2AtSlot(tokenId: number, slot: number) {
    return this.request<CapTableSnapshotV2Detail>(`/tokens/${tokenId}/captable/snapshots/v2/${slot}`)
  }

  async createCapTableSnapshotV2(tokenId: number, trigger = 'manual') {
    return this.request<CapTableSnapshotV2>(`/tokens/${tokenId}/captable/snapshots/v2`, {
      method: 'POST',
      body: JSON.stringify({ trigger }),
    })
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

  async getRecentTransfers(tokenId: number, limit = 10, maxSlot?: number) {
    let url = `/tokens/${tokenId}/transfers/recent?limit=${limit}`
    if (maxSlot !== undefined) {
      url += `&max_slot=${maxSlot}`
    }
    return this.request<Transfer[]>(url)
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

  async vote(tokenId: number, proposalId: number, voteChoice: 'for' | 'against' | 'abstain', voterAddress?: string) {
    return this.request<any>(`/tokens/${tokenId}/governance/proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote: voteChoice, voter: voterAddress }),
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

  async updateMultiSigThreshold(tokenId: number, threshold: number) {
    return this.request<any>(`/tokens/${tokenId}/admin/multisig/threshold`, {
      method: 'POST',
      body: JSON.stringify({ threshold }),
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

  // ==================== Investment Modeling Endpoints ====================

  // Share Classes
  async getShareClasses(tokenId: number) {
    return this.request<ShareClass[]>(`/tokens/${tokenId}/share-classes`)
  }

  async createShareClass(tokenId: number, data: CreateShareClassRequest) {
    return this.request<ShareClass>(`/tokens/${tokenId}/share-classes`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getShareClass(tokenId: number, shareClassId: number) {
    return this.request<ShareClass>(`/tokens/${tokenId}/share-classes/${shareClassId}`)
  }

  async deleteShareClass(tokenId: number, shareClassId: number) {
    return this.request<{ message: string }>(`/tokens/${tokenId}/share-classes/${shareClassId}`, {
      method: 'DELETE',
    })
  }

  async getSharePositions(tokenId: number, shareClassId: number) {
    return this.request<SharePosition[]>(`/tokens/${tokenId}/share-classes/${shareClassId}/positions`)
  }

  async getRecentSharePositions(tokenId: number, limit = 10, maxSlot?: number) {
    let url = `/tokens/${tokenId}/share-classes/positions/recent?limit=${limit}`
    if (maxSlot !== undefined) {
      url += `&max_slot=${maxSlot}`
    }
    return this.request<SharePosition[]>(url)
  }

  // Unified Transactions API
  async getUnifiedTransactions(tokenId: number, limit = 50, maxSlot?: number) {
    let url = `/tokens/${tokenId}/transactions/?limit=${limit}`
    if (maxSlot !== undefined) {
      url += `&to_slot=${maxSlot}`
    }
    return this.request<UnifiedTransaction[]>(url)
  }

  async issueShares(tokenId: number, data: IssueSharesRequest) {
    return this.request<IssueSharesResponse>(`/tokens/${tokenId}/share-classes/issue`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Funding Rounds
  async getFundingRounds(tokenId: number) {
    return this.request<FundingRound[]>(`/tokens/${tokenId}/funding-rounds`)
  }

  async createFundingRound(tokenId: number, data: CreateFundingRoundRequest) {
    return this.request<FundingRound>(`/tokens/${tokenId}/funding-rounds`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getFundingRound(tokenId: number, roundId: number) {
    return this.request<FundingRound>(`/tokens/${tokenId}/funding-rounds/${roundId}`)
  }

  async addInvestment(tokenId: number, roundId: number, data: AddInvestmentRequest) {
    return this.request<Investment>(`/tokens/${tokenId}/funding-rounds/${roundId}/investments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getRoundInvestments(tokenId: number, roundId: number) {
    return this.request<Investment[]>(`/tokens/${tokenId}/funding-rounds/${roundId}/investments`)
  }

  async closeFundingRound(tokenId: number, roundId: number) {
    return this.request<FundingRound>(`/tokens/${tokenId}/funding-rounds/${roundId}/close`, {
      method: 'POST',
    })
  }

  // Convertible Instruments
  async getConvertibles(tokenId: number) {
    return this.request<ConvertibleInstrument[]>(`/tokens/${tokenId}/convertibles`)
  }

  async createConvertible(tokenId: number, data: CreateConvertibleRequest) {
    return this.request<ConvertibleInstrument>(`/tokens/${tokenId}/convertibles`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getConvertible(tokenId: number, convertibleId: number) {
    return this.request<ConvertibleInstrument>(`/tokens/${tokenId}/convertibles/${convertibleId}`)
  }

  async convertInstrument(tokenId: number, convertibleId: number, roundId: number) {
    return this.request<ConvertibleInstrument>(`/tokens/${tokenId}/convertibles/${convertibleId}/convert`, {
      method: 'POST',
      body: JSON.stringify({ funding_round_id: roundId }),
    })
  }

  async cancelConvertible(tokenId: number, convertibleId: number) {
    return this.request<ConvertibleInstrument>(`/tokens/${tokenId}/convertibles/${convertibleId}/cancel`, {
      method: 'POST',
    })
  }

  async cancelFundingRound(tokenId: number, roundId: number) {
    return this.request<FundingRound>(`/tokens/${tokenId}/funding-rounds/${roundId}/cancel`, {
      method: 'POST',
    })
  }

  async removeInvestment(tokenId: number, roundId: number, investmentId: number) {
    return this.request<void>(`/tokens/${tokenId}/funding-rounds/${roundId}/investments/${investmentId}`, {
      method: 'DELETE',
    })
  }

  // Valuations
  async getValuationHistory(tokenId: number) {
    return this.request<ValuationEvent[]>(`/tokens/${tokenId}/valuations`)
  }

  async createValuation(tokenId: number, data: CreateValuationRequest) {
    return this.request<ValuationEvent>(`/tokens/${tokenId}/valuations`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getCurrentValuation(tokenId: number) {
    return this.request<{ valuation: number; price_per_share: number; last_updated: string | null }>(
      `/tokens/${tokenId}/valuations/current`
    )
  }

  // Enhanced Cap Table
  async getEnhancedCapTable(tokenId: number, slot?: number) {
    let url = `/tokens/${tokenId}/captable/enhanced`
    if (slot !== undefined) {
      url += `?slot=${slot}`
    }
    return this.request<EnhancedCapTableResponse>(url)
  }

  async getEnhancedCapTableByWallet(tokenId: number, slot?: number) {
    let url = `/tokens/${tokenId}/captable/enhanced/by-wallet`
    if (slot !== undefined) {
      url += `?slot=${slot}`
    }
    return this.request<EnhancedCapTableByWalletResponse>(url)
  }

  // Simulators
  async simulateWaterfall(tokenId: number, exitAmount: number) {
    return this.request<WaterfallResponse>(`/tokens/${tokenId}/simulator/waterfall`, {
      method: 'POST',
      body: JSON.stringify({ exit_amount: exitAmount }),
    })
  }

  async simulateWaterfallScenarios(tokenId: number, exitAmounts: number[]) {
    return this.request<{ scenarios: WaterfallResponse[] }>(`/tokens/${tokenId}/simulator/waterfall/scenarios`, {
      method: 'POST',
      body: JSON.stringify({ exit_amounts: exitAmounts }),
    })
  }

  async simulateDilution(tokenId: number, rounds: SimulatedRoundInput[]) {
    return this.request<DilutionResponse>(`/tokens/${tokenId}/simulator/dilution`, {
      method: 'POST',
      body: JSON.stringify({ rounds }),
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

export interface CapTableSnapshot {
  slot: number
  timestamp: string
  holder_count: number
}

export interface CapTableSnapshotV2 {
  id: number
  slot: number
  timestamp: string | null
  total_supply: number
  holder_count: number
  total_shares: number
  trigger: string
}

export interface CapTableSnapshotV2Detail extends CapTableSnapshotV2 {
  token_state: Record<string, any>
  holders: Array<{ wallet: string; balance: number; status: string }>
  share_positions: Array<Record<string, any>>
  vesting_schedules: Array<Record<string, any>>
  share_classes: Array<Record<string, any>>
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

export interface VestingShareClassInfo {
  id: number
  name: string
  symbol: string
  priority: number
  preference_multiple: number
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
  share_class_id?: number
  share_class?: VestingShareClassInfo
  cost_basis: number
  price_per_share: number
  preference_amount: number
}

export interface CreateVestingRequest {
  beneficiary: string
  total_amount: number
  start_time: number
  cliff_seconds: number
  duration_seconds: number
  vesting_type: string
  revocable: boolean
  share_class_id?: number
  cost_basis?: number
  price_per_share?: number
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
  voting_period_days?: number
  voting_period_minutes?: number
  proposer?: string
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

// Unified Transaction Type
export interface UnifiedTransaction {
  id: number
  token_id: number
  slot: number
  tx_type: string
  wallet: string | null
  wallet_to: string | null
  amount: number | null
  amount_secondary: number | null
  share_class_id: number | null
  priority: number | null
  preference_multiple: number | null
  reference_id: number | null
  reference_type: string | null
  data: Record<string, any> | null
  triggered_by: string | null
  notes: string | null
  tx_signature: string | null
  created_at: string
}

// Investment Modeling Types
export type RoundType = 'pre_seed' | 'seed' | 'series_a' | 'series_b' | 'series_c' | 'bridge' | 'other'
export type InstrumentType = 'safe' | 'convertible_note'
export type SafeType = 'pre_money' | 'post_money'
export type InstrumentStatus = 'outstanding' | 'converted' | 'cancelled'
export type RoundStatus = 'open' | 'closed' | 'cancelled'

export interface ShareClass {
  id: number
  token_id: number
  name: string
  symbol: string
  priority: number
  preference_multiple: number
  created_at: string
}

export interface SharePosition {
  id?: number
  token_id?: number
  wallet: string
  share_class_id?: number
  share_class: ShareClass
  shares: number
  cost_basis: number
  price_per_share: number
  current_value?: number
  preference_amount?: number
  slot?: number  // Solana slot at time of issuance
  acquired_date?: string
  acquired_at?: string  // Backend uses this name
  funding_round_id?: number
  notes?: string
}

export interface FundingRound {
  id: number
  token_id?: number
  name: string
  round_type: string
  share_class_id?: number
  share_class?: ShareClass
  pre_money_valuation: number
  amount_raised: number
  post_money_valuation: number
  price_per_share: number
  shares_issued: number
  status: string
  investments?: FundingRoundInvestment[]
  created_at: string
  closed_at?: string
  notes?: string
}

export interface FundingRoundInvestment {
  id: number
  investor_wallet: string
  investor_name?: string
  amount: number
  shares_received: number
  price_per_share: number
  status: string
  tx_signature?: string
  created_at: string
}

export interface Investment {
  id: number
  funding_round_id: number
  investor_wallet: string
  amount_invested: number
  shares_issued: number
  price_per_share: number
  invested_at: string
  notes?: string
}

export interface ConvertibleInstrument {
  id: number
  token_id?: number
  instrument_type: InstrumentType
  name?: string
  holder_wallet: string
  holder_name?: string
  principal_amount: number
  accrued_amount: number  // Principal + interest
  valuation_cap?: number
  discount_rate?: number
  interest_rate?: number
  maturity_date?: string
  safe_type?: SafeType
  status: InstrumentStatus
  converted_at?: string
  shares_received?: number
  conversion_price?: number
  created_at: string
}

export interface ValuationEvent {
  id: number
  token_id: number
  valuation: number
  price_per_share: number
  event_type: string
  trigger_id?: string
  notes?: string
  created_at: string
}

// Enhanced Cap Table Types
export interface ShareClassSummary {
  id: number
  name: string
  symbol: string
  priority: number
  preference_multiple: number
  total_shares: number
  total_value: number
  holder_count: number
}

export interface EnhancedCapTableEntry {
  wallet: string
  share_class_id: number
  share_class_name: string
  share_class_symbol: string
  shares: number
  cost_basis: number
  current_value: number
  ownership_pct: number
  class_ownership_pct: number
  unrealized_gain: number
  price_per_share: number
  preference_amount: number
}

export interface EnhancedCapTableResponse {
  slot: number
  timestamp: string
  current_valuation: number
  price_per_share: number
  last_valuation_date?: string
  total_shares: number
  total_cost_basis: number
  total_current_value: number
  holder_count: number
  share_classes: ShareClassSummary[]
  positions: EnhancedCapTableEntry[]
}

export interface WalletSummary {
  wallet: string
  total_shares: number
  total_cost_basis: number
  total_current_value: number
  total_ownership_pct: number
  total_unrealized_gain: number
  positions: EnhancedCapTableEntry[]
}

export interface EnhancedCapTableByWalletResponse {
  slot: number
  timestamp: string
  current_valuation: number
  price_per_share: number
  total_shares: number
  holder_count: number
  wallets: WalletSummary[]
}

// Waterfall Types
export interface WaterfallPayout {
  wallet: string
  share_class_name: string
  priority: number
  shares: number
  cost_basis: number
  preference_amount: number
  payout: number
  payout_source: 'preference' | 'partial_preference' | 'none'
}

export interface WaterfallTier {
  priority: number
  total_preference: number
  amount_available: number
  amount_distributed: number
  fully_satisfied: boolean
  payouts: WaterfallPayout[]
}

export interface WaterfallResponse {
  exit_amount: number
  total_shares: number
  remaining_amount: number
  tiers: WaterfallTier[]
  payouts_by_wallet: Record<string, number>
}

// Dilution Types
export interface SimulatedRoundInput {
  name: string
  pre_money_valuation: number
  amount_raised: number
}

export interface DilutedPosition {
  wallet: string
  shares_before: number
  shares_after: number
  ownership_before: number
  ownership_after: number
  dilution_pct: number
  value_before: number
  value_after: number
}

export interface NewInvestor {
  round_name: string
  amount_invested: number
  shares_received: number
  ownership_pct: number
  price_per_share: number
}

export interface DilutionResponse {
  rounds: Array<{
    name: string
    pre_money_valuation: number
    amount_raised: number
    post_money_valuation: number
  }>
  before: {
    total_shares: number
    valuation: number
    price_per_share: number
  }
  after: {
    total_shares: number
    valuation: number
    price_per_share: number
  }
  existing_holders: DilutedPosition[]
  new_investors: NewInvestor[]
}

// Request Types
export interface CreateShareClassRequest {
  name: string
  symbol: string
  priority: number
  preference_multiple: number
}

export interface CreateFundingRoundRequest {
  name: string
  round_type: RoundType
  share_class_id: number
  pre_money_valuation: number
  notes?: string
}

export interface AddInvestmentRequest {
  investor_wallet: string
  investor_name?: string
  amount: number  // In cents
}

export interface CreateConvertibleRequest {
  instrument_type: InstrumentType
  name?: string
  holder_wallet: string
  holder_name?: string
  principal_amount: number  // In cents
  valuation_cap?: number  // In cents
  discount_rate?: number  // 0.20 = 20%
  interest_rate?: number  // 0.05 = 5% (for notes)
  maturity_date?: string  // For notes
  safe_type?: SafeType  // For SAFEs
  notes?: string
}

export interface CreateValuationRequest {
  valuation: number
  notes?: string
}

export interface IssueSharesRequest {
  recipient_wallet: string
  share_class_id: number
  shares: number
  cost_basis?: number  // In cents
  price_per_share?: number  // In cents
  notes?: string
}

export interface IssueSharesResponse {
  id: number
  recipient_wallet: string
  share_class: ShareClass
  shares: number
  cost_basis: number
  price_per_share: number
  notes?: string
  created_at: string
}

export interface WaterfallRequest {
  exit_amount: number
}

export interface DilutionRequest {
  rounds: SimulatedRoundInput[]
}

// Token creation types
export interface TokenFeaturesRequest {
  vesting_enabled: boolean
  governance_enabled: boolean
  dividends_enabled: boolean
  transfer_restrictions_enabled: boolean
  upgradeable: boolean
}

export interface CreateTokenRequest {
  symbol: string
  name: string
  decimals: number
  initial_supply: number
  features: TokenFeaturesRequest
  admin_signers: string[]
  admin_threshold: number
  template_id?: number
}

export interface CreateTokenResponseData {
  token_id: number
  mint_address: string
  transaction_signature: string
}

// Export singleton instance
export const api = new ApiClient()

export default api
