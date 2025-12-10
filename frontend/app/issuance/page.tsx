'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/stores/useAppStore'
import {
  Coins,
  Plus,
  RefreshCw,
  Layers,
  Users,
  DollarSign,
  Trash2,
  Clock,
} from 'lucide-react'
import {
  api,
  ShareClass,
  SharePosition,
  IssueSharesRequest,
  CreateShareClassRequest,
  ReconstructedState,
} from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { WalletAddress } from '@/components/WalletAddress'

// Prepopulated share class templates
// Priority: Lower number = higher priority in liquidation waterfall
// Preference Multiple: 1 = 1x liquidation preference, 2 = 2x, etc.
const SHARE_CLASS_TEMPLATES: CreateShareClassRequest[] = [
  // Common stock - lowest priority, default for vested shares
  { name: 'Common', symbol: 'COM', priority: 90, preference_multiple: 1 },
  // Seed rounds
  { name: 'Seed', symbol: 'S1x', priority: 80, preference_multiple: 1 },
  { name: 'Seed', symbol: 'S2x', priority: 80, preference_multiple: 2 },
  { name: 'Seed', symbol: 'S3x', priority: 80, preference_multiple: 3 },
  // Series A
  { name: 'Series A', symbol: 'A1x', priority: 70, preference_multiple: 1 },
  { name: 'Series A', symbol: 'A2x', priority: 70, preference_multiple: 2 },
  { name: 'Series A', symbol: 'A3x', priority: 70, preference_multiple: 3 },
  // Series B
  { name: 'Series B', symbol: 'B1x', priority: 60, preference_multiple: 1 },
  { name: 'Series B', symbol: 'B2x', priority: 60, preference_multiple: 2 },
  { name: 'Series B', symbol: 'B3x', priority: 60, preference_multiple: 3 },
  // Series C
  { name: 'Series C', symbol: 'C1x', priority: 50, preference_multiple: 1 },
  { name: 'Series C', symbol: 'C2x', priority: 50, preference_multiple: 2 },
  { name: 'Series C', symbol: 'C3x', priority: 50, preference_multiple: 3 },
]

// Default share class - vested shares convert to this
const DEFAULT_SHARE_CLASS = SHARE_CLASS_TEMPLATES[0] // Common

