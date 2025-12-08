'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, ThumbsUp, ThumbsDown, Minus, Clock, CheckCircle, XCircle, RefreshCw, Vote, Wallet } from 'lucide-react'
import { api, Proposal } from '@/lib/api'
import { useSolanaWallet } from '@/hooks/useSolana'

// Governance action types
const GOVERNANCE_ACTIONS = [
  { value: 'add_to_allowlist', label: 'Add to Allowlist', requiresWallet: true },
  { value: 'remove_from_allowlist', label: 'Remove from Allowlist', requiresWallet: true },
  { value: 'update_daily_limit', label: 'Update Daily Transfer Limit', requiresWallet: true, requiresAmount: true },
  { value: 'update_global_limit', label: 'Update Global Transfer Limit', requiresAmount: true },
  { value: 'initiate_dividend', label: 'Initiate Dividend', requiresAmount: true, requiresToken: true },
  { value: 'stock_split', label: 'Stock Split', requiresMultiplier: true },
  { value: 'symbol_change', label: 'Change Symbol', requiresSymbol: true },
  { value: 'pause_transfers', label: 'Pause Transfers' },
  { value: 'unpause_transfers', label: 'Unpause Transfers' },
  { value: 'add_multisig_signer', label: 'Add Multisig Signer', requiresWallet: true },
  { value: 'remove_multisig_signer', label: 'Remove Multisig Signer', requiresWallet: true },
  { value: 'update_threshold', label: 'Update Multisig Threshold', requiresThreshold: true },
]

