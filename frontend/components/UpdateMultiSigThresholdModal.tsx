'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Shield, AlertTriangle, Info } from 'lucide-react'
import { api, MultiSigConfigResponse } from '@/lib/api'

interface UpdateMultiSigThresholdModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tokenId: number
}

export function UpdateMultiSigThresholdModal({ isOpen, onClose, onSuccess, tokenId }: UpdateMultiSigThresholdModalProps) {
  const [currentConfig, setCurrentConfig] = useState<MultiSigConfigResponse | null>(null)
  const [newThreshold, setNewThreshold] = useState(1)
  const [confirmText, setConfirmText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchCurrentConfig()
    }
  }, [isOpen, tokenId])

  const fetchCurrentConfig = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const config = await api.getMultiSigInfo(tokenId)
      setCurrentConfig(config)
      setNewThreshold(config.threshold)
    } catch (err: any) {
      setError(err.detail || 'Failed to load multi-sig configuration')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!currentConfig) return

    if (confirmText !== 'UPDATE') {
      setError('Please type UPDATE to confirm')
      return
    }

    if (newThreshold < 1) {
      setError('Threshold must be at least 1')
      return
    }

    if (newThreshold > currentConfig.signers.length) {
      setError(`Threshold cannot exceed number of signers (${currentConfig.signers.length})`)
      return
    }

    setIsSubmitting(true)

    try {
      await api.updateMultiSigThreshold(tokenId, newThreshold)
      setConfirmText('')
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.detail || err.message || 'Failed to update threshold')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setConfirmText('')
    setError(null)
    onClose()
  }

  const signerCount = currentConfig?.signers.length || 0
  const isDecreasing = currentConfig && newThreshold < currentConfig.threshold
  const isIncreasing = currentConfig && newThreshold > currentConfig.threshold
  const hasChanged = currentConfig && newThreshold !== currentConfig.threshold

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Update Multi-Sig Threshold
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Change the number of required signatures for administrative actions
          </CardDescription>
        </CardHeader>

        {isLoading ? (
          <CardContent className="py-8">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        ) : signerCount === 0 ? (
          <CardContent className="space-y-4">
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-500">Multi-Sig Not Configured</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This token does not have multi-sig enabled. To use multi-sig functionality,
                    you need to initialize it with at least one signer when creating the token
                    or through the on-chain program.
                  </p>
                </div>
              </div>
            </div>
            <CardFooter className="flex justify-end px-0 pb-0">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </CardFooter>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Current Configuration</div>
                <div className="text-2xl font-bold">
                  {currentConfig?.threshold} of {signerCount}
                </div>
                <div className="text-sm text-muted-foreground">
                  {signerCount} total signer{signerCount !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">New Threshold</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={1}
                    max={Math.max(signerCount, 1)}
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(parseInt(e.target.value))}
                    className="flex-1"
                    disabled={isSubmitting}
                  />
                  <div className="w-24 text-center">
                    <span className="text-2xl font-bold">{newThreshold}</span>
                    <span className="text-muted-foreground"> of {signerCount}</span>
                  </div>
                </div>
              </div>

              {isDecreasing && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-500">Lower Security</p>
                    <p className="text-sm text-yellow-500/80">
                      Reducing the threshold means fewer signatures are required to execute transactions.
                    </p>
                  </div>
                </div>
              )}

              {isIncreasing && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-500">Higher Security</p>
                    <p className="text-sm text-blue-500/80">
                      Increasing the threshold means more signatures will be required.
                    </p>
                  </div>
                </div>
              )}

              {hasChanged && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type UPDATE to confirm</label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="UPDATE"
                    className="w-full px-3 py-2 border rounded-md bg-background font-mono"
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !hasChanged || confirmText !== 'UPDATE'}
              >
                {isSubmitting ? 'Updating...' : 'Update Threshold'}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
