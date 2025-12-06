'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Shield, Users, Pause, Play, AlertTriangle, Key, RefreshCw } from 'lucide-react'
import { api, MultiSigConfigResponse, PendingTransactionResponse } from '@/lib/api'

export default function AdminPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [isPaused, setIsPaused] = useState(false)
  const [multiSigConfig, setMultiSigConfig] = useState<MultiSigConfigResponse | null>(null)
  const [pendingTxs, setPendingTxs] = useState<PendingTransactionResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAdminData = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const [config, txs] = await Promise.all([
        api.getMultiSigInfo(selectedToken.tokenId),
        api.getPendingTransactions(selectedToken.tokenId)
      ])
      setMultiSigConfig(config)
      setPendingTxs(txs)
    } catch (e: any) {
      console.error('Failed to fetch admin data:', e)
      setError(e.detail || 'Failed to fetch admin data')
      setMultiSigConfig(null)
      setPendingTxs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAdminData()
  }, [selectedToken])

  const handlePauseToggle = async () => {
    if (!selectedToken) return
    try {
      await api.setPaused(selectedToken.tokenId, !isPaused)
      setIsPaused(!isPaused)
    } catch (e: any) {
      console.error('Failed to toggle pause:', e)
      setError(e.detail || 'Failed to toggle pause state')
    }
  }

  const handleApprove = async (txId: string) => {
    if (!selectedToken) return
    try {
      await api.approveTransaction(selectedToken.tokenId, txId)
      fetchAdminData()
    } catch (e: any) {
      console.error('Failed to approve transaction:', e)
      setError(e.detail || 'Failed to approve transaction')
    }
  }

  const handleExecute = async (txId: string) => {
    if (!selectedToken) return
    try {
      await api.executeTransaction(selectedToken.tokenId, txId)
      fetchAdminData()
    } catch (e: any) {
      console.error('Failed to execute transaction:', e)
      setError(e.detail || 'Failed to execute transaction')
    }
  }

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

  const signers = multiSigConfig?.signers || []
  const threshold = multiSigConfig?.threshold || 0

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">
            Administrative controls for {selectedToken.symbol}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAdminData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant={isPaused ? 'default' : 'destructive'}
            onClick={handlePauseToggle}
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
      </div>

      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

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
            <div className="text-2xl font-bold">
              {loading ? '...' : `${threshold} of ${signers.length}`}
            </div>
            <p className="text-xs text-muted-foreground">required signatures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : pendingTxs.length}</div>
            <p className="text-xs text-muted-foreground">awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Signers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : signers.length}</div>
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
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : signers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No signers configured
            </p>
          ) : (
            <div className="space-y-3">
              {signers.map((signer, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <p className="font-mono text-sm">{signer}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-500">
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
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
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pendingTxs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No pending transactions</p>
          ) : (
            <div className="space-y-4">
              {pendingTxs.map((tx) => (
                <div key={tx.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-blue-500/10 text-blue-500 rounded text-xs">
                          {tx.instruction_type}
                        </span>
                        <span className="text-sm font-medium">Transaction #{tx.id.slice(0, 8)}...</span>
                      </div>
                      <p className="text-sm mt-1 text-muted-foreground">
                        {JSON.stringify(tx.instruction_data).slice(0, 100)}...
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Created: {new Date(tx.created_at).toLocaleDateString()}</span>
                        {tx.expires_at && <span className="text-yellow-500">Expires: {new Date(tx.expires_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {tx.signers_approved.length} / {threshold}
                      </p>
                      <p className="text-xs text-muted-foreground">approvals</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {tx.signers_approved.length < threshold ? (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600"
                          onClick={() => handleApprove(tx.id)}
                        >
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500">
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => handleExecute(tx.id)}>
                        Execute Transaction
                      </Button>
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
