'use client'

import { useState, useEffect, Fragment } from 'react'
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
  DollarSign,
  PieChart,
  Calculator,
  RefreshCw,
  Plus,
  Building2,
  Layers,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Users,
  Check,
  Ban,
  Trash2,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react'
import {
  api,
  EnhancedCapTableResponse,
  ShareClass,
  SharePosition,
  FundingRound,
  ConvertibleInstrument,
  WaterfallResponse,
  DilutionResponse,
  SimulatedRoundInput,
  RoundType,
  InstrumentType,
  SafeType,
  AllowlistEntry,
} from '@/lib/api'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { WalletAddress } from '@/components/WalletAddress'
import { ApprovedWalletSelector } from '@/components/ApprovedWalletSelector'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// Helper to format cents as dollars
const formatDollars = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const formatDollarsDetailed = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export default function InvestmentsPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  const isViewingHistorical = selectedSlot !== null
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data states
  const [enhancedCapTable, setEnhancedCapTable] = useState<EnhancedCapTableResponse | null>(null)
  const [shareClasses, setShareClasses] = useState<ShareClass[]>([])
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>([])
  const [convertibles, setConvertibles] = useState<ConvertibleInstrument[]>([])
  const [positions, setPositions] = useState<SharePosition[]>([])
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([])

  // Expanded row states
  const [expandedConvertibleId, setExpandedConvertibleId] = useState<number | null>(null)
  const [expandedPositionKey, setExpandedPositionKey] = useState<string | null>(null)

  // Simulator states
  const [activeTab, setActiveTab] = useState<'overview' | 'waterfall' | 'dilution'>('overview')
  const [exitAmount, setExitAmount] = useState<string>('10000000') // $10M default
  const [waterfallResult, setWaterfallResult] = useState<WaterfallResponse | null>(null)
  const [dilutionRounds, setDilutionRounds] = useState<SimulatedRoundInput[]>([])
  const [dilutionInitialized, setDilutionInitialized] = useState(false)
  const [dilutionResult, setDilutionResult] = useState<DilutionResponse | null>(null)
  const [simulatorLoading, setSimulatorLoading] = useState(false)

  // Modal states
  const [showFundingRoundModal, setShowFundingRoundModal] = useState(false)
  const [showConvertibleModal, setShowConvertibleModal] = useState(false)
  const [showRoundDetailModal, setShowRoundDetailModal] = useState(false)
  const [selectedRound, setSelectedRound] = useState<FundingRound | null>(null)
  const [modalLoading, setModalLoading] = useState(false)

  // Waterfall expanded tier states (show all holders when expanded)
  const [expandedWaterfallTiers, setExpandedWaterfallTiers] = useState<Record<number, boolean>>({})
  const [modalError, setModalError] = useState<string | null>(null)

  // Funding round form states
  const [roundName, setRoundName] = useState('')
  const [roundType, setRoundType] = useState<RoundType>('seed')
  const [roundShareClassId, setRoundShareClassId] = useState<number | null>(null)
  const [roundPreMoneyValuation, setRoundPreMoneyValuation] = useState('')
  const [roundNotes, setRoundNotes] = useState('')

  // Investment form states (for adding to round)
  const [investorWallet, setInvestorWallet] = useState('')
  const [investorName, setInvestorName] = useState('')
  const [investmentAmount, setInvestmentAmount] = useState('')

  // Convertible form states
  const [convertibleType, setConvertibleType] = useState<InstrumentType>('safe')
  const [convertibleName, setConvertibleName] = useState('')
  const [convertibleHolderWallet, setConvertibleHolderWallet] = useState('')
  const [convertibleHolderName, setConvertibleHolderName] = useState('')
  const [convertiblePrincipal, setConvertiblePrincipal] = useState('')
  const [convertibleValuationCap, setConvertibleValuationCap] = useState('')
  const [convertibleDiscount, setConvertibleDiscount] = useState('')
  const [convertibleInterestRate, setConvertibleInterestRate] = useState('')
  const [convertibleMaturityDate, setConvertibleMaturityDate] = useState('')
  const [convertibleSafeType, setConvertibleSafeType] = useState<SafeType>('post_money')
  const [convertibleNotes, setConvertibleNotes] = useState('')

  // Confirm dialog state
  const [convertibleToCancel, setConvertibleToCancel] = useState<ConvertibleInstrument | null>(null)

  const fetchData = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const [capTableData, classesData, roundsData, convertiblesData, allowlistData] = await Promise.all([
        api.getEnhancedCapTable(selectedToken.tokenId, selectedSlot ?? undefined).catch(() => null),
        api.getShareClasses(selectedToken.tokenId).catch(() => []),
        api.getFundingRounds(selectedToken.tokenId).catch(() => []),
        api.getConvertibles(selectedToken.tokenId).catch(() => []),
        api.getAllowlist(selectedToken.tokenId, 0, 100).catch(() => []),
      ])
      setEnhancedCapTable(capTableData)
      setShareClasses(classesData)
      setFundingRounds(roundsData)
      setConvertibles(convertiblesData)
      setAllowlist(allowlistData.filter(entry => entry.status === 'active'))

      // Fetch share positions for each class
      const allPositions: SharePosition[] = []
      for (const sc of classesData) {
        try {
          const classPositions = await api.getSharePositions(selectedToken.tokenId, sc.id)
          allPositions.push(...classPositions)
        } catch (e) {
          // Ignore errors for individual classes
        }
      }
      setPositions(allPositions)
    } catch (e: any) {
      console.error('Failed to fetch investment data:', e)
      setError(e.detail || 'Failed to fetch investment data')
    } finally {
      setLoading(false)
    }
  }

  const runWaterfallSimulation = async () => {
    if (!selectedToken) return
    setSimulatorLoading(true)
    try {
      const exitCents = Math.round(parseFloat(exitAmount) * 100)
      const result = await api.simulateWaterfall(selectedToken.tokenId, exitCents)
      setWaterfallResult(result)
    } catch (e: any) {
      console.error('Waterfall simulation failed:', e)
      setError(e.detail || 'Waterfall simulation failed')
    } finally {
      setSimulatorLoading(false)
    }
  }

  const runDilutionSimulation = async () => {
    if (!selectedToken) return
    setSimulatorLoading(true)
    try {
      const result = await api.simulateDilution(selectedToken.tokenId, dilutionRounds)
      setDilutionResult(result)
    } catch (e: any) {
      console.error('Dilution simulation failed:', e)
      setError(e.detail || 'Dilution simulation failed')
    } finally {
      setSimulatorLoading(false)
    }
  }

  const addDilutionRound = () => {
    const valuation = enhancedCapTable?.current_valuation || 0
    const amountRaised = Math.round(valuation * 1.5)
    setDilutionRounds([
      ...dilutionRounds,
      { name: `Round ${dilutionRounds.length + 1}`, pre_money_valuation: valuation, amount_raised: amountRaised },
    ])
  }

  const updateDilutionRound = (index: number, field: keyof SimulatedRoundInput, value: string | number) => {
    const updated = [...dilutionRounds]
    if (field === 'name') {
      updated[index].name = value as string
    } else {
      // Handle empty string or invalid input - set to 0 instead of NaN
      const parsed = parseFloat(value as string)
      updated[index][field] = isNaN(parsed) ? 0 : Math.round(parsed * 100) // Convert dollars to cents
    }
    setDilutionRounds(updated)
  }

  const removeDilutionRound = (index: number) => {
    setDilutionRounds(dilutionRounds.filter((_, i) => i !== index))
  }

  // Reset funding round form
  const resetFundingRoundForm = () => {
    setRoundName('')
    setRoundType('seed')
    setRoundShareClassId(null)
    setRoundPreMoneyValuation('')
    setRoundNotes('')
    setModalError(null)
  }

  // Reset convertible form
  const resetConvertibleForm = () => {
    setConvertibleType('safe')
    setConvertibleName('')
    setConvertibleHolderWallet('')
    setConvertibleHolderName('')
    setConvertiblePrincipal('')
    setConvertibleValuationCap('')
    setConvertibleDiscount('')
    setConvertibleInterestRate('')
    setConvertibleMaturityDate('')
    setConvertibleSafeType('post_money')
    setConvertibleNotes('')
    setModalError(null)
  }

  // Reset investment form
  const resetInvestmentForm = () => {
    setInvestorWallet('')
    setInvestorName('')
    setInvestmentAmount('')
    setModalError(null)
  }

  // Create funding round
  const handleCreateFundingRound = async () => {
    if (!selectedToken || !roundShareClassId) return
    setModalLoading(true)
    setModalError(null)
    try {
      const preMoneyValuationCents = Math.round(parseFloat(roundPreMoneyValuation) * 100)
      await api.createFundingRound(selectedToken.tokenId, {
        name: roundName,
        round_type: roundType,
        share_class_id: roundShareClassId,
        pre_money_valuation: preMoneyValuationCents,
        notes: roundNotes || undefined,
      })
      setShowFundingRoundModal(false)
      resetFundingRoundForm()
      fetchData()
    } catch (e: any) {
      setModalError(e.detail || 'Failed to create funding round')
    } finally {
      setModalLoading(false)
    }
  }

  // Create convertible
  const handleCreateConvertible = async () => {
    if (!selectedToken) return
    setModalLoading(true)
    setModalError(null)
    try {
      const principalCents = Math.round(parseFloat(convertiblePrincipal) * 100)
      const valuationCapCents = convertibleValuationCap ? Math.round(parseFloat(convertibleValuationCap) * 100) : undefined
      const discountRate = convertibleDiscount ? parseFloat(convertibleDiscount) / 100 : undefined
      const interestRate = convertibleInterestRate ? parseFloat(convertibleInterestRate) / 100 : undefined

      await api.createConvertible(selectedToken.tokenId, {
        instrument_type: convertibleType,
        name: convertibleName || undefined,
        holder_wallet: convertibleHolderWallet,
        holder_name: convertibleHolderName || undefined,
        principal_amount: principalCents,
        valuation_cap: valuationCapCents,
        discount_rate: discountRate,
        interest_rate: interestRate,
        maturity_date: convertibleMaturityDate || undefined,
        safe_type: convertibleType === 'safe' ? convertibleSafeType : undefined,
        notes: convertibleNotes || undefined,
      })
      setShowConvertibleModal(false)
      resetConvertibleForm()
      fetchData()
    } catch (e: any) {
      setModalError(e.detail || 'Failed to create convertible')
    } finally {
      setModalLoading(false)
    }
  }

  // Add investment to round
  const handleAddInvestment = async () => {
    if (!selectedToken || !selectedRound) return
    setModalLoading(true)
    setModalError(null)
    try {
      const amountCents = Math.round(parseFloat(investmentAmount) * 100)
      await api.addInvestment(selectedToken.tokenId, selectedRound.id, {
        investor_wallet: investorWallet,
        investor_name: investorName || undefined,
        amount: amountCents,
      })
      resetInvestmentForm()
      // Refresh the round data
      const updatedRound = await api.getFundingRound(selectedToken.tokenId, selectedRound.id)
      setSelectedRound(updatedRound)
      fetchData()
    } catch (e: any) {
      setModalError(e.detail || 'Failed to add investment')
    } finally {
      setModalLoading(false)
    }
  }

  // Close funding round
  const handleCloseFundingRound = async () => {
    if (!selectedToken || !selectedRound) return
    setModalLoading(true)
    setModalError(null)
    try {
      await api.closeFundingRound(selectedToken.tokenId, selectedRound.id)
      setShowRoundDetailModal(false)
      setSelectedRound(null)
      fetchData()
    } catch (e: any) {
      setModalError(e.detail || 'Failed to close funding round')
    } finally {
      setModalLoading(false)
    }
  }

  // Cancel funding round
  const handleCancelFundingRound = async () => {
    if (!selectedToken || !selectedRound) return
    setModalLoading(true)
    setModalError(null)
    try {
      await api.cancelFundingRound(selectedToken.tokenId, selectedRound.id)
      setShowRoundDetailModal(false)
      setSelectedRound(null)
      fetchData()
    } catch (e: any) {
      setModalError(e.detail || 'Failed to cancel funding round')
    } finally {
      setModalLoading(false)
    }
  }

  // Remove investment
  const handleRemoveInvestment = async (investmentId: number) => {
    if (!selectedToken || !selectedRound) return
    setModalLoading(true)
    setModalError(null)
    try {
      await api.removeInvestment(selectedToken.tokenId, selectedRound.id, investmentId)
      // Refresh the round data
      const updatedRound = await api.getFundingRound(selectedToken.tokenId, selectedRound.id)
      setSelectedRound(updatedRound)
      fetchData()
    } catch (e: any) {
      setModalError(e.detail || 'Failed to remove investment')
    } finally {
      setModalLoading(false)
    }
  }

  // Cancel convertible
  const handleCancelConvertible = (conv: ConvertibleInstrument) => {
    setConvertibleToCancel(conv)
  }

  const confirmCancelConvertible = async () => {
    if (!selectedToken || !convertibleToCancel) return
    setConvertibleToCancel(null)
    try {
      await api.cancelConvertible(selectedToken.tokenId, convertibleToCancel.id)
      fetchData()
    } catch (e: any) {
      setError(e.detail || 'Failed to cancel convertible')
    }
  }

  // Convert a convertible instrument at a funding round
  const handleConvertInstrument = async (convertibleId: number) => {
    if (!selectedToken || !selectedRound) return
    setModalLoading(true)
    setModalError(null)
    try {
      await api.convertInstrument(selectedToken.tokenId, convertibleId, selectedRound.id)
      // Refresh the round data and convertibles
      const updatedRound = await api.getFundingRound(selectedToken.tokenId, selectedRound.id)
      setSelectedRound(updatedRound)
      fetchData()
    } catch (e: any) {
      setModalError(e.detail || 'Failed to convert instrument')
    } finally {
      setModalLoading(false)
    }
  }

  // Open round detail modal
  const openRoundDetail = (round: FundingRound) => {
    setSelectedRound(round)
    setShowRoundDetailModal(true)
    setModalError(null)
    resetInvestmentForm()
  }

  useEffect(() => {
    fetchData()
  }, [selectedToken, selectedSlot])

  // Initialize dilution rounds with current valuation once data is loaded
  useEffect(() => {
    if (enhancedCapTable && !dilutionInitialized) {
      const valuation = enhancedCapTable.current_valuation || 0
      // Pre-money valuation = current valuation, Amount raised = 1.5x current valuation
      const amountRaised = Math.round(valuation * 1.5)
      setDilutionRounds([
        { name: 'Series A', pre_money_valuation: valuation, amount_raised: amountRaised }
      ])
      setDilutionInitialized(true)
    }
  }, [enhancedCapTable, dilutionInitialized])

  // Reset dilution initialization when token changes
  useEffect(() => {
    setDilutionInitialized(false)
    setDilutionRounds([])
    setDilutionResult(null)
  }, [selectedToken])

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to view investment details
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentValuation = enhancedCapTable?.current_valuation || 0
  const totalShares = enhancedCapTable?.total_shares || 0
  const totalCostBasis = enhancedCapTable?.total_cost_basis || 0
  const pricePerShare = enhancedCapTable?.price_per_share || 0

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Investment Management</h1>
          <p className="text-muted-foreground">
            Valuations, share classes, and investment modeling for {selectedToken.symbol}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
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

      {isViewingHistorical && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-500">Viewing Historical Data</AlertTitle>
          <AlertDescription className="text-amber-400">
            Showing investment data reconstructed at slot {enhancedCapTable?.slot ?? selectedSlot}.
            {enhancedCapTable?.slot !== selectedSlot && (
              <span className="block text-xs mt-1">
                Note: Showing nearest available data at slot {enhancedCapTable?.slot}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
              onClick={() => setSelectedSlot(null)}
            >
              Return to Live
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Valuation Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Current Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatDollars(currentValuation)}
            </div>
            <p className="text-xs text-muted-foreground">company value</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Price Per Share
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatDollarsDetailed(pricePerShare)}
            </div>
            <p className="text-xs text-muted-foreground">current price</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Total Invested
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatDollars(totalCostBasis)}
            </div>
            <p className="text-xs text-muted-foreground">cost basis</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b">
        <button
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'waterfall'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('waterfall')}
        >
          Waterfall Simulator
        </button>
        <button
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'dilution'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('dilution')}
        >
          Dilution Simulator
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Share Classes */}
          {(() => {
            // Filter to only show share classes with issued shares
            const shareClassesWithShares = shareClasses.filter((sc) => {
              const summary = enhancedCapTable?.share_classes?.find((s) => s.id === sc.id)
              return summary && summary.total_shares > 0
            })
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Share Classes
                  </CardTitle>
                  <CardDescription>
                    {shareClassesWithShares.length} share class{shareClassesWithShares.length !== 1 ? 'es' : ''} with issued shares
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : shareClassesWithShares.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No shares issued yet</p>
                  ) : (
                    <div className="space-y-3">
                      {shareClassesWithShares.map((sc) => (
                        <div key={sc.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium">{sc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Priority {sc.priority} | {sc.preference_multiple}x preference
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })()}

          {/* Funding Rounds */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Funding Rounds
                  </CardTitle>
                  <CardDescription>
                    {fundingRounds.length} round{fundingRounds.length !== 1 ? 's' : ''} recorded
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    resetFundingRoundForm()
                    setShowFundingRoundModal(true)
                  }}
                  disabled={shareClasses.length === 0}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Round
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : fundingRounds.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No funding rounds recorded</p>
              ) : (
                <div className="space-y-3">
                  {fundingRounds.map((round) => (
                    <div
                      key={round.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors"
                      onClick={() => openRoundDetail(round)}
                    >
                      <div>
                        <p className="font-medium">{round.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDollars(round.amount_raised)} raised at {formatDollars(round.post_money_valuation)} post
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          round.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                          round.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-gray-500/10 text-gray-500'
                        }`}>
                          {round.status}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Convertible Instruments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Convertible Instruments
                  </CardTitle>
                  <CardDescription>
                    {convertibles.filter(c => c.status === 'outstanding').length} outstanding
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    resetConvertibleForm()
                    setShowConvertibleModal(true)
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add SAFE/Note
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : convertibles.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No convertible instruments</p>
              ) : (
                <div className="space-y-3">
                  {convertibles.map((conv) => {
                    const isExpanded = expandedConvertibleId === conv.id
                    // Find the funding round if converted
                    const conversionRound = conv.status === 'converted' && fundingRounds.find(r => r.id === (conv as any).conversion_round_id)
                    return (
                      <div key={conv.id} className="bg-muted/50 rounded-lg overflow-hidden">
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/70 transition-colors"
                          onClick={() => setExpandedConvertibleId(isExpanded ? null : conv.id)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <p className="font-medium">
                                {conv.name || conv.instrument_type.toUpperCase()}
                                {conv.holder_name && ` - ${conv.holder_name}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDollars(conv.principal_amount)}
                                {conv.accrued_amount > conv.principal_amount && ` (${formatDollars(conv.accrued_amount)} accrued)`}
                                {conv.valuation_cap && ` | Cap: ${formatDollars(conv.valuation_cap)}`}
                                {conv.discount_rate && ` | ${(conv.discount_rate * 100).toFixed(0)}% discount`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              conv.status === 'outstanding' ? 'bg-blue-500/10 text-blue-500' :
                              conv.status === 'converted' ? 'bg-green-500/10 text-green-500' :
                              'bg-gray-500/10 text-gray-500'
                            }`}>
                              {conv.status}
                            </span>
                            {conv.status === 'outstanding' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCancelConvertible(conv)
                                }}
                                className="p-1 hover:bg-red-500/10 rounded text-red-500"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-muted">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs mt-3">
                              <div>
                                <span className="text-muted-foreground">Type:</span>
                                <p className="font-medium">{conv.instrument_type === 'safe' ? 'SAFE' : 'Convertible Note'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Holder Wallet:</span>
                                <p className="font-mono text-xs truncate">{conv.holder_wallet}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Principal:</span>
                                <p className="font-medium">{formatDollars(conv.principal_amount)}</p>
                              </div>
                              {conv.accrued_amount !== conv.principal_amount && (
                                <div>
                                  <span className="text-muted-foreground">Accrued Amount:</span>
                                  <p className="font-medium">{formatDollars(conv.accrued_amount)}</p>
                                </div>
                              )}
                              {conv.valuation_cap && (
                                <div>
                                  <span className="text-muted-foreground">Valuation Cap:</span>
                                  <p className="font-medium">{formatDollars(conv.valuation_cap)}</p>
                                </div>
                              )}
                              {conv.discount_rate && (
                                <div>
                                  <span className="text-muted-foreground">Discount Rate:</span>
                                  <p className="font-medium">{(conv.discount_rate * 100).toFixed(0)}%</p>
                                </div>
                              )}
                              {conv.interest_rate && (
                                <div>
                                  <span className="text-muted-foreground">Interest Rate:</span>
                                  <p className="font-medium">{(conv.interest_rate * 100).toFixed(1)}%</p>
                                </div>
                              )}
                              {conv.safe_type && (
                                <div>
                                  <span className="text-muted-foreground">SAFE Type:</span>
                                  <p className="font-medium">{conv.safe_type === 'post_money' ? 'Post-Money' : 'Pre-Money'}</p>
                                </div>
                              )}
                              <div>
                                <span className="text-muted-foreground">Created:</span>
                                <p className="font-medium">{new Date(conv.created_at).toLocaleDateString()}</p>
                              </div>
                              {/* Conversion details if converted */}
                              {conv.status === 'converted' && (
                                <>
                                  <div className="col-span-full border-t border-muted pt-2 mt-2">
                                    <p className="font-semibold text-green-600 mb-2">Conversion Details</p>
                                  </div>
                                  {conv.converted_at && (
                                    <div>
                                      <span className="text-muted-foreground">Converted On:</span>
                                      <p className="font-medium">{new Date(conv.converted_at).toLocaleDateString()}</p>
                                    </div>
                                  )}
                                  {conv.shares_received && (
                                    <div>
                                      <span className="text-muted-foreground">Shares Received:</span>
                                      <p className="font-medium text-green-600">{conv.shares_received.toLocaleString()}</p>
                                    </div>
                                  )}
                                  {conv.conversion_price && (
                                    <div>
                                      <span className="text-muted-foreground">Conversion Price:</span>
                                      <p className="font-medium">{formatDollarsDetailed(conv.conversion_price)}/share</p>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cap Table Summary by Share Class */}
          {(() => {
            // Filter to only show share classes with issued shares
            const shareClassesWithShares = enhancedCapTable?.share_classes?.filter((sc) => sc.total_shares > 0) || []
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Share Class Distribution
                  </CardTitle>
                  <CardDescription>Ownership by share class</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : shareClassesWithShares.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No shares issued yet</p>
                  ) : (
                    <div className="space-y-4">
                      {shareClassesWithShares.map((sc) => {
                        const pct = totalShares > 0 ? (sc.total_shares / totalShares) * 100 : 0
                        return (
                          <div key={sc.id}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{sc.name}</span>
                              <span>{pct.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-3">
                              <div
                                className="bg-primary h-3 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {sc.total_shares.toLocaleString()} shares | {formatDollars(sc.total_value)}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })()}
        </div>

        {/* Shareholders Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Shareholders
            </CardTitle>
            <CardDescription>
              All investors and their share positions - click a row for details
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : positions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No shares have been issued yet</p>
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
                      const positionKey = `${position.wallet}-${shareClass?.id || 0}`
                      const preference = position.preference_amount ?? (
                        shareClass
                          ? position.cost_basis * shareClass.preference_multiple
                          : position.cost_basis
                      )
                      const currentValue = position.current_value ?? position.cost_basis
                      const isExpanded = expandedPositionKey === positionKey
                      return (
                        <Fragment key={positionKey}>
                          <tr
                            className="border-b hover:bg-muted/50 cursor-pointer"
                            onClick={() => setExpandedPositionKey(isExpanded ? null : positionKey)}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1">
                                {isExpanded ? (
                                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                )}
                                <WalletAddress address={position.wallet} />
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-1 rounded text-xs ${
                                shareClass?.priority === 0 ? 'bg-red-500/10 text-red-500' :
                                (shareClass?.priority ?? 99) < 50 ? 'bg-purple-500/10 text-purple-500' :
                                (shareClass?.priority ?? 99) < 70 ? 'bg-blue-500/10 text-blue-500' :
                                (shareClass?.priority ?? 99) < 80 ? 'bg-green-500/10 text-green-500' :
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
                                {formatDollarsDetailed(position.shares > 0 ? Math.round(position.cost_basis / position.shares) : 0)}/share
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div>{formatDollars(currentValue)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDollarsDetailed(position.shares > 0 ? Math.round(currentValue / position.shares) : 0)}/share
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div>{formatDollars(preference)}</div>
                              <span className="text-xs text-muted-foreground">
                                ({shareClass?.preference_multiple || 1}x)
                              </span>
                            </td>
                          </tr>
                          {/* Expanded row with details */}
                          {isExpanded && (
                            <tr className="bg-muted/30">
                              <td colSpan={7} className="py-3 px-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Full Wallet:</span>
                                    <p className="font-mono text-xs break-all">{position.wallet}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Share Class:</span>
                                    <p className="font-medium">{shareClass?.name || 'Unknown'} ({shareClass?.symbol || '?'})</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Price Per Share:</span>
                                    <p className="font-medium">{formatDollarsDetailed(position.price_per_share)}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Preference Multiple:</span>
                                    <p className="font-medium">{shareClass?.preference_multiple || 1}x</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Ownership:</span>
                                    <p className="font-medium">
                                      {totalShares > 0 ? ((position.shares / totalShares) * 100).toFixed(2) : 0}%
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      )}

      {activeTab === 'waterfall' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Liquidation Waterfall Simulator
              </CardTitle>
              <CardDescription>
                Simulate how exit proceeds would be distributed based on share class priorities and liquidation preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="exitAmount">Exit Amount ($)</Label>
                  <Input
                    id="exitAmount"
                    type="number"
                    value={exitAmount}
                    onChange={(e) => setExitAmount(e.target.value)}
                    placeholder="10000000"
                  />
                </div>
                <Button onClick={runWaterfallSimulation} disabled={simulatorLoading}>
                  {simulatorLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4 mr-2" />
                  )}
                  Run Simulation
                </Button>
              </div>

              {waterfallResult && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Exit Amount</p>
                      <p className="text-2xl font-bold">{formatDollars(waterfallResult.exit_amount)}</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Distributed</p>
                      <p className="text-2xl font-bold">
                        {formatDollars(waterfallResult.exit_amount - waterfallResult.remaining_amount)}
                      </p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Remaining</p>
                      <p className="text-2xl font-bold">{formatDollars(waterfallResult.remaining_amount)}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-semibold">Distribution by Priority Tier</h4>
                    {waterfallResult.tiers.map((tier) => (
                      <div key={tier.priority} className="border rounded-lg overflow-hidden">
                        <div className="flex justify-between items-center px-4 py-3 bg-muted/30 border-b">
                          <div>
                            <span className="font-semibold text-lg">Priority {tier.priority}</span>
                            <span className="text-sm text-muted-foreground ml-3">
                              {tier.total_preference > 0 ? `Preference Pool: ${formatDollars(tier.total_preference)}` : 'Common Equity'}
                            </span>
                          </div>
                          {tier.total_preference > 0 && (
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              tier.fully_satisfied ? 'bg-green-500/15 text-green-600' : 'bg-amber-500/15 text-amber-600'
                            }`}>
                              {tier.fully_satisfied ? 'Fully Satisfied' : 'Partial'}
                            </span>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/20">
                                <th className="text-left py-3 px-4 font-medium">Wallet</th>
                                <th className="text-left py-3 px-4 font-medium">Share Class</th>
                                <th className="text-right py-3 px-4 font-medium">Shares</th>
                                <th className="text-right py-3 px-4 font-medium">Pref Multiple</th>
                                <th className="text-right py-3 px-4 font-medium">Cost Basis</th>
                                <th className="text-right py-3 px-4 font-medium">Total Payout</th>
                                <th className="text-right py-3 px-4 font-medium">$/Share</th>
                                <th className="text-right py-3 px-4 font-medium">Gain/Loss</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tier.payouts.map((payout, idx) => {
                                const payoutPerShare = payout.shares > 0 ? payout.payout / payout.shares : 0
                                const gainLoss = payout.cost_basis > 0 ? ((payout.payout - payout.cost_basis) / payout.cost_basis) * 100 : null
                                return (
                                  <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                                    <td className="py-3 px-4">
                                      <WalletAddress address={payout.wallet} />
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                        payout.share_class_name.includes('Preferred')
                                          ? 'bg-blue-500/10 text-blue-600'
                                          : 'bg-slate-500/10 text-slate-600'
                                      }`}>
                                        {payout.share_class_name}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono">
                                      {payout.shares.toLocaleString()}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                                      {payout.preference_multiple > 0 ? `${payout.preference_multiple}x` : '—'}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                                      {payout.cost_basis > 0 ? formatDollars(payout.cost_basis) : '—'}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono font-semibold text-green-600">
                                      {formatDollars(payout.payout)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                                      ${(payoutPerShare / 100).toFixed(2)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono">
                                      {gainLoss !== null ? (
                                        <span className={gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
                                          {gainLoss >= 0 ? '+' : ''}{gainLoss.toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-muted/40 font-medium">
                                <td className="py-3 px-4" colSpan={2}>Tier Total</td>
                                <td className="py-3 px-4 text-right font-mono">
                                  {tier.payouts.reduce((sum, p) => sum + p.shares, 0).toLocaleString()}
                                </td>
                                <td className="py-3 px-4"></td>
                                <td className="py-3 px-4 text-right font-mono">
                                  {formatDollars(tier.payouts.reduce((sum, p) => sum + p.cost_basis, 0))}
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-semibold text-green-600">
                                  {formatDollars(tier.amount_distributed)}
                                </td>
                                <td className="py-3 px-4"></td>
                                <td className="py-3 px-4"></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'dilution' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                Dilution Simulator
              </CardTitle>
              <CardDescription>
                Model the impact of hypothetical funding rounds on existing shareholders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold">Simulated Rounds</h4>
                  <Button variant="outline" size="sm" onClick={addDilutionRound}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Round
                  </Button>
                </div>

                {dilutionRounds.map((round, index) => (
                  <div key={index} className="grid gap-4 md:grid-cols-4 p-4 border rounded-lg">
                    <div>
                      <Label>Round Name</Label>
                      <Input
                        value={round.name}
                        onChange={(e) => updateDilutionRound(index, 'name', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Pre-Money Valuation ($)</Label>
                      <Input
                        type="number"
                        value={round.pre_money_valuation ? round.pre_money_valuation / 100 : ''}
                        onChange={(e) => updateDilutionRound(index, 'pre_money_valuation', e.target.value)}
                        placeholder="Enter valuation"
                      />
                    </div>
                    <div>
                      <Label>Amount Raised ($)</Label>
                      <Input
                        type="number"
                        value={round.amount_raised ? round.amount_raised / 100 : ''}
                        onChange={(e) => updateDilutionRound(index, 'amount_raised', e.target.value)}
                        placeholder="Enter amount"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeDilutionRound(index)}
                        disabled={dilutionRounds.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}

                <Button onClick={runDilutionSimulation} disabled={simulatorLoading}>
                  {simulatorLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4 mr-2" />
                  )}
                  Run Simulation
                </Button>
              </div>

              {dilutionResult && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h5 className="font-semibold mb-2">Before</h5>
                      <p className="text-sm">Valuation: {formatDollars(dilutionResult.before.valuation)}</p>
                      <p className="text-sm">Total Shares: {dilutionResult.before.total_shares.toLocaleString()}</p>
                      <p className="text-sm">Price/Share: {formatDollarsDetailed(dilutionResult.before.price_per_share)}</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h5 className="font-semibold mb-2">After</h5>
                      <p className="text-sm">Valuation: {formatDollars(dilutionResult.after.valuation)}</p>
                      <p className="text-sm">Total Shares: {dilutionResult.after.total_shares.toLocaleString()}</p>
                      <p className="text-sm">Price/Share: {formatDollarsDetailed(dilutionResult.after.price_per_share)}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3">Existing Holders</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">Wallet</th>
                            <th className="text-right py-2 px-3 font-medium">Investment</th>
                            <th className="text-right py-2 px-3 font-medium">Shares</th>
                            <th className="text-right py-2 px-3 font-medium">Price/Share</th>
                            <th className="text-right py-2 px-3 font-medium">Ownership</th>
                            <th className="text-right py-2 px-3 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dilutionResult.existing_holders.map((holder, idx) => {
                            const valueChangePct = holder.value_before > 0
                              ? ((holder.value_after - holder.value_before) / holder.value_before) * 100
                              : 0
                            const pricePerShareBefore = holder.shares_before > 0
                              ? holder.value_before / holder.shares_before
                              : 0
                            const pricePerShareAfter = holder.shares_after > 0
                              ? holder.value_after / holder.shares_after
                              : 0
                            return (
                              <tr key={idx} className="border-b hover:bg-muted/50">
                                <td className="py-2 px-3">
                                  <WalletAddress address={holder.wallet} />
                                </td>
                                <td className="py-2 px-3 text-right text-muted-foreground">—</td>
                                <td className="py-2 px-3 text-right">
                                  <div>{holder.shares_after.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">was {holder.shares_before.toLocaleString()}</div>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div>{formatDollarsDetailed(pricePerShareAfter)}</div>
                                  <div className="text-xs text-muted-foreground">was {formatDollarsDetailed(pricePerShareBefore)}</div>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div>{holder.ownership_after.toFixed(2)}%</div>
                                  <div className="text-xs text-muted-foreground">was {holder.ownership_before.toFixed(2)}%</div>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div>{formatDollars(holder.value_after)}</div>
                                  <div className="text-xs text-muted-foreground">was {formatDollars(holder.value_before)}</div>
                                  <div className={`text-xs font-medium ${valueChangePct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {valueChangePct >= 0 ? '+' : ''}{valueChangePct.toFixed(1)}%
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {dilutionResult.new_investors.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">New Investors</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-3 font-medium">Round</th>
                              <th className="text-right py-2 px-3 font-medium">Investment</th>
                              <th className="text-right py-2 px-3 font-medium">Shares</th>
                              <th className="text-right py-2 px-3 font-medium">Price/Share</th>
                              <th className="text-right py-2 px-3 font-medium">Ownership</th>
                              <th className="text-right py-2 px-3 font-medium">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dilutionResult.new_investors.map((investor, idx) => (
                              <tr key={idx} className="border-b hover:bg-muted/50">
                                <td className="py-2 px-3">{investor.round_name}</td>
                                <td className="py-2 px-3 text-right">{formatDollars(investor.amount_invested)}</td>
                                <td className="py-2 px-3 text-right">{investor.shares_received.toLocaleString()}</td>
                                <td className="py-2 px-3 text-right">{formatDollarsDetailed(investor.price_per_share)}</td>
                                <td className="py-2 px-3 text-right">{investor.ownership_pct.toFixed(2)}%</td>
                                <td className="py-2 px-3 text-right">{formatDollars(investor.amount_invested)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Funding Round Modal */}
      {showFundingRoundModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Create Funding Round</h2>
              <button onClick={() => setShowFundingRoundModal(false)} className="p-1 hover:bg-muted rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {modalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
                  {modalError}
                </div>
              )}

              <div>
                <Label htmlFor="roundName">Round Name</Label>
                <Input
                  id="roundName"
                  value={roundName}
                  onChange={(e) => setRoundName(e.target.value)}
                  placeholder="e.g., Seed Round, Series A"
                />
              </div>

              <div>
                <Label htmlFor="roundType">Round Type</Label>
                <select
                  id="roundType"
                  value={roundType}
                  onChange={(e) => setRoundType(e.target.value as RoundType)}
                  className="w-full p-2 border rounded bg-background"
                >
                  <option value="pre_seed">Pre-Seed</option>
                  <option value="seed">Seed</option>
                  <option value="series_a">Series A</option>
                  <option value="series_b">Series B</option>
                  <option value="series_c">Series C</option>
                  <option value="bridge">Bridge</option>
                  <option value="revaluation">Revaluation (409A / Appraisal)</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <Label htmlFor="roundShareClass">Share Class</Label>
                <select
                  id="roundShareClass"
                  value={roundShareClassId || ''}
                  onChange={(e) => setRoundShareClassId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full p-2 border rounded bg-background"
                >
                  <option value="">Select share class...</option>
                  {shareClasses.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name} ({sc.symbol}) - {sc.preference_multiple}x preference
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="roundPreMoney">Pre-Money Valuation ($)</Label>
                <Input
                  id="roundPreMoney"
                  type="number"
                  value={roundPreMoneyValuation}
                  onChange={(e) => setRoundPreMoneyValuation(e.target.value)}
                  placeholder="e.g., 10000000"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Price per share will be calculated based on current total supply
                </p>
              </div>

              <div>
                <Label htmlFor="roundNotes">Notes (optional)</Label>
                <Input
                  id="roundNotes"
                  value={roundNotes}
                  onChange={(e) => setRoundNotes(e.target.value)}
                  placeholder="Additional notes..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowFundingRoundModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateFundingRound}
                disabled={modalLoading || !roundName || !roundShareClassId || !roundPreMoneyValuation}
              >
                {modalLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Round
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Convertible Modal */}
      {showConvertibleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Add Convertible Instrument</h2>
              <button onClick={() => setShowConvertibleModal(false)} className="p-1 hover:bg-muted rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {modalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
                  {modalError}
                </div>
              )}

              <div>
                <Label htmlFor="convertibleType">Instrument Type</Label>
                <select
                  id="convertibleType"
                  value={convertibleType}
                  onChange={(e) => setConvertibleType(e.target.value as InstrumentType)}
                  className="w-full p-2 border rounded bg-background"
                >
                  <option value="safe">SAFE</option>
                  <option value="convertible_note">Convertible Note</option>
                </select>
              </div>

              {convertibleType === 'safe' && (
                <div>
                  <Label htmlFor="safeType">SAFE Type</Label>
                  <select
                    id="safeType"
                    value={convertibleSafeType}
                    onChange={(e) => setConvertibleSafeType(e.target.value as SafeType)}
                    className="w-full p-2 border rounded bg-background"
                  >
                    <option value="post_money">Post-Money</option>
                    <option value="pre_money">Pre-Money</option>
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="convertibleName">Name (optional)</Label>
                <Input
                  id="convertibleName"
                  value={convertibleName}
                  onChange={(e) => setConvertibleName(e.target.value)}
                  placeholder="e.g., Y Combinator SAFE"
                />
              </div>

              <div>
                <Label htmlFor="holderWallet">Holder Wallet Address</Label>
                <ApprovedWalletSelector
                  tokenId={selectedToken.tokenId}
                  value={convertibleHolderWallet}
                  onChange={setConvertibleHolderWallet}
                  placeholder="Select wallet"
                  allowlist={allowlist}
                />
              </div>

              <div>
                <Label htmlFor="holderName">Holder Name (optional)</Label>
                <Input
                  id="holderName"
                  value={convertibleHolderName}
                  onChange={(e) => setConvertibleHolderName(e.target.value)}
                  placeholder="e.g., Sequoia Capital"
                />
              </div>

              <div>
                <Label htmlFor="principal">Principal Amount ($)</Label>
                <Input
                  id="principal"
                  type="number"
                  value={convertiblePrincipal}
                  onChange={(e) => setConvertiblePrincipal(e.target.value)}
                  placeholder="e.g., 500000"
                />
              </div>

              <div>
                <Label htmlFor="valuationCap">Valuation Cap ($ - optional)</Label>
                <Input
                  id="valuationCap"
                  type="number"
                  value={convertibleValuationCap}
                  onChange={(e) => setConvertibleValuationCap(e.target.value)}
                  placeholder="e.g., 10000000"
                />
              </div>

              <div>
                <Label htmlFor="discount">Discount Rate (% - optional)</Label>
                <Input
                  id="discount"
                  type="number"
                  value={convertibleDiscount}
                  onChange={(e) => setConvertibleDiscount(e.target.value)}
                  placeholder="e.g., 20"
                />
              </div>

              {convertibleType === 'convertible_note' && (
                <>
                  <div>
                    <Label htmlFor="interestRate">Interest Rate (%)</Label>
                    <Input
                      id="interestRate"
                      type="number"
                      value={convertibleInterestRate}
                      onChange={(e) => setConvertibleInterestRate(e.target.value)}
                      placeholder="e.g., 5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maturityDate">Maturity Date</Label>
                    <Input
                      id="maturityDate"
                      type="date"
                      value={convertibleMaturityDate}
                      onChange={(e) => setConvertibleMaturityDate(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="convertibleNotes">Notes (optional)</Label>
                <Input
                  id="convertibleNotes"
                  value={convertibleNotes}
                  onChange={(e) => setConvertibleNotes(e.target.value)}
                  placeholder="Additional notes..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowConvertibleModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateConvertible}
                disabled={modalLoading || !convertibleHolderWallet || !convertiblePrincipal}
              >
                {modalLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Funding Round Detail Modal */}
      {showRoundDetailModal && selectedRound && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">{selectedRound.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedRound.round_type.replace('_', ' ').toUpperCase()} - {selectedRound.status}
                </p>
              </div>
              <button onClick={() => setShowRoundDetailModal(false)} className="p-1 hover:bg-muted rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {modalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
                  {modalError}
                </div>
              )}

              {/* Round Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted/50 rounded">
                  <p className="text-xs text-muted-foreground">Pre-Money</p>
                  <p className="font-semibold">{formatDollars(selectedRound.pre_money_valuation)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded">
                  <p className="text-xs text-muted-foreground">Amount Raised</p>
                  <p className="font-semibold">{formatDollars(selectedRound.amount_raised)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded">
                  <p className="text-xs text-muted-foreground">Post-Money</p>
                  <p className="font-semibold">{formatDollars(selectedRound.post_money_valuation)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded">
                  <p className="text-xs text-muted-foreground">Price/Share</p>
                  <p className="font-semibold">{formatDollarsDetailed(selectedRound.price_per_share)}</p>
                </div>
              </div>

              {/* Investments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Investments ({selectedRound.investments?.length || 0})
                  </h3>
                </div>

                {selectedRound.investments && selectedRound.investments.length > 0 ? (
                  <div className="space-y-2">
                    {selectedRound.investments.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="flex items-center gap-2">
                            <WalletAddress address={inv.investor_wallet} />
                            {inv.investor_name && <span className="text-sm">({inv.investor_name})</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDollars(inv.amount)} → {inv.shares_received.toLocaleString()} shares
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            inv.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                            inv.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                            'bg-gray-500/10 text-gray-500'
                          }`}>
                            {inv.status}
                          </span>
                          {selectedRound.status === 'pending' && (
                            <button
                              onClick={() => handleRemoveInvestment(inv.id)}
                              disabled={modalLoading}
                              className="p-1 hover:bg-red-500/10 rounded text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No investments yet</p>
                )}
              </div>

              {/* Add Investment Form (only for pending rounds) */}
              {selectedRound.status === 'pending' && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Add Investment</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="investorWallet">Wallet Address</Label>
                      <ApprovedWalletSelector
                        tokenId={selectedToken.tokenId}
                        value={investorWallet}
                        onChange={setInvestorWallet}
                        placeholder="Select wallet"
                        allowlist={allowlist}
                      />
                    </div>
                    <div>
                      <Label htmlFor="investorName">Name (optional)</Label>
                      <Input
                        id="investorName"
                        value={investorName}
                        onChange={(e) => setInvestorName(e.target.value)}
                        placeholder="Investor name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="investmentAmount">Amount ($)</Label>
                      <Input
                        id="investmentAmount"
                        type="number"
                        value={investmentAmount}
                        onChange={(e) => setInvestmentAmount(e.target.value)}
                        placeholder="Investment amount"
                      />
                    </div>
                  </div>
                  <Button
                    className="mt-3"
                    onClick={handleAddInvestment}
                    disabled={modalLoading || !investorWallet || !investmentAmount}
                  >
                    {modalLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Add Investment
                  </Button>
                </div>
              )}

              {/* Convert Outstanding SAFEs/Notes (only for pending rounds with outstanding convertibles) */}
              {selectedRound.status === 'pending' && convertibles.filter(c => c.status === 'outstanding').length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Convert SAFEs/Notes at This Round
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Convert outstanding convertible instruments to shares at this round&apos;s valuation
                  </p>
                  <div className="space-y-2">
                    {convertibles.filter(c => c.status === 'outstanding').map((conv) => {
                      // Calculate conversion preview
                      const effectivePrice = selectedRound.price_per_share > 0 ? selectedRound.price_per_share : 0
                      const discountedPrice = conv.discount_rate ? effectivePrice * (1 - conv.discount_rate) : effectivePrice
                      const cappedPrice = conv.valuation_cap && totalShares > 0
                        ? (conv.valuation_cap * 100) / totalShares
                        : Infinity
                      const conversionPrice = Math.min(discountedPrice, cappedPrice)
                      const estimatedShares = conversionPrice > 0 ? Math.floor(conv.accrued_amount / conversionPrice) : 0

                      return (
                        <div key={conv.id} className="flex items-center justify-between p-3 border rounded bg-muted/30">
                          <div className="flex-1">
                            <p className="font-medium">
                              {conv.name || conv.instrument_type.toUpperCase()}
                              {conv.holder_name && ` - ${conv.holder_name}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDollars(conv.accrued_amount)}
                              {conv.valuation_cap && ` | Cap: ${formatDollars(conv.valuation_cap)}`}
                              {conv.discount_rate && ` | ${(conv.discount_rate * 100).toFixed(0)}% discount`}
                            </p>
                            {effectivePrice > 0 && (
                              <p className="text-xs text-green-600 mt-1">
                                Est. {estimatedShares.toLocaleString()} shares @ {formatDollarsDetailed(conversionPrice)}/share
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleConvertInstrument(conv.id)}
                            disabled={modalLoading}
                          >
                            {modalLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Convert'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex justify-between gap-2 p-4 border-t">
              <div>
                {selectedRound.status === 'pending' && (
                  <Button
                    variant="destructive"
                    onClick={handleCancelFundingRound}
                    disabled={modalLoading}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Cancel Round
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowRoundDetailModal(false)}>
                  Close
                </Button>
                {selectedRound.status === 'pending' && selectedRound.investments && selectedRound.investments.length > 0 && (
                  <Button onClick={handleCloseFundingRound} disabled={modalLoading}>
                    {modalLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                    Close Round & Issue Shares
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Convertible Confirmation Dialog */}
      <ConfirmDialog
        open={!!convertibleToCancel}
        onOpenChange={(open) => !open && setConvertibleToCancel(null)}
        title="Cancel Convertible Instrument"
        description={`Are you sure you want to cancel this ${convertibleToCancel?.instrument_type === 'safe' ? 'SAFE' : 'convertible note'}${convertibleToCancel?.name ? ` (${convertibleToCancel.name})` : ''}? This action cannot be undone.`}
        confirmLabel="Cancel Instrument"
        variant="destructive"
        onConfirm={confirmCancelConvertible}
      />
    </div>
  )
}
