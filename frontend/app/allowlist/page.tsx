'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { UserPlus, UserMinus, UserCheck, Search, Download, Upload, RefreshCw } from 'lucide-react'
import { api, AllowlistEntry } from '@/lib/api'
import { AddWalletModal } from '@/components/AddWalletModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { WalletAddress } from '@/components/WalletAddress'

export default function AllowlistPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [walletToRevoke, setWalletToRevoke] = useState<AllowlistEntry | null>(null)
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchAllowlist = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getAllowlist(selectedToken.tokenId)
      setAllowlist(data)
    } catch (e: any) {
      console.error('Failed to fetch allowlist:', e)
      setError(e.detail || 'Failed to fetch allowlist')
      setAllowlist([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllowlist()
  }, [selectedToken])

  const filteredEntries = allowlist.filter(entry =>
    entry.address.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-500',
    pending: 'bg-yellow-500/10 text-yellow-500',
    revoked: 'bg-red-500/10 text-red-500',
  }

  const handleApprove = async (entry: AllowlistEntry) => {
    if (!selectedToken) return
    setActionLoading(entry.address)
    try {
      await api.approveWallet(selectedToken.tokenId, {
        address: entry.address
      })
      await fetchAllowlist()
    } catch (e: any) {
      console.error('Failed to approve wallet:', e)
      setError(e.detail || 'Failed to approve wallet')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRevoke = async (entry: AllowlistEntry) => {
    if (!selectedToken) return
    setWalletToRevoke(entry)
  }

  const confirmRevoke = async () => {
    if (!selectedToken || !walletToRevoke) return

    setActionLoading(walletToRevoke.address)
    setWalletToRevoke(null)
    try {
      await api.revokeWallet(selectedToken.tokenId, walletToRevoke.address)
      await fetchAllowlist()
    } catch (e: any) {
      console.error('Failed to revoke wallet:', e)
      setError(e.detail || 'Failed to revoke wallet')
    } finally {
      setActionLoading(null)
    }
  }

  const handleExportCSV = () => {
    const headers = ['Address', 'Status', 'Added At']
    const rows = allowlist.map(e => [e.address, e.status, e.added_at || ''])
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedToken?.symbol || 'token'}-allowlist.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to manage its allowlist
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
          <h1 className="text-3xl font-bold tracking-tight">Allowlist</h1>
          <p className="text-muted-foreground">
            Manage approved wallets for {selectedToken.symbol}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAllowlist} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={allowlist.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Wallet
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <p className="text-red-500">{error}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {loading ? '...' : allowlist.filter(e => e.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">
              {loading ? '...' : allowlist.filter(e => e.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Wallets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : allowlist.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revoked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {loading ? '...' : allowlist.filter(e => e.status === 'revoked').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Wallet Allowlist</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search addresses..."
                className="pl-10 pr-4 py-2 border rounded-md text-sm w-64 bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'No matching addresses found' : 'No wallets in allowlist'}
              </p>
              {!searchTerm && (
                <Button onClick={() => setShowAddModal(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add First Wallet
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Wallet Address</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Added</th>
                    <th className="text-right py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <WalletAddress address={entry.address} />
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs capitalize ${statusColors[entry.status]}`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {entry.added_at ? new Date(entry.added_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-1">
                          {entry.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-500 hover:text-green-600"
                              onClick={() => handleApprove(entry)}
                              disabled={actionLoading === entry.address}
                              title="Approve wallet"
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          )}
                          {entry.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleRevoke(entry)}
                              disabled={actionLoading === entry.address}
                              title="Revoke wallet"
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          )}
                          {entry.status === 'revoked' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-500 hover:text-green-600"
                              onClick={() => handleApprove(entry)}
                              disabled={actionLoading === entry.address}
                              title="Re-approve wallet"
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          )}
                          {actionLoading === entry.address && (
                            <RefreshCw className="h-4 w-4 animate-spin ml-2" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Wallet Modal */}
      <AddWalletModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchAllowlist}
        tokenId={selectedToken.tokenId}
      />

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        open={!!walletToRevoke}
        onOpenChange={(open) => !open && setWalletToRevoke(null)}
        title="Revoke Wallet"
        description={`Are you sure you want to revoke ${walletToRevoke?.address.slice(0, 8)}...${walletToRevoke?.address.slice(-4)}? This wallet will no longer be able to hold or transfer tokens.`}
        confirmLabel="Revoke"
        variant="destructive"
        onConfirm={confirmRevoke}
      />
    </div>
  )
}
