'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Split, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'

interface StockSplitModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tokenId: number
  tokenSymbol: string
}

export function StockSplitModal({ isOpen, onClose, onSuccess, tokenId, tokenSymbol }: StockSplitModalProps) {
  const [numerator, setNumerator] = useState(2)
  const [denominator, setDenominator] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const splitRatio = numerator / denominator
  const isForwardSplit = splitRatio > 1
  const isReverseSplit = splitRatio < 1

  const handleSubmit = async () => {
    if (confirmText !== 'EXECUTE') {
      setError('Please type EXECUTE to confirm')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await api.executeStockSplit(tokenId, { numerator, denominator })
      onSuccess()
      onClose()
      // Reset form
      setNumerator(2)
      setDenominator(1)
      setConfirmText('')
    } catch (e: any) {
      setError(e.detail || 'Failed to execute stock split')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-[500px] max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Split className="h-5 w-5" />
              Execute Stock Split
            </CardTitle>
            <CardDescription>Split shares for {tokenSymbol}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 items-center">
              <div>
                <label className="text-sm text-muted-foreground">Numerator</label>
                <input
                  type="number"
                  min="1"
                  value={numerator}
                  onChange={(e) => setNumerator(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border rounded bg-background text-2xl font-bold text-center"
                />
              </div>
              <div className="text-center text-2xl font-bold text-muted-foreground">:</div>
              <div>
                <label className="text-sm text-muted-foreground">Denominator</label>
                <input
                  type="number"
                  min="1"
                  value={denominator}
                  onChange={(e) => setDenominator(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border rounded bg-background text-2xl font-bold text-center"
                />
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground mb-2">Split Effect</div>
              <div className="text-lg font-semibold">
                {isForwardSplit ? (
                  <span className="text-green-500">
                    Forward Split: Each share becomes {splitRatio.toFixed(2)} shares
                  </span>
                ) : isReverseSplit ? (
                  <span className="text-yellow-500">
                    Reverse Split: Every {denominator} shares become {numerator} share(s)
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    No change (1:1 ratio)
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Example: A holder with 1,000 shares will have {((1000 * numerator) / denominator).toLocaleString()} shares after the split
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                <div className="text-sm">
                  <span className="font-semibold text-yellow-500">Warning:</span>
                  <span className="text-muted-foreground ml-1">
                    Stock splits are irreversible and affect all token holders. This action cannot be undone.
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                Type <span className="font-mono font-bold">EXECUTE</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="EXECUTE"
                className="w-full px-3 py-2 border rounded bg-background"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || numerator === denominator || confirmText !== 'EXECUTE'}
              className="bg-primary"
            >
              {loading ? 'Executing...' : 'Execute Split'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
