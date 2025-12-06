'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, ThumbsUp, ThumbsDown, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { api, Proposal } from '@/lib/api'

export default function GovernancePage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'passed' | 'rejected'>('all')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProposals = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getProposals(selectedToken.id, filter === 'all' ? undefined : filter)
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

  const handleVote = async (proposalId: number, voteFor: boolean) => {
    if (!selectedToken) return
    try {
      await api.vote(selectedToken.id, proposalId, voteFor)
      fetchProposals()
    } catch (e: any) {
      console.error('Failed to vote:', e)
      setError(e.detail || 'Failed to vote')
    }
  }

  const handleExecute = async (proposalId: number) => {
    if (!selectedToken) return
    try {
      await api.executeProposal(selectedToken.id, proposalId)
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
          <Button onClick={() => setShowCreateModal(true)}>
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
                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600"
                          onClick={() => handleVote(proposal.id, true)}
                        >
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          Vote For
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 border-red-500 hover:bg-red-500/10"
                          onClick={() => handleVote(proposal.id, false)}
                        >
                          <ThumbsDown className="h-3 w-3 mr-1" />
                          Vote Against
                        </Button>
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
    </div>
  )
}
