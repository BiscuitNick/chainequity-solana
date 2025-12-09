'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Coins, AlertTriangle } from 'lucide-react'
import { api, AllowlistEntry } from '@/lib/api'

interface IssueTokensModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tokenId: number
  tokenSymbol: string
  wallet: AllowlistEntry | null
}

export function IssueTokensModal({ isOpen, onClose, onSuccess, tokenId, tokenSymbol, wallet }: IssueTokensModalProps) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!isOpen || !wallet) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const amountNum = parseInt(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount greater than 0')
      return
    }

    if (wallet.status !== 'active') {
      setError('Cannot issue tokens to a wallet that is not active')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await api.issueTokens(tokenId, {
        recipient: wallet.address,
        amount: amountNum,
        notes: notes || undefined,
      })

      setSuccess(`Successfully prepared issuance of ${amountNum.toLocaleString()} ${tokenSymbol} tokens`)

      // Reset form after short delay
      setTimeout(() => {
        setAmount('')
        setNotes('')
        setSuccess(null)
        onSuccess()
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(err.detail || err.message || 'Failed to issue tokens')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              <CardTitle>Issue Tokens</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Issue {tokenSymbol} tokens to an approved wallet
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Recipient info */}
            <div className="p-3 bg-muted rounded-md space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recipient:</span>
                <span className="font-mono">{wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  wallet.status === 'active' ? 'bg-green-500/10 text-green-500' :
                  wallet.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                  'bg-red-500/10 text-red-500'
                }`}>
                  {wallet.status}
                </span>
              </div>
            </div>

            {wallet.status !== 'active' && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                <p className="text-sm text-yellow-500">
                  This wallet must be approved before tokens can be issued.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount</label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount to issue"
                  min="1"
                  className="w-full px-3 py-2 border rounded-md bg-background pr-16"
                  disabled={isSubmitting || wallet.status !== 'active'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {tokenSymbol}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tokens will be minted and transferred to the recipient wallet
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Employee grant, Advisor allocation, etc."
                rows={2}
                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                disabled={isSubmitting || wallet.status !== 'active'}
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
                <p className="text-sm text-green-500">{success}</p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || wallet.status !== 'active' || !amount}
            >
              {isSubmitting ? 'Issuing...' : 'Issue Tokens'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
