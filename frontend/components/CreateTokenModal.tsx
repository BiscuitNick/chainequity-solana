'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { X, Info, Plus, Trash2, Shield, Settings, Coins, CheckCircle, AlertCircle } from 'lucide-react'
import { useSolanaWallet } from '@/hooks/useSolana'
import { api } from '@/lib/api'

interface CreateTokenModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function CreateTokenModal({ isOpen, onClose, onSuccess }: CreateTokenModalProps) {
  const { isConnected, publicKey } = useSolanaWallet()

  // Basic token info
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  // Tokens always start with 0 supply - shares are added via issuance
  const [decimals, setDecimals] = useState('6')

  // Multi-sig configuration
  const [signers, setSigners] = useState<string[]>([''])
  const [threshold, setThreshold] = useState(1)

  // Features
  const [vestingEnabled, setVestingEnabled] = useState(true)
  const [governanceEnabled, setGovernanceEnabled] = useState(true)
  const [dividendsEnabled, setDividendsEnabled] = useState(true)
  const [transferRestrictionsEnabled, setTransferRestrictionsEnabled] = useState(true)
  const [upgradeable, setUpgradeable] = useState(true)

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ tokenId: number; mintAddress: string } | null>(null)
  const [activeSection, setActiveSection] = useState<'basic' | 'multisig' | 'features'>('basic')

  if (!isOpen) return null

  const addSigner = () => {
    setSigners([...signers, ''])
  }

  const removeSigner = (index: number) => {
    if (signers.length > 1) {
      const newSigners = signers.filter((_, i) => i !== index)
      setSigners(newSigners)
      // Adjust threshold if needed
      if (threshold > newSigners.length) {
        setThreshold(newSigners.length)
      }
    }
  }

  const updateSigner = (index: number, value: string) => {
    const newSigners = [...signers]
    newSigners[index] = value
    setSigners(newSigners)
  }

  const useConnectedWallet = () => {
    if (publicKey && signers[0] === '') {
      const newSigners = [...signers]
      newSigners[0] = publicKey.toString()
      setSigners(newSigners)
    }
  }

  const validateForm = (): string | null => {
    if (!symbol.trim()) return 'Symbol is required'
    if (symbol.length > 10) return 'Symbol must be 10 characters or less'
    if (!/^[A-Za-z0-9]+$/.test(symbol)) return 'Symbol must be alphanumeric'
    if (!name.trim()) return 'Name is required'
    if (name.length > 50) return 'Name must be 50 characters or less'

    const dec = parseInt(decimals)
    if (isNaN(dec) || dec < 0 || dec > 18) return 'Decimals must be between 0 and 18'

    const validSigners = signers.filter(s => s.trim().length > 0)
    if (validSigners.length === 0) return 'At least one admin signer is required'

    for (const signer of validSigners) {
      if (signer.length < 32 || signer.length > 44) {
        return `Invalid signer address: ${signer.substring(0, 20)}...`
      }
    }

    if (threshold < 1) return 'Threshold must be at least 1'
    if (threshold > validSigners.length) return 'Threshold cannot exceed number of signers'

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!isConnected) {
      setError('Please connect your wallet first')
      return
    }

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSubmitting(true)

    try {
      const validSigners = signers.filter(s => s.trim().length > 0)

      const response = await api.createToken({
        symbol: symbol.toUpperCase().trim(),
        name: name.trim(),
        decimals: parseInt(decimals),
        initial_supply: 0,  // Tokens always start with 0 supply
        features: {
          vesting_enabled: vestingEnabled,
          governance_enabled: governanceEnabled,
          dividends_enabled: dividendsEnabled,
          transfer_restrictions_enabled: transferRestrictionsEnabled,
          upgradeable: upgradeable,
        },
        admin_signers: validSigners,
        admin_threshold: threshold,
      })

      setSuccess({
        tokenId: response.token_id,
        mintAddress: response.mint_address,
      })

      // Call onSuccess callback after a short delay to show success message
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 2000)
    } catch (err: any) {
      console.error('Token creation failed:', err)
      setError(err.detail || err.message || 'Failed to create token')
    } finally {
      setIsSubmitting(false)
    }
  }

  const validSignersCount = signers.filter(s => s.trim().length > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Create Security Token</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Create a new tokenized security on Solana with customizable features
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {!isConnected && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-start gap-2">
                <Info className="h-4 w-4 text-yellow-500 mt-0.5" />
                <p className="text-sm text-yellow-500">
                  Please connect your wallet to create a token
                </p>
              </div>
            )}

            {/* Section Tabs */}
            <div className="flex gap-2 border-b pb-2">
              <Button
                type="button"
                variant={activeSection === 'basic' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveSection('basic')}
              >
                <Coins className="h-4 w-4 mr-2" />
                Basic Info
              </Button>
              <Button
                type="button"
                variant={activeSection === 'multisig' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveSection('multisig')}
              >
                <Shield className="h-4 w-4 mr-2" />
                Multi-Sig
              </Button>
              <Button
                type="button"
                variant={activeSection === 'features' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveSection('features')}
              >
                <Settings className="h-4 w-4 mr-2" />
                Features
              </Button>
            </div>

            {/* Basic Info Section */}
            {activeSection === 'basic' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol *</Label>
                  <Input
                    id="symbol"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g., ACME"
                    maxLength={10}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Unique ticker symbol (1-10 alphanumeric characters)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Acme Corporation"
                    maxLength={50}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Full name of the security (1-50 characters)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="decimals">Decimals</Label>
                  <Input
                    id="decimals"
                    type="number"
                    value={decimals}
                    onChange={(e) => setDecimals(e.target.value)}
                    placeholder="6"
                    min="0"
                    max="18"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Decimal places (0 for whole shares). Supply starts at 0 and grows as shares are issued.
                  </p>
                </div>
              </div>
            )}

            {/* Multi-Sig Section */}
            {activeSection === 'multisig' && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
                  <p className="text-sm text-blue-500">
                    Configure admin signers who can perform administrative actions on this token.
                    Multi-sig requires multiple approvals for sensitive operations.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Admin Signers *</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={useConnectedWallet}
                      disabled={!publicKey || signers[0] !== ''}
                    >
                      Use My Wallet
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {signers.map((signer, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={signer}
                          onChange={(e) => updateSigner(index, e.target.value)}
                          placeholder={`Signer ${index + 1} wallet address...`}
                          disabled={isSubmitting}
                        />
                        {signers.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSigner(index)}
                            disabled={isSubmitting}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSigner}
                    disabled={isSubmitting}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Signer
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="threshold">
                    Required Signatures: {threshold} of {validSignersCount}
                  </Label>
                  <input
                    type="range"
                    id="threshold"
                    min={1}
                    max={Math.max(1, validSignersCount)}
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="w-full"
                    disabled={isSubmitting || validSignersCount === 0}
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of signatures required to approve admin transactions
                  </p>
                </div>
              </div>
            )}

            {/* Features Section */}
            {activeSection === 'features' && (
              <div className="space-y-4">
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-md">
                  <p className="text-sm text-purple-500">
                    Enable or disable token features. These can be configured based on your security requirements.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Vesting Schedules</Label>
                      <p className="text-xs text-muted-foreground">
                        Allow token lockups with vesting schedules
                      </p>
                    </div>
                    <Switch
                      checked={vestingEnabled}
                      onCheckedChange={setVestingEnabled}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Governance Voting</Label>
                      <p className="text-xs text-muted-foreground">
                        Enable on-chain governance proposals and voting
                      </p>
                    </div>
                    <Switch
                      checked={governanceEnabled}
                      onCheckedChange={setGovernanceEnabled}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Dividend Distribution</Label>
                      <p className="text-xs text-muted-foreground">
                        Allow automatic dividend payments to holders
                      </p>
                    </div>
                    <Switch
                      checked={dividendsEnabled}
                      onCheckedChange={setDividendsEnabled}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Transfer Restrictions</Label>
                      <p className="text-xs text-muted-foreground">
                        Restrict transfers to allowlisted wallets only
                      </p>
                    </div>
                    <Switch
                      checked={transferRestrictionsEnabled}
                      onCheckedChange={setTransferRestrictionsEnabled}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Upgradeable</Label>
                      <p className="text-xs text-muted-foreground">
                        Allow future upgrades to token configuration
                      </p>
                    </div>
                    <Switch
                      checked={upgradeable}
                      onCheckedChange={setUpgradeable}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <div className="text-sm text-green-500">
                  <p className="font-medium">Token created successfully!</p>
                  <p className="text-xs mt-1">Token ID: {success.tokenId}</p>
                  <p className="text-xs font-mono break-all">Mint: {success.mintAddress}</p>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between">
            <div className="text-xs text-muted-foreground">
              {validSignersCount} signer{validSignersCount !== 1 ? 's' : ''}, {threshold} required
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isConnected || isSubmitting || !!success}
              >
                {isSubmitting ? 'Creating...' : 'Create Token'}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
