'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Info, Terminal } from 'lucide-react'
import { useSolanaWallet } from '@/hooks/useSolana'

interface CreateTokenModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function CreateTokenModal({ isOpen, onClose, onSuccess }: CreateTokenModalProps) {
  const { isConnected, publicKey } = useSolanaWallet()
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [totalSupply, setTotalSupply] = useState('1000000')
  const [decimals, setDecimals] = useState('6')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isConnected) {
      setError('Please connect your wallet first')
      return
    }

    if (!symbol || !name) {
      setError('Symbol and name are required')
      return
    }

    setIsSubmitting(true)

    try {
      // For now, show instructions for using the CLI
      // In a production app, this would build and send an Anchor transaction
      setError(
        'Token creation via UI coming soon! For now, use the Anchor CLI:\n\n' +
        `anchor run init-factory\n` +
        `# Then create token with your parameters`
      )
    } catch (err: any) {
      setError(err.message || 'Failed to create token')
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
            <CardTitle>Create Security Token</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Create a new tokenized security on Solana
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {!isConnected && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-start gap-2">
                <Info className="h-4 w-4 text-yellow-500 mt-0.5" />
                <p className="text-sm text-yellow-500">
                  Please connect your wallet to create a token
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g., ACME"
                maxLength={10}
                className="w-full px-3 py-2 border rounded-md bg-background"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Acme Corporation"
                maxLength={50}
                className="w-full px-3 py-2 border rounded-md bg-background"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Total Supply</label>
                <input
                  type="number"
                  value={totalSupply}
                  onChange={(e) => setTotalSupply(e.target.value)}
                  placeholder="1000000"
                  min="1"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Decimals</label>
                <input
                  type="number"
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                  placeholder="6"
                  min="0"
                  max="18"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>
              </div>
            )}

            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4" />
                <span className="text-sm font-medium">CLI Alternative</span>
              </div>
              <p className="text-xs text-muted-foreground">
                You can also create tokens using the Anchor CLI with:
              </p>
              <code className="text-xs block mt-1 p-2 bg-background rounded">
                anchor run init-factory
              </code>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isConnected || isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Token'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