// Helper to format cents as dollars
const formatDollars = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export default function IssuancePage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Data states
  const [shareClasses, setShareClasses] = useState<ShareClass[]>([])
  const [positions, setPositions] = useState<SharePosition[]>([])
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [reconstructedState, setReconstructedState] = useState<ReconstructedState | null>(null)

  const isHistoricalView = selectedSlot !== null

  // Form states
  const [recipientWallet, setRecipientWallet] = useState('')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [notes, setNotes] = useState('')
  const [issuing, setIssuing] = useState(false)

  // Create share class form
  const [showCreateClass, setShowCreateClass] = useState(false)
  const [className, setClassName] = useState('')
  const [classSymbol, setClassSymbol] = useState('')
  const [classPriority, setClassPriority] = useState('99')
  const [classPreference, setClassPreference] = useState('1.0')
  const [creatingClass, setCreatingClass] = useState(false)

  const [initializingClasses, setInitializingClasses] = useState(false)
  const [deletingClassId, setDeletingClassId] = useState<number | null>(null)

  const fetchData = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    setReconstructedState(null)
    try {
      const classes = await api.getShareClasses(selectedToken.tokenId)
      setShareClasses(classes)

      if (isHistoricalView && selectedSlot !== null) {
        // Historical view - use transaction reconstruction
        const state = await api.getReconstructedStateAtSlot(selectedToken.tokenId, selectedSlot)
        setReconstructedState(state)

        // Convert reconstructed state to positions format
        // The API returns positions as an array with wallet, share_class_id, shares, cost_basis, etc.
        const allPositions: SharePosition[] = []
        if (Array.isArray(state.positions)) {
          for (const posState of state.positions) {
            const shareClass = classes.find(c => c.id === posState.share_class_id)
            if (posState.shares > 0 && shareClass) {
              allPositions.push({
                id: 0, // Not available in reconstructed state
                wallet: posState.wallet,
                shares: posState.shares,
                cost_basis: posState.cost_basis,
                price_per_share: posState.shares > 0 ? Math.round(posState.cost_basis / posState.shares) : 0,
                share_class: shareClass,
                preference_amount: posState.cost_basis * shareClass.preference_multiple,
                current_value: posState.cost_basis, // fallback to cost_basis
              })
            }
          }
        }
        setPositions(allPositions)
      } else {
        // Live view - use direct API calls for accurate position data
        // Fallback to direct API calls
        const allPositions: SharePosition[] = []
        for (const sc of classes) {
          try {
            const classPositions = await api.getSharePositions(selectedToken.tokenId, sc.id)
            allPositions.push(...classPositions)
          } catch (e) {
            // Ignore errors for individual classes
          }
        }
        setPositions(allPositions)
      }
    } catch (e: any) {
      console.error('Failed to fetch share classes:', e)
      setError(e.detail || 'Failed to fetch share classes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateShareClass = async () => {
    if (!selectedToken) return
    setCreatingClass(true)
    setError(null)
    try {
      await api.createShareClass(selectedToken.tokenId, {
        name: className,
        symbol: classSymbol,
        priority: parseInt(classPriority),
        preference_multiple: parseFloat(classPreference),
      })
      setSuccess(`Share class "${className}" created successfully`)
      setShowCreateClass(false)
      setClassName('')
      setClassSymbol('')
      setClassPriority('99')
      setClassPreference('1.0')
      await fetchData()
    } catch (e: any) {
      console.error('Failed to create share class:', e)
      setError(e.detail || 'Failed to create share class')
    } finally {
      setCreatingClass(false)
    }
  }

  const handleInitializeShareClasses = async () => {
    if (!selectedToken) return
    setInitializingClasses(true)
    setError(null)

    // Get existing symbols to avoid duplicates
    const existingSymbols = new Set(shareClasses.map(sc => sc.symbol))
    const templatesToCreate = SHARE_CLASS_TEMPLATES.filter(t => !existingSymbols.has(t.symbol))

    if (templatesToCreate.length === 0) {
      setSuccess('All standard share classes already exist')
      setInitializingClasses(false)
      return
    }

    let created = 0
    let failed = 0

    for (const template of templatesToCreate) {
      try {
        await api.createShareClass(selectedToken.tokenId, template)
        created++
      } catch (e: any) {
        console.error(`Failed to create share class ${template.symbol}:`, e)
        failed++
      }
    }

    if (failed === 0) {
      setSuccess(`Created ${created} share class${created !== 1 ? 'es' : ''} successfully`)
    } else {
      setError(`Created ${created} share classes, but ${failed} failed`)
    }

    await fetchData()
    setInitializingClasses(false)
  }

  const handleDeleteShareClass = async (shareClassId: number, symbol: string) => {
    if (!selectedToken) return

    setDeletingClassId(shareClassId)
    setError(null)

    try {
      await api.deleteShareClass(selectedToken.tokenId, shareClassId)
      setSuccess(`Share class "${symbol}" deleted successfully`)
      if (selectedClassId === shareClassId) {
        setSelectedClassId(null)
      }
      await fetchData()
    } catch (e: any) {
      console.error('Failed to delete share class:', e)
      setError(e.detail || 'Failed to delete share class')
    } finally {
      setDeletingClassId(null)
    }
  }

  const handleIssueShares = async () => {
    if (!selectedToken || !selectedClassId) return

    // Validate inputs
    const trimmedWallet = recipientWallet.trim()
    if (!trimmedWallet || trimmedWallet.length < 32 || trimmedWallet.length > 44) {
      setError('Please enter a valid Solana wallet address')
      return
    }

    const sharesNum = parseInt(shares)
    if (!shares || isNaN(sharesNum) || sharesNum <= 0) {
      setError('Please enter a valid number of shares')
      return
    }

    setIssuing(true)
    setError(null)
    setSuccess(null)
    try {
      // Calculate cost basis in cents
      const costBasisCents = costBasis ? Math.round(parseFloat(costBasis) * 100) : 0
      // Auto-calculate price per share from cost basis / shares
      const pricePerShareCents = sharesNum > 0 && costBasisCents > 0
        ? Math.round(costBasisCents / sharesNum)
        : 0

      const request: IssueSharesRequest = {
        recipient_wallet: trimmedWallet,
        share_class_id: selectedClassId,
        shares: sharesNum,
        cost_basis: costBasisCents,
        price_per_share: pricePerShareCents,
        notes: notes || undefined,
      }

      const result = await api.issueShares(selectedToken.tokenId, request)
      setSuccess(`Successfully issued ${result.shares.toLocaleString()} shares of ${result.share_class.name} to ${recipientWallet.slice(0, 8)}...`)

      // Reset form
      setRecipientWallet('')
      setShares('')
      setCostBasis('')
      setNotes('')

      // Refresh data
      await fetchData()
    } catch (e: any) {
      console.error('Failed to issue shares:', e, JSON.stringify(e))
      setError(e.detail || e.message || (typeof e === 'string' ? e : 'Failed to issue shares'))
    } finally {
      setIssuing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedToken, selectedSlot])

  useEffect(() => {
    // Clear success message after 5 seconds
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to issue shares
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const selectedClass = shareClasses.find(sc => sc.id === selectedClassId)
  const totalShares = positions.reduce((sum, p) => sum + p.shares, 0)
  const uniqueHolders = new Set(positions.map(p => p.wallet)).size

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Share Issuance</h1>
          <p className="text-muted-foreground">
            Issue shares with different classes and preferences for {selectedToken.symbol}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isHistoricalView && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <Clock className="h-4 w-4" />
          <AlertTitle>Viewing Historical Data</AlertTitle>
          <AlertDescription>
            Showing share positions reconstructed at slot {selectedSlot?.toLocaleString()}.
            {reconstructedState && ` Total supply: ${reconstructedState.total_supply.toLocaleString()} shares, ${reconstructedState.holder_count} holders.`}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-green-500/50 bg-green-500/10">
          <CardContent className="pt-4">
            <p className="text-green-500">{success}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Share Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shareClasses.length}</div>
            <p className="text-xs text-muted-foreground">configured classes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Total Shares
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalShares.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">issued across all classes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Shareholders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueHolders}</div>
            <p className="text-xs text-muted-foreground">unique holders</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Issue Shares Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Issue Shares
            </CardTitle>
            <CardDescription>
              Issue shares to a wallet with a specific share class
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shareClasses.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Create a share class first before issuing shares
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="shareClass">Share Class</Label>
                  <Select
                    value={selectedClassId?.toString() || ''}
                    onValueChange={(value) => setSelectedClassId(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a share class" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...shareClasses]
                        .sort((a, b) => b.priority - a.priority)
                        .map((sc) => (
                          <SelectItem key={sc.id} value={sc.id.toString()}>
                            {sc.name} ({sc.symbol}) - {sc.preference_multiple}x preference
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {selectedClass && (
                    <p className="text-xs text-muted-foreground">
                      Priority {selectedClass.priority} | {selectedClass.preference_multiple}x liquidation preference
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recipient">Recipient Wallet</Label>
                  <Input
                    id="recipient"
                    value={recipientWallet}
                    onChange={(e) => setRecipientWallet(e.target.value)}
                    placeholder="Solana wallet address"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="shares">Number of Shares</Label>
                    <Input
                      id="shares"
                      type="number"
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                      placeholder="1000000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="costBasis">Total Investment ($)</Label>
                    <Input
                      id="costBasis"
                      type="number"
                      step="0.01"
                      value={costBasis}
                      onChange={(e) => setCostBasis(e.target.value)}
                      placeholder="0.00 for grants"
                    />
                    <p className="text-xs text-muted-foreground">
                      Total amount paid. Leave at 0 for founder/employee grants.
                    </p>
                  </div>
                </div>

                {/* Show calculated price per share */}
                {shares && costBasis && parseFloat(costBasis) > 0 && parseInt(shares) > 0 && (
                  <div className="p-3 bg-muted rounded-md">
                    <div className="text-sm text-muted-foreground">Calculated Price Per Share</div>
                    <div className="text-lg font-medium">
                      ${(parseFloat(costBasis) / parseInt(shares)).toFixed(4)}/share
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Founder grant, Series A investment, etc."
                  />
                </div>

                <Button
                  onClick={handleIssueShares}
                  disabled={issuing || !selectedClassId || !recipientWallet || !shares}
                  className="w-full"
                >
                  {issuing ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Coins className="h-4 w-4 mr-2" />
                  )}
                  Issue Shares
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Share Classes */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Share Classes
                </CardTitle>
                <CardDescription>
                  Configure share classes with liquidation preferences
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInitializeShareClasses}
                  disabled={initializingClasses}
                >
                  {initializingClasses ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Layers className="h-4 w-4 mr-2" />
                  )}
                  Initialize Standard
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateClass(!showCreateClass)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Custom
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden pt-0">
            {showCreateClass && (
              <div className="p-4 border rounded-lg space-y-4 bg-muted/50 mb-4">
                <h4 className="font-semibold">Create Share Class</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="Common, Series A Preferred"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Symbol</Label>
                    <Input
                      value={classSymbol}
                      onChange={(e) => setClassSymbol(e.target.value.toUpperCase())}
                      placeholder="COM, SER-A"
                      maxLength={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Input
                      type="number"
                      value={classPriority}
                      onChange={(e) => setClassPriority(e.target.value)}
                      placeholder="99"
                    />
                    <p className="text-xs text-muted-foreground">
                      0 = highest (debt), 99 = lowest (common)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Preference Multiple</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={classPreference}
                      onChange={(e) => setClassPreference(e.target.value)}
                      placeholder="1.0"
                    />
                    <p className="text-xs text-muted-foreground">
                      1x, 1.5x, 2x liquidation preference
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateShareClass}
                    disabled={creatingClass || !className || !classSymbol}
                  >
                    {creatingClass ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Create
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateClass(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : shareClasses.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-muted-foreground">
                  No share classes configured.
                </p>
                <p className="text-sm text-muted-foreground">
                  Click &quot;Initialize Standard&quot; to create Common, Seed, Series A, B, and C classes with 1x-3x preferences.
                </p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-sm">Name</th>
                      <th className="text-left py-2 px-3 font-medium text-sm">Symbol</th>
                      <th className="text-center py-2 px-3 font-medium text-sm">Priority</th>
                      <th className="text-center py-2 px-3 font-medium text-sm">Pref</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shareClasses]
                      .sort((a, b) => b.priority - a.priority)
                      .map((sc) => {
                        const classPositions = positions.filter(p => p.share_class?.id === sc.id)
                        const hasShares = classPositions.some(p => p.shares > 0)
                        return (
                          <tr
                            key={sc.id}
                            className={`border-b cursor-pointer transition-colors ${
                              selectedClassId === sc.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                            }`}
                            onClick={() => setSelectedClassId(sc.id)}
                          >
                            <td className="py-2 px-3 text-sm">{sc.name}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                sc.priority <= 50 ? 'bg-purple-500/10 text-purple-600' :
                                sc.priority <= 70 ? 'bg-blue-500/10 text-blue-600' :
                                sc.priority <= 80 ? 'bg-green-500/10 text-green-600' :
                                'bg-gray-500/10 text-gray-600'
                              }`}>
                                {sc.symbol}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center text-sm text-muted-foreground">
                              {sc.priority}
                            </td>
                            <td className="py-2 px-3 text-center text-sm">
                              {sc.preference_multiple}x
                            </td>
                            <td className="py-2 px-1">
                              {!hasShares && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteShareClass(sc.id, sc.symbol)
                                  }}
                                  disabled={deletingClassId === sc.id}
                                  className="p-1 hover:bg-red-500/10 rounded transition-colors text-muted-foreground hover:text-red-500 disabled:opacity-50"
                                  title="Delete share class"
                                >
                                  {deletingClassId === sc.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Share Positions</CardTitle>
          <CardDescription>
            All shareholders and their positions across share classes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : positions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No shares have been issued yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Wallet</th>
                    <th className="text-left py-3 px-4 font-medium">Share Class</th>
                    <th className="text-center py-3 px-4 font-medium">Priority</th>
                    <th className="text-right py-3 px-4 font-medium">Shares</th>
                    <th className="text-right py-3 px-4 font-medium">Cost Basis</th>
                    <th className="text-right py-3 px-4 font-medium">Current Value</th>
                    <th className="text-right py-3 px-4 font-medium">Liq. Preference</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position, idx) => {
                    const shareClass = position.share_class
                    const preference = position.preference_amount ?? (
                      shareClass
                        ? position.cost_basis * shareClass.preference_multiple
                        : position.cost_basis
                    )
                    // Current value from API, or fall back to cost basis if not available
                    const currentValue = position.current_value ?? position.cost_basis
                    return (
                      <tr key={idx} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <WalletAddress address={position.wallet} />
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            shareClass?.priority === 0 ? 'bg-red-500/10 text-red-500' :
                            (shareClass?.priority ?? 99) < 50 ? 'bg-blue-500/10 text-blue-500' :
                            'bg-gray-500/10 text-gray-500'
                          }`}>
                            {shareClass?.symbol || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            (shareClass?.priority ?? 99) === 0 ? 'bg-red-500/10 text-red-500' :
                            (shareClass?.priority ?? 99) < 50 ? 'bg-yellow-500/10 text-yellow-600' :
                            'bg-gray-500/10 text-gray-500'
                          }`}>
                            {shareClass?.priority ?? 99}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {position.shares.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div>{formatDollars(position.cost_basis)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDollars(position.shares > 0 ? Math.round(position.cost_basis / position.shares) : 0)}/share
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div>{formatDollars(currentValue)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDollars(position.shares > 0 ? Math.round(currentValue / position.shares) : 0)}/share
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div>{formatDollars(preference)}</div>
                          <span className="text-xs text-muted-foreground">
                            ({shareClass?.preference_multiple || 1}x)
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
