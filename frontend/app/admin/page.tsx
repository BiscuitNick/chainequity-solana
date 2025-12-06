'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Shield, Users, Pause, Play, AlertTriangle, Key } from 'lucide-react'

interface MultiSigSigner {
  address: string
  name?: string
  isActive: boolean
}

interface PendingTransaction {
  id: number
  type: string
  description: string
  approvals: number
  threshold: number
  proposedBy: string
  proposedAt: string
  deadline?: string
}

// Mock data
const mockSigners: MultiSigSigner[] = [
  { address: 'Hk4M...8xYq', name: 'CEO', isActive: true },
  { address: 'Jm2N...9zWr', name: 'CFO', isActive: true },
  { address: 'Lp5Q...3vTs', name: 'Legal', isActive: true },
]

const mockPendingTxs: PendingTransaction[] = [
  {
    id: 1,
    type: 'AllowlistAdd',
    description: 'Add Nq7R...6uUv to allowlist with KYC Tier 2',
    approvals: 1,
    threshold: 2,
    proposedBy: 'Hk4M...8xYq',
    proposedAt: '2024-01-16 10:30',
    deadline: '2024-01-23',
  },
  {
    id: 2,
    type: 'TerminateVesting',
    description: 'Terminate vesting for Ps9T...2wXy (Standard)',
    approvals: 2,
    threshold: 2,
    proposedBy: 'Jm2N...9zWr',
    proposedAt: '2024-01-15 14:00',
  },
]

export default function AdminPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [isPaused, setIsPaused] = useState(false)

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to access admin controls
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
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">
            Administrative controls for {selectedToken.symbol}
          </p>
        </div>
        <Button
          variant={isPaused ? 'default' : 'destructive'}
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? (
            <>
              <Play className="h-4 w-4 mr-2" />
              Resume Trading
            </>
          ) : (
            <>
              <Pause className="h-4 w-4 mr-2" />
              Pause Trading
            </>
          )}
        </Button>
      </div>

      {isPaused && (
        <Card className="border-red-500 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Token transfers are currently paused</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Multi-Sig Threshold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2 of 3</div>
            <p className="text-xs text-muted-foreground">required signatures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockPendingTxs.length}</div>
            <p className="text-xs text-muted-foreground">awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Signers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockSigners.filter(s => s.isActive).length}</div>
            <p className="text-xs text-muted-foreground">can approve transactions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Multi-Sig Signers
          </CardTitle>
          <CardDescription>Wallets that can approve administrative transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockSigners.map((signer, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${signer.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
                  <div>
                    <p className="font-mono text-sm">{signer.address}</p>
                    {signer.name && <p className="text-xs text-muted-foreground">{signer.name}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-red-500">
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-4">
            <Users className="h-4 w-4 mr-2" />
            Add Signer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Pending Transactions
          </CardTitle>
          <CardDescription>Transactions awaiting multi-sig approval</CardDescription>
        </CardHeader>
        <CardContent>
          {mockPendingTxs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No pending transactions</p>
          ) : (
            <div className="space-y-4">
              {mockPendingTxs.map((tx) => (
                <div key={tx.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-blue-500/10 text-blue-500 rounded text-xs">
                          {tx.type}
                        </span>
                        <span className="text-sm font-medium">Transaction #{tx.id}</span>
                      </div>
                      <p className="text-sm mt-1">{tx.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Proposed by: {tx.proposedBy}</span>
                        <span>{tx.proposedAt}</span>
                        {tx.deadline && <span className="text-yellow-500">Deadline: {tx.deadline}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {tx.approvals} / {tx.threshold}
                      </p>
                      <p className="text-xs text-muted-foreground">approvals</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {tx.approvals < tx.threshold ? (
                      <>
                        <Button size="sm" className="bg-green-500 hover:bg-green-600">
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500">
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button size="sm">Execute Transaction</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-24 flex-col">
              <Users className="h-6 w-6 mb-2" />
              <span>Bulk Import Allowlist</span>
            </Button>
            <Button variant="outline" className="h-24 flex-col">
              <Shield className="h-6 w-6 mb-2" />
              <span>Update Multi-Sig Threshold</span>
            </Button>
            <Button variant="outline" className="h-24 flex-col text-yellow-500">
              <AlertTriangle className="h-6 w-6 mb-2" />
              <span>Emergency Pause</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