export default function GovernancePage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const { isConnected, publicKey } = useSolanaWallet()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'passed' | 'rejected'>('all')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [votingPower, setVotingPower] = useState<number>(0)

  // Create proposal form state
  const [actionType, setActionType] = useState('')
  const [description, setDescription] = useState('')
  const [targetWallet, setTargetWallet] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentToken, setPaymentToken] = useState('')
  const [multiplier, setMultiplier] = useState('2')
  const [newSymbol, setNewSymbol] = useState('')
  const [threshold, setThreshold] = useState('2')
  const [votingPeriodDays, setVotingPeriodDays] = useState('3')
  const [submitting, setSubmitting] = useState(false)

  const fetchProposals = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getProposals(selectedToken.tokenId, filter === 'all' ? undefined : filter)
      setProposals(data)
    } catch (e: any) {
      console.error('Failed to fetch proposals:', e)
      setError(e.detail || 'Failed to fetch proposals')
      setProposals([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProposals()
  }, [selectedToken, filter])

  const handleVote = async (proposalId: number, voteType: 'for' | 'against' | 'abstain') => {
    if (!selectedToken) return
    if (!isConnected || !publicKey) {
      setError('Please connect your wallet to vote')
      return
    }
    try {
      await api.vote(selectedToken.tokenId, proposalId, voteType, publicKey.toString())
      fetchProposals()
    } catch (e: any) {
      console.error('Failed to vote:', e)
      setError(e.detail || 'Failed to vote')
    }
  }

  const resetForm = () => {
    setActionType('')
    setDescription('')
    setTargetWallet('')
    setAmount('')
    setPaymentToken('')
    setMultiplier('2')
    setNewSymbol('')
    setThreshold('2')
    setVotingPeriodDays('3')
  }

  const handleCreateProposal = async () => {
    if (!selectedToken || !actionType || !description) return
    if (!isConnected || !publicKey) {
      setError('Please connect your wallet to create a proposal')
      return
    }

    setSubmitting(true)
    setError(null)

    const selectedAction = GOVERNANCE_ACTIONS.find(a => a.value === actionType)
    if (!selectedAction) return

    // Build action_data based on action type
    const actionData: Record<string, any> = {}
    if (selectedAction.requiresWallet) actionData.wallet = targetWallet
    if (selectedAction.requiresAmount) actionData.amount = parseInt(amount) || 0
    if (selectedAction.requiresToken) actionData.token = paymentToken
    if (selectedAction.requiresMultiplier) actionData.multiplier = parseInt(multiplier) || 2
    if (selectedAction.requiresSymbol) actionData.new_symbol = newSymbol
    if (selectedAction.requiresThreshold) actionData.new_threshold = parseInt(threshold) || 2

    // Parse voting period - support both minutes and days
    let voting_period_days: number | undefined
    let voting_period_minutes: number | undefined

    if (votingPeriodDays.endsWith('m')) {
      // Minutes format: "5m", "15m", etc.
      voting_period_minutes = parseInt(votingPeriodDays.replace('m', '')) || 5
    } else if (votingPeriodDays.endsWith('h')) {
      // Hours format: "1h" = 60 minutes
      voting_period_minutes = (parseInt(votingPeriodDays.replace('h', '')) || 1) * 60
    } else {
      // Days format: "1", "3", etc.
      voting_period_days = parseInt(votingPeriodDays) || 3
    }

    try {
      await api.createProposal(selectedToken.tokenId, {
        title: `${selectedAction.label} Proposal`,
        description,
        action_type: actionType,
        action_data: actionData,
        voting_period_days,
        voting_period_minutes,
        proposer: publicKey.toString(),
      })
      setShowCreateModal(false)
      resetForm()
      fetchProposals()
    } catch (e: any) {
      console.error('Failed to create proposal:', e)
      setError(e.detail || 'Failed to create proposal')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedAction = GOVERNANCE_ACTIONS.find(a => a.value === actionType)

  const handleExecute = async (proposalId: number) => {
    if (!selectedToken) return
    try {
      await api.executeProposal(selectedToken.tokenId, proposalId)
      fetchProposals()
    } catch (e: any) {
      console.error('Failed to execute proposal:', e)
      setError(e.detail || 'Failed to execute proposal')
    }
  }

  const statusIcons: Record<string, JSX.Element> = {
    pending: <Clock className="h-4 w-4 text-gray-500" />,
    active: <Clock className="h-4 w-4 text-yellow-500" />,
    passed: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
    executed: <CheckCircle className="h-4 w-4 text-blue-500" />,
    cancelled: <XCircle className="h-4 w-4 text-gray-500" />,
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-gray-500/10 text-gray-500',
    active: 'bg-yellow-500/10 text-yellow-500',
    passed: 'bg-green-500/10 text-green-500',
    failed: 'bg-red-500/10 text-red-500',
    executed: 'bg-blue-500/10 text-blue-500',
    cancelled: 'bg-gray-500/10 text-gray-500',
  }

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to view governance
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Governance</h1>
          <p className="text-muted-foreground">
            Vote on proposals for {selectedToken.symbol}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchProposals} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)} disabled={!isConnected}>
            <Plus className="h-4 w-4 mr-2" />
            Create Proposal
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Wallet Connection Warning */}
      {!isConnected && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Wallet className="h-6 w-6 text-yellow-500" />
              <div>
                <p className="font-medium text-yellow-500">Wallet Not Connected</p>
                <p className="text-sm text-muted-foreground">
                  Connect your wallet to create proposals and vote. You can still view existing proposals.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voting Power Card */}
      {isConnected && votingPower > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Vote className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Your Voting Power</p>
                  <p className="text-2xl font-bold">{votingPower.toLocaleString()} votes</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Based on your {selectedToken?.symbol} balance
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Proposals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : proposals.filter(p => p.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Passed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {loading ? '...' : proposals.filter(p => p.status === 'passed' || p.status === 'executed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {loading ? '...' : proposals.filter(p => p.status === 'failed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Proposals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : proposals.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Proposals</CardTitle>
            <div className="flex gap-2">
              {(['all', 'active', 'passed', 'rejected'] as const).map((status) => (
                <Button
                  key={status}
                  variant={filter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(status)}
                  className="capitalize"
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : proposals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No proposals found
            </p>
          ) : (
            <div className="space-y-4">
              {proposals.map((proposal) => {
                const totalVotes = proposal.votes_for + proposal.votes_against + proposal.votes_abstain
                const forPercentage = totalVotes > 0 ? (proposal.votes_for / totalVotes) * 100 : 0

                return (
                  <div key={proposal.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {statusIcons[proposal.status] || <Clock className="h-4 w-4" />}
                          <h3 className="font-semibold">Proposal #{proposal.proposal_number}: {proposal.action_type}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs capitalize ${statusColors[proposal.status]}`}>
                            {proposal.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{proposal.description || JSON.stringify(proposal.action_data)}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Proposed by: {proposal.proposer.slice(0, 4)}...{proposal.proposer.slice(-4)}</span>
                          <span>Ends: {new Date(proposal.voting_ends).toLocaleDateString()}</span>
                          {proposal.executed_at && (
                            <span>Executed: {new Date(proposal.executed_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3 text-green-500" />
                          For: {proposal.votes_for.toLocaleString()} ({forPercentage.toFixed(1)}%)
                        </span>
                        <span className="flex items-center gap-1">
                          <ThumbsDown className="h-3 w-3 text-red-500" />
                          Against: {proposal.votes_against.toLocaleString()} ({(100 - forPercentage).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-3 flex overflow-hidden">
                        <div
                          className="bg-green-500 h-3 transition-all"
                          style={{ width: `${forPercentage}%` }}
                        />
                        <div
                          className="bg-red-500 h-3 transition-all"
                          style={{ width: `${100 - forPercentage}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>Total votes: {totalVotes.toLocaleString()}</span>
                        <span className={proposal.quorum_reached ? 'text-green-500' : 'text-yellow-500'}>
                          Quorum: {proposal.quorum_reached ? 'Reached' : 'Not reached'}
                        </span>
                      </div>
                    </div>

                    {proposal.status === 'active' && (
                      <div className="mt-4 flex gap-2 items-center">
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600"
                          onClick={() => handleVote(proposal.id, 'for')}
                          disabled={!isConnected}
                        >
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          Vote For
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 border-red-500 hover:bg-red-500/10"
                          onClick={() => handleVote(proposal.id, 'against')}
                          disabled={!isConnected}
                        >
                          <ThumbsDown className="h-3 w-3 mr-1" />
                          Vote Against
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleVote(proposal.id, 'abstain')}
                          disabled={!isConnected}
                        >
                          <Minus className="h-3 w-3 mr-1" />
                          Abstain
                        </Button>
                        {!isConnected && (
                          <span className="text-xs text-muted-foreground ml-2">
                            Connect wallet to vote
                          </span>
                        )}
                      </div>
                    )}

                    {proposal.can_execute && (
                      <div className="mt-4">
                        <Button size="sm" onClick={() => handleExecute(proposal.id)}>
                          Execute Proposal
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Proposal Modal */}
      <Dialog open={showCreateModal} onOpenChange={(open) => { setShowCreateModal(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Governance Proposal</DialogTitle>
            <DialogDescription>
              Create a new proposal for {selectedToken?.symbol} token holders to vote on.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="action-type">Action Type</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an action..." />
                </SelectTrigger>
                <SelectContent>
                  {GOVERNANCE_ACTIONS.map((action) => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the proposal and its rationale..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {selectedAction?.requiresWallet && (
              <div className="space-y-2">
                <Label htmlFor="targetWallet">Wallet Address</Label>
                <Input
                  id="targetWallet"
                  placeholder="Enter wallet address..."
                  value={targetWallet}
                  onChange={(e) => setTargetWallet(e.target.value)}
                />
              </div>
            )}

            {selectedAction?.requiresAmount && (
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount..."
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            )}

            {selectedAction?.requiresToken && (
              <div className="space-y-2">
                <Label htmlFor="payment-token">Payment Token Address</Label>
                <Input
                  id="payment-token"
                  placeholder="Enter payment token mint address..."
                  value={paymentToken}
                  onChange={(e) => setPaymentToken(e.target.value)}
                />
              </div>
            )}

            {selectedAction?.requiresMultiplier && (
              <div className="space-y-2">
                <Label htmlFor="multiplier">Split Multiplier</Label>
                <Select value={multiplier} onValueChange={setMultiplier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 7, 10].map((m) => (
                      <SelectItem key={m} value={m.toString()}>
                        {m}-for-1 split
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedAction?.requiresSymbol && (
              <div className="space-y-2">
                <Label htmlFor="new-symbol">New Symbol</Label>
                <Input
                  id="new-symbol"
                  placeholder="Enter new symbol (max 10 chars)..."
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase().slice(0, 10))}
                  maxLength={10}
                />
              </div>
            )}

            {selectedAction?.requiresThreshold && (
              <div className="space-y-2">
                <Label htmlFor="threshold">New Threshold</Label>
                <Select value={threshold} onValueChange={setThreshold}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((t) => (
                      <SelectItem key={t} value={t.toString()}>
                        {t} signature{t > 1 ? 's' : ''} required
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="voting-period">Voting Period</Label>
              <Select value={votingPeriodDays} onValueChange={setVotingPeriodDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2m">2 minutes (demo)</SelectItem>
                  <SelectItem value="5m">5 minutes (demo)</SelectItem>
                  <SelectItem value="15m">15 minutes (demo)</SelectItem>
                  <SelectItem value="30m">30 minutes (demo)</SelectItem>
                  <SelectItem value="1h">1 hour (demo)</SelectItem>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="5">5 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProposal}
              disabled={!actionType || !description || submitting}
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Vote className="h-4 w-4 mr-2" />
                  Create Proposal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
