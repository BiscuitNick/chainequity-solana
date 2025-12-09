'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/stores/useAppStore'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  Calculator,
  RefreshCw,
  Plus,
  Building2,
  Layers,
  FileText,
  ChevronRight,
} from 'lucide-react'
import {
  api,
  EnhancedCapTableResponse,
  ShareClass,
  FundingRound,
  ConvertibleInstrument,
  WaterfallResponse,
  DilutionResponse,
  SimulatedRoundInput,
} from '@/lib/api'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data states
  const [enhancedCapTable, setEnhancedCapTable] = useState<EnhancedCapTableResponse | null>(null)
  const [shareClasses, setShareClasses] = useState<ShareClass[]>([])
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>([])
  const [convertibles, setConvertibles] = useState<ConvertibleInstrument[]>([])

  // Simulator states
  const [activeTab, setActiveTab] = useState<'overview' | 'waterfall' | 'dilution'>('overview')
  const [exitAmount, setExitAmount] = useState<string>('10000000') // $10M default
  const [waterfallResult, setWaterfallResult] = useState<WaterfallResponse | null>(null)
  const [dilutionRounds, setDilutionRounds] = useState<SimulatedRoundInput[]>([
    { name: 'Series A', pre_money_valuation: 2000000000, amount_raised: 500000000 }, // $20M pre, $5M raise
  ])
  const [dilutionResult, setDilutionResult] = useState<DilutionResponse | null>(null)
  const [simulatorLoading, setSimulatorLoading] = useState(false)

  const fetchData = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const [capTableData, classesData, roundsData, convertiblesData] = await Promise.all([
        api.getEnhancedCapTable(selectedToken.tokenId).catch(() => null),
        api.getShareClasses(selectedToken.tokenId).catch(() => []),
        api.getFundingRounds(selectedToken.tokenId).catch(() => []),
        api.getConvertibles(selectedToken.tokenId).catch(() => []),
      ])
      setEnhancedCapTable(capTableData)
      setShareClasses(classesData)
      setFundingRounds(roundsData)
      setConvertibles(convertiblesData)
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
    setDilutionRounds([
      ...dilutionRounds,
      { name: `Round ${dilutionRounds.length + 1}`, pre_money_valuation: 5000000000, amount_raised: 1000000000 },
    ])
  }

  const updateDilutionRound = (index: number, field: keyof SimulatedRoundInput, value: string | number) => {
    const updated = [...dilutionRounds]
    if (field === 'name') {
      updated[index].name = value as string
    } else {
      updated[index][field] = Math.round(parseFloat(value as string) * 100) // Convert dollars to cents
    }
    setDilutionRounds(updated)
  }

  const removeDilutionRound = (index: number) => {
    setDilutionRounds(dilutionRounds.filter((_, i) => i !== index))
  }

  useEffect(() => {
    fetchData()
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
  const totalCurrentValue = enhancedCapTable?.total_current_value || 0
  const pricePerShare = enhancedCapTable?.price_per_share || 0
  const totalGain = totalCurrentValue - totalCostBasis
  const gainPercent = totalCostBasis > 0 ? ((totalGain / totalCostBasis) * 100) : 0

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

      {/* Valuation Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {totalGain >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              Unrealized Gain
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {loading ? '...' : `${totalGain >= 0 ? '+' : ''}${formatDollars(totalGain)}`}
            </div>
            <p className="text-xs text-muted-foreground">
              {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(1)}% return
            </p>
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
        <div className="grid gap-6 md:grid-cols-2">
          {/* Share Classes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Share Classes
              </CardTitle>
              <CardDescription>
                {shareClasses.length} share class{shareClasses.length !== 1 ? 'es' : ''} configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : shareClasses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No share classes configured</p>
              ) : (
                <div className="space-y-3">
                  {shareClasses.map((sc) => (
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

          {/* Funding Rounds */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Funding Rounds
              </CardTitle>
              <CardDescription>
                {fundingRounds.length} round{fundingRounds.length !== 1 ? 's' : ''} completed
              </CardDescription>
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
                    <div key={round.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{round.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDollars(round.amount_raised)} raised at {formatDollars(round.post_money_valuation)} post
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        round.status === 'closed' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {round.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Convertible Instruments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Convertible Instruments
              </CardTitle>
              <CardDescription>
                {convertibles.length} instrument{convertibles.length !== 1 ? 's' : ''} outstanding
              </CardDescription>
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
                  {convertibles.map((conv) => (
                    <div key={conv.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{conv.instrument_type.toUpperCase()}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDollars(conv.principal_amount)}
                          {conv.valuation_cap && ` | Cap: ${formatDollars(conv.valuation_cap)}`}
                          {conv.discount_rate && ` | ${(conv.discount_rate * 100).toFixed(0)}% discount`}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        conv.status === 'outstanding' ? 'bg-blue-500/10 text-blue-500' :
                        conv.status === 'converted' ? 'bg-green-500/10 text-green-500' :
                        'bg-gray-500/10 text-gray-500'
                      }`}>
                        {conv.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cap Table Summary by Share Class */}
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
              ) : !enhancedCapTable?.share_classes?.length ? (
                <p className="text-center text-muted-foreground py-8">No share class data</p>
              ) : (
                <div className="space-y-4">
                  {enhancedCapTable.share_classes.map((sc) => {
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
                      <div key={tier.priority} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">Priority {tier.priority}</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            tier.fully_satisfied ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                          }`}>
                            {tier.fully_satisfied ? 'Fully Satisfied' : 'Partial'}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground mb-3">
                          Preference: {formatDollars(tier.total_preference)} |
                          Distributed: {formatDollars(tier.amount_distributed)}
                        </div>
                        <div className="space-y-2">
                          {tier.payouts.map((payout, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="font-mono">{payout.wallet.slice(0, 8)}...{payout.wallet.slice(-4)}</span>
                              <span className="text-muted-foreground">{payout.share_class_name}</span>
                              <span className="font-medium">{formatDollars(payout.payout)}</span>
                            </div>
                          ))}
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
                        value={round.pre_money_valuation / 100}
                        onChange={(e) => updateDilutionRound(index, 'pre_money_valuation', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Amount Raised ($)</Label>
                      <Input
                        type="number"
                        value={round.amount_raised / 100}
                        onChange={(e) => updateDilutionRound(index, 'amount_raised', e.target.value)}
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
                    <h4 className="font-semibold mb-3">Impact on Existing Holders</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">Wallet</th>
                            <th className="text-right py-2 px-3 font-medium">Ownership Before</th>
                            <th className="text-right py-2 px-3 font-medium">Ownership After</th>
                            <th className="text-right py-2 px-3 font-medium">Dilution</th>
                            <th className="text-right py-2 px-3 font-medium">Value Before</th>
                            <th className="text-right py-2 px-3 font-medium">Value After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dilutionResult.existing_holders.map((holder, idx) => (
                            <tr key={idx} className="border-b hover:bg-muted/50">
                              <td className="py-2 px-3 font-mono text-sm">
                                {holder.wallet.slice(0, 8)}...{holder.wallet.slice(-4)}
                              </td>
                              <td className="py-2 px-3 text-right">{holder.ownership_before.toFixed(2)}%</td>
                              <td className="py-2 px-3 text-right">{holder.ownership_after.toFixed(2)}%</td>
                              <td className="py-2 px-3 text-right text-red-500">-{holder.dilution_pct.toFixed(2)}%</td>
                              <td className="py-2 px-3 text-right">{formatDollars(holder.value_before)}</td>
                              <td className="py-2 px-3 text-right">
                                <span className={holder.value_after >= holder.value_before ? 'text-green-500' : 'text-red-500'}>
                                  {formatDollars(holder.value_after)}
                                </span>
                              </td>
                            </tr>
                          ))}
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
    </div>
  )
}
