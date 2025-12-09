import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Token {
  tokenId: number
  symbol: string
  name: string
  mintAddress: string
  totalSupply: number
  isPaused: boolean
}

export interface SlotSnapshot {
  slot: number
  timestamp: string
  holderCount: number
}

interface AppState {
  // Token selection
  tokens: Token[]
  selectedToken: Token | null
  setTokens: (tokens: Token[]) => void
  setSelectedToken: (token: Token | null) => void

  // Slot selection for historical views
  currentSlot: number | null
  selectedSlot: number | null  // null means "live" (current)
  availableSnapshots: SlotSnapshot[]
  setCurrentSlot: (slot: number | null) => void
  setSelectedSlot: (slot: number | null) => void
  setAvailableSnapshots: (snapshots: SlotSnapshot[]) => void
  isViewingHistorical: () => boolean

  // Loading states
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Error handling
  error: string | null
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Token selection
      tokens: [],
      selectedToken: null,
      setTokens: (tokens) => set({ tokens }),
      setSelectedToken: (token) => set({ selectedToken: token, selectedSlot: null, availableSnapshots: [] }),

      // Slot selection for historical views
      currentSlot: null,
      selectedSlot: null,
      availableSnapshots: [],
      setCurrentSlot: (currentSlot) => set({ currentSlot }),
      setSelectedSlot: (selectedSlot) => set({ selectedSlot }),
      setAvailableSnapshots: (availableSnapshots) => set({ availableSnapshots }),
      isViewingHistorical: () => get().selectedSlot !== null,

      // Loading states
      isLoading: false,
      setIsLoading: (isLoading) => set({ isLoading }),

      // Error handling
      error: null,
      setError: (error) => set({ error }),
    }),
    {
      name: 'chainequity-app-storage',
      partialize: (state) => ({ selectedToken: state.selectedToken }),
    }
  )
)
