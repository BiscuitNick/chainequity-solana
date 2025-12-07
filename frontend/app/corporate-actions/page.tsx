'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Split, Type, History, AlertCircle, RefreshCw, Copy, Check } from 'lucide-react'
import { api, CorporateAction } from '@/lib/api'
import { StockSplitModal } from '@/components/StockSplitModal'
import { ChangeSymbolModal } from '@/components/ChangeSymbolModal'

export default function CorporateActionsPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [showSymbolModal, setShowSymbolModal] = useState(false)
  const [actions, setActions] = useState<CorporateAction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null)

  const copySlotToClipboard = async (slot: number) => {
    await navigator.clipboard.writeText(slot.toString())
    setCopiedSlot(slot)
    setTimeout(() => setCopiedSlot(null), 2000)
  }

  const fetchCorporateActions = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getCorporateActions(selectedToken.tokenId)
      setActions(data)
    } catch (e: any) {
      console.error('Failed to fetch corporate actions:', e)
      setError(e.detail || 'Failed to fetch corporate actions')
      setActions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCorporateActions()
  }, [selectedToken])

  const typeIcons: Record<string, JSX.Element> = {
    stock_split: <Split className="h-4 w-4" />,
    symbol_change: <Type className="h-4 w-4" />,
    reverse_split: <Split className="h-4 w-4 rotate-180" />,
  }

  const getActionDescription = (action: CorporateAction): string => {
    switch (action.action_type) {
      case 'stock_split':
        return `${action.action_data.numerator}:${action.action_data.denominator} Stock Split`
      case 'reverse_split':
        return `${action.action_data.numerator}:${action.action_data.denominator} Reverse Split`
      case 'symbol_change':
        return `Symbol changed from ${action.action_data.old_symbol} to ${action.action_data.new_symbol}`
      default:
        return action.action_type
    }
  }

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to manage corporate actions
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
          <h1 className="text-3xl font-bold tracking-tight">Corporate Actions</h1>
          <p className="text-muted-foreground">
            Stock splits and symbol changes for {selectedToken.symbol}
          </p>
        </div>
        <Button variant="outline" onClick={fetchCorporateActions} disabled={loading}>
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Split className="h-5 w-5" />
              Stock Split
            </CardTitle>
            <CardDescription>
              Increase or decrease shares proportionally for all holders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              A stock split divides existing shares into multiple shares. For example, a 2:1 split
              doubles each holder's shares while halving the per-share price equivalent.
            </p>
            <Button onClick={() => setShowSplitModal(true)}>
              <Split className="h-4 w-4 mr-2" />
              Execute Split
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Symbol Change
            </CardTitle>
            <CardDescription>
              Update the token's trading symbol
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Change the token symbol following a rebrand or corporate restructuring.
              This requires multi-sig approval.
            </p>
            <Button onClick={() => setShowSymbolModal(true)}>
              <Type className="h-4 w-4 mr-2" />
              Change Symbol
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-yellow-500/50 bg-yellow-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-500">Important Notice</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Corporate actions are irreversible and affect all token holders. They require
                multi-sig approval and may need to pass a governance vote depending on your
                token's configuration. Please ensure compliance with all applicable securities laws.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Action History
          </CardTitle>
          <CardDescription>Past corporate actions for this token</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : actions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No corporate actions have been executed
            </p>
          ) : (
            <div className="space-y-4">
              {actions.map((action) => (
                <div key={action.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                      {typeIcons[action.action_type] || <History className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-medium">{getActionDescription(action)}</p>
                      <p className="text-xs text-muted-foreground">
                        Executed on {new Date(action.executed_at).toLocaleString()} by {action.executed_by.slice(0, 4)}...{action.executed_by.slice(-4)}
                      </p>
                      {action.slot !== undefined && action.slot !== null && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>Slot #{action.slot.toLocaleString()}</span>
                          <button
                            onClick={() => copySlotToClipboard(action.slot!)}
                            className="p-0.5 hover:bg-muted rounded transition-colors"
                            title="Copy slot number"
                          >
                            {copiedSlot === action.slot ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            )}
                          </button>
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded text-xs capitalize bg-green-500/10 text-green-500">
                    executed
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock Split Modal */}
      <StockSplitModal
        isOpen={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        onSuccess={fetchCorporateActions}
        tokenId={selectedToken.tokenId}
        tokenSymbol={selectedToken.symbol}
      />

      {/* Change Symbol Modal */}
      <ChangeSymbolModal
        isOpen={showSymbolModal}
        onClose={() => setShowSymbolModal(false)}
        onSuccess={fetchCorporateActions}
        tokenId={selectedToken.tokenId}
        currentSymbol={selectedToken.symbol}
      />
    </div>
  )
}
