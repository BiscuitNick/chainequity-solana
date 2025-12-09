'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Info } from 'lucide-react'
import { api } from '@/lib/api'

interface AddWalletModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tokenId: number
}

export function AddWalletModal({ isOpen, onClose, onSuccess, tokenId }: AddWalletModalProps) {
  const [address, setAddress] = useState('')
  const [autoApprove, setAutoApprove] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!address) {
      setError('Wallet address is required')
      return
    }

    // Basic Solana address validation (base58, 32-44 chars)
    if (address.length < 32 || address.length > 44) {
      setError('Invalid Solana wallet address')
      return
    }

    setIsSubmitting(true)

    try {
      if (autoApprove) {
        // Add and approve in one step
        await api.approveWallet(tokenId, { address })
      } else {
        // Just add with pending status
        await api.addToAllowlist(tokenId, { address })
      }

      // Reset form
      setAddress('')
      setAutoApprove(false)

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.detail || err.message || 'Failed to add wallet')
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
            <CardTitle>Add Wallet to Allowlist</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Add a new wallet address to the token allowlist
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Wallet Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value.trim())}
                placeholder="Enter Solana wallet address"
                className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoApprove"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="rounded"
                disabled={isSubmitting}
              />
              <label htmlFor="autoApprove" className="text-sm">
                Approve immediately (skip pending status)
              </label>
            </div>

            {!autoApprove && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                <p className="text-sm text-blue-500">
                  Wallet will be added with "pending" status. You can approve it later.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : autoApprove ? 'Add & Approve' : 'Add Wallet'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
