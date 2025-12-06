import { create } from 'zustand'

export interface Token {
  tokenId: number
  symbol: string
  name: string
  mintAddress: string
  totalSupply: number
  isPaused: boolean
}

interface AppState {
  // Token selection
  tokens: Token[]
  selectedToken: Token | null
  setTokens: (tokens: Token[]) => void
  setSelectedToken: (token: Token | null) => void

  // Loading states
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Error handling
  error: string | null
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Token selection
  tokens: [],
  selectedToken: null,
  setTokens: (tokens) => set({ tokens }),
  setSelectedToken: (token) => set({ selectedToken: token }),

  // Loading states
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  // Error handling
  error: null,
  setError: (error) => set({ error }),
}))
