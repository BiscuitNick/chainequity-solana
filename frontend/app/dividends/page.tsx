'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, DollarSign, Users, Clock, CheckCircle } from 'lucide-react'

interface DividendRound {
  id: number
  totalPool: number
  amountPerShare: number
  paymentToken: string
  snapshotSlot: number
  status: 'pending' | 'active' | 'completed'
  createdAt: string
  expiresAt?: string
  claimedCount: number
  totalEligible: number
}

// Mock data for demonstration
const mockDividendRounds: DividendRound[] = [
  {
    id: 4,
    totalPool: 50000,
    amountPerShare: 0.50,
    paymentToken: 'USDC',
    snapshotSlot: 245678901,
    status: 'active',
    createdAt: '2024-01-15',
    expiresAt: '2024-04-15',
    claimedCount: 45,
    totalEligible: 120,
  },
  {
    id: 3,
    totalPool: 45000,
    amountPerShare: 0.45,
    paymentToken: 'USDC',
    snapshotSlot: 234567890,
    status: 'completed',
    createdAt: '2023-10-15',
    claimedCount: 118,
    totalEligible: 118,
  },
  {
    id: 2,
    totalPool: 40000,
    amountPerShare: 0.40,
    paymentToken: 'USDC',
    snapshotSlot: 223456789,
    status: 'completed',
    createdAt: '2023-07-15',
    claimedCount: 105,
    totalEligible: 110,
  },
  {
    id: 1,
    totalPool: 35000,
    amountPerShare: 0.35,
    paymentToken: 'USDC',
    snapshotSlot: 212345678,
    status: 'completed',
    createdAt: '2023-04-15',
    claimedCount: 95,
    totalEligible: 100,
  },
]

export default function DividendsPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-500',
    active: 'bg-green-500/10 text-green-500',
    completed: 'bg-blue-500/10 text-blue-500',
  }

  const totalDistributed = mockDividendRounds.reduce((sum, r) => sum + r.totalPool, 0)
  const activeRound = mockDividendRounds.find(r => r.status === 'active')

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to manage dividends
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
          <h1 className="text-3xl font-bold tracking-tight">Dividends</h1>
          <p className="text-muted-foreground">
            Distribute dividends to {selectedToken.symbol} holders
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Distribution
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Distributed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalDistributed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">all time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribution Rounds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockDividendRounds.length}</div>
            <p className="text-xs text-muted-foreground">completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Round</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeRound ? `$${activeRound.totalPool.toLocaleString()}` : 'None'}
            </div>
            <p className="text-xs text-muted-foreground">
              {activeRound ? `${activeRound.claimedCount}/${activeRound.totalEligible} claimed` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Per Share (Latest)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${mockDividendRounds[0]?.amountPerShare.toFixed(2) ?? '—'}
            </div>
            <p className="text-xs text-muted-foreground">USDC</p>
          </CardContent>
        </Card>
      </div>

      {activeRound && (
        <Card className="border-green-500">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  Active Distribution Round #{activeRound.id}
                </CardTitle>
                <CardDescription>Claim your dividends before the expiration date</CardDescription>
              </div>
              <span className={`px-3 py-1 rounded text-sm ${statusColors.active}`}>
                Active
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Pool</p>
                <p className="text-xl font-bold">${activeRound.totalPool.toLocaleString()} USDC</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Per Share</p>
                <p className="text-xl font-bold">${activeRound.amountPerShare.toFixed(2)} USDC</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expires</p>
                <p className="text-xl font-bold">{activeRound.expiresAt}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Claims progress</span>
                <span>{activeRound.claimedCount} / {activeRound.totalEligible}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${(activeRound.claimedCount / activeRound.totalEligible) * 100}%` }}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button className="w-full">
                <DollarSign className="h-4 w-4 mr-2" />
                Claim Dividend
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Distribution History</CardTitle>
          <CardDescription>Past dividend distributions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Round</th>
                  <th className="text-left py-3 px-4 font-medium">Total Pool</th>
                  <th className="text-left py-3 px-4 font-medium">Per Share</th>
                  <th className="text-left py-3 px-4 font-medium">Token</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Claims</th>
                  <th className="text-left py-3 px-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {mockDividendRounds.map((round) => (
                  <tr key={round.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4 font-medium">#{round.id}</td>
                    <td className="py-3 px-4">${round.totalPool.toLocaleString()}</td>
                    <td className="py-3 px-4">${round.amountPerShare.toFixed(2)}</td>
                    <td className="py-3 px-4">{round.paymentToken}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs capitalize ${statusColors[round.status]}`}>
                        {round.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {round.claimedCount} / {round.totalEligible}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{round.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
