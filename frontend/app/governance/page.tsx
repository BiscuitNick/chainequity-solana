'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, ThumbsUp, ThumbsDown, Clock, CheckCircle, XCircle } from 'lucide-react'

interface Proposal {
  id: number
  title: string
  description: string
  proposer: string
  status: 'active' | 'passed' | 'rejected' | 'executed'
  votesFor: number
  votesAgainst: number
  quorum: number
  endDate: string
  executionDeadline?: string
}

// Mock data for demonstration
const mockProposals: Proposal[] = [
  {
    id: 1,
    title: 'Increase quarterly dividend to 2%',
    description: 'Proposal to increase the quarterly dividend distribution from 1.5% to 2% of net profits.',
    proposer: 'Hk4M...8xYq',
    status: 'active',
    votesFor: 65000,
    votesAgainst: 15000,
    quorum: 100000,
    endDate: '2024-02-15',
  },
  {
    id: 2,
    title: 'Approve 2:1 stock split',
    description: 'Split each existing share into 2 shares to improve liquidity.',
    proposer: 'Jm2N...9zWr',
    status: 'passed',
    votesFor: 120000,
    votesAgainst: 30000,
    quorum: 100000,
    endDate: '2024-01-31',
    executionDeadline: '2024-02-28',
  },
  {
    id: 3,
    title: 'Change token symbol to ACME2',
    description: 'Update the token symbol following the corporate rebrand.',
    proposer: 'Lp5Q...3vTs',
    status: 'rejected',
    votesFor: 25000,
    votesAgainst: 85000,
    quorum: 100000,
    endDate: '2024-01-20',
  },
  {
    id: 4,
    title: 'Implement anti-dilution provisions',
    description: 'Add smart contract logic to protect against excessive token issuance.',
    proposer: 'Nq7R...6uUv',
    status: 'executed',
    votesFor: 140000,
    votesAgainst: 10000,
    quorum: 100000,
    endDate: '2024-01-10',
  },
]

export default function GovernancePage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'passed' | 'rejected'>('all')

  const statusIcons = {
    active: <Clock className="h-4 w-4 text-yellow-500" />,
    passed: <CheckCircle className="h-4 w-4 text-green-500" />,
    rejected: <XCircle className="h-4 w-4 text-red-500" />,
    executed: <CheckCircle className="h-4 w-4 text-blue-500" />,
  }

  const statusColors = {
    active: 'bg-yellow-500/10 text-yellow-500',
    passed: 'bg-green-500/10 text-green-500',
    rejected: 'bg-red-500/10 text-red-500',
    executed: 'bg-blue-500/10 text-blue-500',
  }

  const filteredProposals = filter === 'all'
    ? mockProposals
    : mockProposals.filter(p => p.status === filter)

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
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Proposal
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Proposals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockProposals.filter(p => p.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Passed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {mockProposals.filter(p => p.status === 'passed' || p.status === 'executed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {mockProposals.filter(p => p.status === 'rejected').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quorum Required</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">100,000</div>
            <p className="text-xs text-muted-foreground">tokens</p>
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
          <div className="space-y-4">
            {filteredProposals.map((proposal) => {
              const totalVotes = proposal.votesFor + proposal.votesAgainst
              const forPercentage = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0
              const quorumReached = totalVotes >= proposal.quorum

              return (
                <div key={proposal.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {statusIcons[proposal.status]}
                        <h3 className="font-semibold">{proposal.title}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs capitalize ${statusColors[proposal.status]}`}>
                          {proposal.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{proposal.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Proposed by: {proposal.proposer}</span>
                        <span>Ends: {proposal.endDate}</span>
                        {proposal.executionDeadline && (
                          <span>Execute by: {proposal.executionDeadline}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3 text-green-500" />
                        For: {proposal.votesFor.toLocaleString()} ({forPercentage.toFixed(1)}%)
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsDown className="h-3 w-3 text-red-500" />
                        Against: {proposal.votesAgainst.toLocaleString()} ({(100 - forPercentage).toFixed(1)}%)
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
                      <span className={quorumReached ? 'text-green-500' : 'text-yellow-500'}>
                        Quorum: {quorumReached ? 'Reached' : `${((totalVotes / proposal.quorum) * 100).toFixed(0)}%`}
                      </span>
                    </div>
                  </div>

                  {proposal.status === 'active' && (
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" className="bg-green-500 hover:bg-green-600">
                        <ThumbsUp className="h-3 w-3 mr-1" />
                        Vote For
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-500 border-red-500 hover:bg-red-500/10">
                        <ThumbsDown className="h-3 w-3 mr-1" />
                        Vote Against
                      </Button>
                    </div>
                  )}

                  {proposal.status === 'passed' && (
                    <div className="mt-4">
                      <Button size="sm">Execute Proposal</Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
