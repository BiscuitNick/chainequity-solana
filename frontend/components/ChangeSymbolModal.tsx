'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Type, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'

interface ChangeSymbolModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tokenId: number
  currentSymbol: string
}

export function ChangeSymbolModal({ isOpen, onClose, onSuccess, tokenId, currentSymbol }: ChangeSymbolModalProps) {
  const [newSymbol, setNewSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const isValidSymbol = newSymbol.length >= 2 && newSymbol.length <= 10 && /^[A-Za-z0-9]+$/.test(newSymbol)
  const isDifferent = newSymbol.toUpperCase() !== currentSymbol.toUpperCase()

  const handleSubmit = async () => {
    if (confirmText !== 'CHANGE') {
      setError('Please type CHANGE to confirm')
      return
    }

    if (!isValidSymbol) {
      setError('Symbol must be 2-10 alphanumeric characters')
      return
    }

    if (!isDifferent) {
      setError('New symbol must be different from current symbol')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await api.changeSymbol(tokenId, newSymbol)
      onSuccess()
      onClose()
      // Reset form
      setNewSymbol('')
      setConfirmText('')
    } catch (e: any) {
      setError(e.detail || 'Failed to change symbol')
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
              <Type className="h-5 w-5" />
              Change Token Symbol
            </CardTitle>
            <CardDescription>Update the trading symbol</CardDescription>
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
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Current Symbol</div>
              <div className="text-2xl font-bold font-mono">{currentSymbol}</div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">New Symbol</label>
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                placeholder="Enter new symbol"
                maxLength={10}
                className="w-full px-3 py-2 border rounded bg-background text-2xl font-bold font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground mt-1">
                2-10 alphanumeric characters only
              </p>
            </div>

            {newSymbol && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Preview</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-mono line-through text-muted-foreground">{currentSymbol}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className={`text-lg font-mono font-bold ${isValidSymbol && isDifferent ? 'text-green-500' : 'text-red-500'}`}>
                    {newSymbol || '???'}
                  </span>
                </div>
                {!isValidSymbol && newSymbol && (
                  <p className="text-xs text-red-500 mt-2">Invalid symbol format</p>
                )}
                {!isDifferent && newSymbol && (
                  <p className="text-xs text-red-500 mt-2">Symbol must be different from current</p>
                )}
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                <div className="text-sm">
                  <span className="font-semibold text-yellow-500">Warning:</span>
                  <span className="text-muted-foreground ml-1">
                    Symbol changes are recorded permanently and visible in the corporate action history.
                    The new symbol must not already be in use by another token.
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                Type <span className="font-mono font-bold">CHANGE</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CHANGE"
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
              disabled={loading || !isValidSymbol || !isDifferent || confirmText !== 'CHANGE'}
              className="bg-primary"
            >
              {loading ? 'Changing...' : 'Change Symbol'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
