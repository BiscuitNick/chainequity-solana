/**
 * Solana wallet integration hooks
 */
import { useCallback, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token'

// Program IDs (from environment or defaults)
const FACTORY_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_FACTORY_PROGRAM_ID || 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'
)
const TOKEN_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TOKEN_PROGRAM_ID || 'HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L'
)
const GOVERNANCE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GOVERNANCE_PROGRAM_ID || 'BPFLoaderUpgradeab1e11111111111111111111111'
)

export function useSolanaWallet() {
  const { connection } = useConnection()
  const wallet = useWallet()

  const isConnected = wallet.connected && wallet.publicKey !== null
  const publicKey = wallet.publicKey

  // Get SOL balance
  const getSolBalance = useCallback(async () => {
    if (!publicKey) return 0
    const balance = await connection.getBalance(publicKey)
    return balance / 1e9 // Convert lamports to SOL
  }, [connection, publicKey])

  // Get token balance
  const getTokenBalance = useCallback(
    async (mintAddress: string) => {
      if (!publicKey) return { balance: 0, uiBalance: 0 }

      try {
        const mint = new PublicKey(mintAddress)
        const ata = getAssociatedTokenAddressSync(
          mint,
          publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        )

        const balance = await connection.getTokenAccountBalance(ata)
        return {
          balance: parseInt(balance.value.amount),
          uiBalance: balance.value.uiAmount || 0,
        }
      } catch {
        return { balance: 0, uiBalance: 0 }
      }
    },
    [connection, publicKey]
  )

  // Send transaction
  const sendTransaction = useCallback(
    async (transaction: Transaction) => {
      if (!wallet.signTransaction || !publicKey) {
        throw new Error('Wallet not connected')
      }

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // Sign transaction
      const signed = await wallet.signTransaction(transaction)

      // Send transaction
      const signature = await connection.sendRawTransaction(signed.serialize())

      // Confirm transaction
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      })

      return signature
    },
    [connection, wallet, publicKey]
  )

  // Create associated token account if needed
  const createTokenAccountIfNeeded = useCallback(
    async (mintAddress: string, owner?: PublicKey) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const mint = new PublicKey(mintAddress)
      const ownerKey = owner || publicKey
      const ata = getAssociatedTokenAddressSync(
        mint,
        ownerKey,
        false,
        TOKEN_2022_PROGRAM_ID
      )

      // Check if account exists
      const account = await connection.getAccountInfo(ata)
      if (account) return ata

      // Create instruction
      const ix = createAssociatedTokenAccountInstruction(
        publicKey,
        ata,
        ownerKey,
        mint,
        TOKEN_2022_PROGRAM_ID
      )

      const tx = new Transaction().add(ix)
      await sendTransaction(tx)

      return ata
    },
    [connection, publicKey, sendTransaction]
  )

  return {
    wallet,
    connection,
    isConnected,
    publicKey,
    getSolBalance,
    getTokenBalance,
    sendTransaction,
    createTokenAccountIfNeeded,
  }
}

// PDA derivation utilities
export function useChainEquityPDAs() {
  const deriveFactoryPDA = useCallback(() => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('factory')],
      FACTORY_PROGRAM_ID
    )
  }, [])

  const deriveTokenConfigPDA = useCallback((mint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('token_config'), mint.toBuffer()],
      FACTORY_PROGRAM_ID
    )
  }, [])

  const deriveAllowlistPDA = useCallback((tokenConfig: PublicKey, wallet: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('allowlist'), tokenConfig.toBuffer(), wallet.toBuffer()],
      TOKEN_PROGRAM_ID
    )
  }, [])

  const deriveVestingPDA = useCallback(
    (tokenConfig: PublicKey, beneficiary: PublicKey, startTime: number) => {
      const startTimeBuffer = Buffer.alloc(8)
      startTimeBuffer.writeBigInt64LE(BigInt(startTime))
      return PublicKey.findProgramAddressSync(
        [
          Buffer.from('vesting'),
          tokenConfig.toBuffer(),
          beneficiary.toBuffer(),
          startTimeBuffer,
        ],
        TOKEN_PROGRAM_ID
      )
    },
    []
  )

  const deriveMultiSigPDA = useCallback((tokenMint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('multisig'), tokenMint.toBuffer()],
      FACTORY_PROGRAM_ID
    )
  }, [])

  const deriveProposalPDA = useCallback((tokenConfig: PublicKey, proposalId: number) => {
    const idBuffer = Buffer.alloc(8)
    idBuffer.writeBigUInt64LE(BigInt(proposalId))
    return PublicKey.findProgramAddressSync(
      [Buffer.from('proposal'), tokenConfig.toBuffer(), idBuffer],
      GOVERNANCE_PROGRAM_ID
    )
  }, [])

  return {
    deriveFactoryPDA,
    deriveTokenConfigPDA,
    deriveAllowlistPDA,
    deriveVestingPDA,
    deriveMultiSigPDA,
    deriveProposalPDA,
    FACTORY_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    GOVERNANCE_PROGRAM_ID,
  }
}
