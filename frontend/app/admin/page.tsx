'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Shield, Users, Key, RefreshCw } from 'lucide-react'
import { api, MultiSigConfigResponse, PendingTransactionResponse } from '@/lib/api'
import { BulkImportAllowlistModal } from '@/components/BulkImportAllowlistModal'
import { UpdateMultiSigThresholdModal } from '@/components/UpdateMultiSigThresholdModal'
import { WalletAddress } from '@/components/WalletAddress'
import { formatDate } from '@/lib/utils'

export default function AdminPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [multiSigConfig, setMultiSigConfig] = useState<MultiSigConfigResponse | null>(null)
  const [pendingTxs, setPendingTxs] = useState<PendingTransactionResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)
  const [showThresholdModal, setShowThresholdModal] = useState(false)

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
      setError(e?.detail || e?.message || 'Failed to fetch admin data')
      setMultiSigConfig(null)
      setPendingTxs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAdminData()
  }, [selectedToken])

  const handleApprove = async (txId: string) => {
    if (!selectedToken) return
    try {
      await api.approveTransaction(selectedToken.tokenId, txId)
      fetchAdminData()
    } catch (e: any) {
      setError(e?.detail || e?.message || 'Failed to approve transaction')
    }
  }

  const handleExecute = async (txId: string) => {
    if (!selectedToken) return
    try {
      await api.executeTransaction(selectedToken.tokenId, txId)
      fetchAdminData()
    } catch (e: any) {
      setError(e?.detail || e?.message || 'Failed to execute transaction')
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
        <Button variant="outline" onClick={fetchAdminData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <p className="text-red-500">{error}</p>
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
                    <WalletAddress address={signer} />
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
                        <span>Created: {formatDate(tx.created_at)}</span>
                        {tx.expires_at && <span className="text-yellow-500">Expires: {formatDate(tx.expires_at)}</span>}
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
          <div className="grid gap-4 md:grid-cols-2">
            <Button
              variant="outline"
              className="h-24 flex-col"
              onClick={() => setShowBulkImportModal(true)}
            >
              <Users className="h-6 w-6 mb-2" />
              <span>Bulk Import Allowlist</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex-col"
              onClick={() => setShowThresholdModal(true)}
            >
              <Shield className="h-6 w-6 mb-2" />
              <span>Update Multi-Sig Threshold</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <BulkImportAllowlistModal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        onSuccess={fetchAdminData}
        tokenId={selectedToken.tokenId}
      />

      <UpdateMultiSigThresholdModal
        isOpen={showThresholdModal}
        onClose={() => setShowThresholdModal(false)}
        onSuccess={fetchAdminData}
        tokenId={selectedToken.tokenId}
      />
    </div>
  )
}
