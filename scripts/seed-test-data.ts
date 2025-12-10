// @ts-nocheck
/**
 * Seed test data for ChainEquity
 *
 * This script:
 * 1. Creates a token on the blockchain (or uses existing)
 * 2. Approves multiple wallets to the allowlist
 * 3. Issues shares (mints tokens) to approved wallets
 * 4. Creates share classes in the database
 * 5. Records all transactions with ACTUAL blockchain slots
 * 6. Creates convertible instruments (SAFEs)
 * 7. Creates funding rounds and converts SAFEs
 * 8. Creates vesting schedules with minute-by-minute releases
 * 9. Issues dividends with individual payment transactions
 * 10. Creates revaluation rounds
 * 11. Performs corporate actions (stock split)
 *
 * IMPORTANT: All slots recorded in the database are the actual confirmed
 * blockchain slots from the transactions, ensuring historical reconstruction
 * works correctly.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/seed-test-data.ts
 *
 * Options:
 *   --symbol TICKER   Token symbol (default: SEED)
 *   --skip-onchain    Skip blockchain operations, only seed database
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Parse args
const args = process.argv.slice(2);
let SYMBOL = "SEED";
let SKIP_ONCHAIN = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--symbol") SYMBOL = args[++i]?.toUpperCase() || "SEED";
  if (args[i] === "--skip-onchain") SKIP_ONCHAIN = true;
}

// Program IDs
const FACTORY_PROGRAM_ID = new PublicKey("S7psPXnjCLjqdhoWXVG78nniuCfGPwQaciq7TUZEL2p");
const TOKEN_PROGRAM_ID = new PublicKey("5H3QcvZsViboQzqnv2vLjqCNyCgQ4sx3UXmYgDihTmLV");

// Load IDLs
const factoryIdl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../target/idl/chainequity_factory.json"), "utf8")
);
const tokenIdl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../target/idl/chainequity_token.json"), "utf8")
);

// API URL for database operations
const API_URL = process.env.API_URL || "http://localhost:8000";

// Test wallets - generate deterministic keypairs for testing
function generateTestWallet(seed: string): Keypair {
  const seedBytes = new Uint8Array(32);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(seed.padEnd(32, "0"));
  seedBytes.set(encoded.slice(0, 32));
  return Keypair.fromSeed(seedBytes);
}

// Define our test participants
const FOUNDERS = [
  { name: "Alice (CEO)", wallet: generateTestWallet("alice-founder-ceo-001"), shares: 4_000_000, shareClass: "common" },
  { name: "Bob (CTO)", wallet: generateTestWallet("bob-founder-cto-002"), shares: 3_000_000, shareClass: "common" },
  { name: "Carol (COO)", wallet: generateTestWallet("carol-founder-coo-03"), shares: 2_000_000, shareClass: "common" },
];

const INVESTORS = [
  { name: "Venture Fund A", wallet: generateTestWallet("venture-fund-a-001"), shares: 1_500_000, shareClass: "preferred_a", costBasis: 1_500_000_00 }, // $1.5M
  { name: "Venture Fund B", wallet: generateTestWallet("venture-fund-b-002"), shares: 1_000_000, shareClass: "preferred_a", costBasis: 1_000_000_00 }, // $1M
  { name: "Angel Investor", wallet: generateTestWallet("angel-investor-001"), shares: 500_000, shareClass: "preferred_a", costBasis: 500_000_00 }, // $500K
];

const EMPLOYEES = [
  { name: "David (Engineer)", wallet: generateTestWallet("david-engineer-001"), shares: 100_000, shareClass: "common" },
  { name: "Eve (Designer)", wallet: generateTestWallet("eve-designer-00001"), shares: 75_000, shareClass: "common" },
];

const ALL_PARTICIPANTS = [...FOUNDERS, ...INVESTORS, ...EMPLOYEES];

// Share class definitions
const SHARE_CLASSES = [
  {
    name: "Common Stock",
    symbol: "COM",
    priority: 2,
    preference_multiple: 1.0,
    participation_cap: null,
    anti_dilution: null,
    conversion_ratio: 1.0,
  },
  {
    name: "Series A Preferred",
    symbol: "SAPA",
    priority: 1,
    preference_multiple: 1.5,
    participation_cap: 2.0,
    anti_dilution: "broad_based_weighted_average",
    conversion_ratio: 1.0,
  },
];

// Track all transactions with their confirmed slots for database recording
interface ConfirmedTransaction {
  type: string;
  slot: number;
  signature: string;
  participant?: any;
  data?: any;
}

const confirmedTransactions: ConfirmedTransaction[] = [];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the confirmed slot for a transaction signature
 */
async function getConfirmedSlot(connection: anchor.web3.Connection, signature: string): Promise<number> {
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || tx.slot === undefined) {
    // Fallback to current slot if we can't get the tx slot
    return await connection.getSlot("confirmed");
  }
  return tx.slot;
}

async function main() {
  console.log("\n=== ChainEquity Test Data Seeder ===\n");

  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log(`Wallet: ${provider.wallet.publicKey.toString()}`);
  console.log(`Cluster: ${provider.connection.rpcEndpoint}`);
  console.log(`Symbol: ${SYMBOL}`);
  console.log(`Skip On-Chain: ${SKIP_ONCHAIN}`);

  const factoryProgram = new Program(factoryIdl, provider);
  const tokenProgram = new Program(tokenIdl, provider);

  // Derive Factory PDA
  const [factoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory")],
    FACTORY_PROGRAM_ID
  );

  let tokenConfig: any = null;
  let tokenConfigPda: PublicKey;
  let mintAddress: PublicKey;
  let tokenId: number;

  // Get initial slot from blockchain
  let currentSlot = await provider.connection.getSlot("confirmed");
  console.log(`\nInitial blockchain slot: ${currentSlot}`);

  if (!SKIP_ONCHAIN) {
    // ========================================
    // STEP 1: Create or find token on-chain
    // ========================================
    console.log("\n--- Step 1: Token Setup ---");

    let factory;
    try {
      factory = await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
      console.log(`Factory found (${factory.tokenCount.toString()} tokens created)`);
    } catch (e) {
      console.error("Factory not initialized. Run 'anchor run init-factory' first.");
      process.exit(1);
    }

    // Check if token with symbol already exists
    const tokenCount = factory.tokenCount.toNumber();
    for (let i = 0; i < tokenCount; i++) {
      const [existingConfigPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("token_config"),
          factoryPda.toBuffer(),
          new anchor.BN(i).toArrayLike(Buffer, "le", 8)
        ],
        FACTORY_PROGRAM_ID
      );
      try {
        const existingConfig = await (factoryProgram.account as any).tokenConfig.fetch(existingConfigPda);
        if (existingConfig.symbol.toUpperCase() === SYMBOL) {
          console.log(`Found existing token: ${SYMBOL}`);
          tokenConfig = existingConfig;
          tokenConfigPda = existingConfigPda;
          mintAddress = existingConfig.mint;
          tokenId = existingConfig.tokenId.toNumber();

          // Check if mint authority is already initialized
          const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("mint_authority"), existingConfigPda.toBuffer()],
            TOKEN_PROGRAM_ID
          );
          try {
            await tokenProgram.account.mintAuthority.fetch(mintAuthorityPda);
            console.log("Mint authority already initialized");
          } catch (e) {
            console.log("Initializing mint authority for existing token...");
            try {
              const initTx = await (tokenProgram.methods as any)
                .initializeMintAuthority()
                .accounts({
                  tokenConfig: existingConfigPda,
                  mint: existingConfig.mint,
                  mintAuthority: mintAuthorityPda,
                  authority: provider.wallet.publicKey,
                  payer: provider.wallet.publicKey,
                  tokenProgram: TOKEN_2022_PROGRAM_ID,
                  systemProgram: SystemProgram.programId,
                })
                .rpc();
              console.log(`Mint authority PDA created: ${initTx.slice(0, 16)}...`);
              await sleep(500);

              const transferAuthTx = await (factoryProgram.methods as any)
                .transferMintAuthority()
                .accounts({
                  tokenConfig: existingConfigPda,
                  mint: existingConfig.mint,
                  newAuthority: mintAuthorityPda,
                  authority: provider.wallet.publicKey,
                  tokenProgram: TOKEN_2022_PROGRAM_ID,
                })
                .rpc();
              console.log(`Mint authority transferred: ${transferAuthTx.slice(0, 16)}...`);
              await sleep(500);
            } catch (initError: any) {
              console.log(`Mint authority init note: ${initError.message?.slice(0, 80) || 'may already exist'}`);
            }
          }
          break;
        }
      } catch (e) {
        // Not found, continue
      }
    }

    // Create token if not found
    if (!tokenConfig) {
      console.log(`Creating new token: ${SYMBOL}`);

      const mintKeypair = Keypair.generate();
      mintAddress = mintKeypair.publicKey;

      [tokenConfigPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("token_config"),
          factoryPda.toBuffer(),
          new anchor.BN(tokenCount).toArrayLike(Buffer, "le", 8)
        ],
        FACTORY_PROGRAM_ID
      );

      const [multisigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("multisig"), tokenConfigPda.toBuffer()],
        FACTORY_PROGRAM_ID
      );

      const totalShares = ALL_PARTICIPANTS.reduce((sum, p) => sum + p.shares, 0);

      const createTokenParams = {
        symbol: SYMBOL,
        name: `${SYMBOL} Corporation`,
        decimals: 0,
        initialSupply: new anchor.BN(totalShares),
        features: {
          vestingEnabled: true,
          governanceEnabled: true,
          dividendsEnabled: true,
          transferRestrictionsEnabled: true,
          upgradeable: false,
        },
        adminSigners: [provider.wallet.publicKey],
        adminThreshold: 1,
        templateId: null,
      };

      const createTx = await (factoryProgram.methods as any)
        .createToken(createTokenParams)
        .accounts({
          factory: factoryPda,
          tokenConfig: tokenConfigPda,
          multisig: multisigPda,
          mint: mintKeypair.publicKey,
          payer: provider.wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mintKeypair])
        .rpc();

      console.log(`Token created: ${createTx}`);
      await sleep(500);

      tokenConfig = await (factoryProgram.account as any).tokenConfig.fetch(tokenConfigPda);
      tokenId = tokenConfig.tokenId.toNumber();

      // Initialize mint authority
      console.log("Initializing mint authority...");
      const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority"), tokenConfigPda.toBuffer()],
        TOKEN_PROGRAM_ID
      );

      try {
        const initMintAuthTx = await (tokenProgram.methods as any)
          .initializeMintAuthority()
          .accounts({
            tokenConfig: tokenConfigPda,
            mint: mintAddress,
            mintAuthority: mintAuthorityPda,
            authority: provider.wallet.publicKey,
            payer: provider.wallet.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log(`Mint authority PDA created: ${initMintAuthTx.slice(0, 16)}...`);
        await sleep(500);

        const transferAuthTx = await (factoryProgram.methods as any)
          .transferMintAuthority()
          .accounts({
            tokenConfig: tokenConfigPda,
            mint: mintAddress,
            newAuthority: mintAuthorityPda,
            authority: provider.wallet.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        console.log(`Mint authority transferred: ${transferAuthTx.slice(0, 16)}...`);
        await sleep(500);
      } catch (initError: any) {
        console.log(`Mint authority init note: ${initError.message?.slice(0, 80) || 'may already exist'}`);
      }
    }

    console.log(`Token ID: ${tokenId}`);
    console.log(`Mint: ${mintAddress.toString()}`);
    console.log(`Config: ${tokenConfigPda.toString()}`);

    // ========================================
    // STEP 2: Approve wallets to allowlist
    // ========================================
    console.log("\n--- Step 2: Approve Wallets ---");

    for (const participant of ALL_PARTICIPANTS) {
      console.log(`Approving ${participant.name}: ${participant.wallet.publicKey.toString().slice(0, 8)}...`);

      const [allowlistPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("allowlist"),
          tokenConfigPda.toBuffer(),
          participant.wallet.publicKey.toBuffer(),
        ],
        TOKEN_PROGRAM_ID
      );

      try {
        await tokenProgram.account.allowlistEntry.fetch(allowlistPda);
        console.log(`  Already approved`);
      } catch (e) {
        try {
          const txSig = await (tokenProgram.methods as any)
            .addToAllowlist()
            .accounts({
              tokenConfig: tokenConfigPda,
              allowlistEntry: allowlistPda,
              wallet: participant.wallet.publicKey,
              authority: provider.wallet.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .rpc();

          await sleep(300);
          const confirmedSlot = await getConfirmedSlot(provider.connection, txSig);

          confirmedTransactions.push({
            type: "approval",
            slot: confirmedSlot,
            signature: txSig,
            participant,
          });

          console.log(`  Approved at slot ${confirmedSlot}: ${txSig.slice(0, 16)}...`);
        } catch (addError: any) {
          console.error(`  Error approving: ${addError.message}`);
        }
      }
      await sleep(200);
    }

    // ========================================
    // STEP 3: Mint tokens to approved wallets
    // ========================================
    console.log("\n--- Step 3: Issue Shares (Mint Tokens) ---");

    for (const participant of ALL_PARTICIPANTS) {
      console.log(`Minting ${participant.shares.toLocaleString()} shares to ${participant.name}...`);

      const [allowlistPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("allowlist"),
          tokenConfigPda.toBuffer(),
          participant.wallet.publicKey.toBuffer(),
        ],
        TOKEN_PROGRAM_ID
      );

      const recipientAta = getAssociatedTokenAddressSync(
        mintAddress,
        participant.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const ataInfo = await provider.connection.getAccountInfo(recipientAta);
      if (!ataInfo) {
        try {
          const createAtaIx = createAssociatedTokenAccountInstruction(
            provider.wallet.publicKey,
            recipientAta,
            participant.wallet.publicKey,
            mintAddress,
            TOKEN_2022_PROGRAM_ID
          );
          const tx = new anchor.web3.Transaction().add(createAtaIx);
          await provider.sendAndConfirm(tx);
          console.log(`  Created token account`);
        } catch (ataError: any) {
          console.log(`  ATA creation note: ${ataError.message?.slice(0, 50) || 'unknown'}`);
        }
      }

      const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority"), tokenConfigPda.toBuffer()],
        TOKEN_PROGRAM_ID
      );

      try {
        const txSig = await (tokenProgram.methods as any)
          .mintTokens(new anchor.BN(participant.shares))
          .accounts({
            tokenConfig: tokenConfigPda,
            mint: mintAddress,
            mintAuthority: mintAuthorityPda,
            recipientAllowlist: allowlistPda,
            recipientTokenAccount: recipientAta,
            recipient: participant.wallet.publicKey,
            authority: provider.wallet.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        await sleep(300);
        const confirmedSlot = await getConfirmedSlot(provider.connection, txSig);

        confirmedTransactions.push({
          type: "share_grant",
          slot: confirmedSlot,
          signature: txSig,
          participant,
        });

        console.log(`  Minted at slot ${confirmedSlot}: ${txSig.slice(0, 16)}...`);
      } catch (mintError: any) {
        console.error(`  Error minting: ${mintError.message}`);
      }

      await sleep(300);
    }

    // ========================================
    // STEP 4: Get current slot for DB-only operations
    // ========================================
    console.log("\n--- Step 4: Get current slot for database operations ---");
    currentSlot = await provider.connection.getSlot("confirmed");
    console.log(`Current blockchain slot: ${currentSlot}`);

  } else {
    console.log("\nSkipping on-chain operations, using database...");
    tokenId = 1;
  }

  // ========================================
  // STEP 5: Sync to database via API
  // ========================================
  console.log("\n--- Step 5: Sync to Database ---");

  try {
    console.log("Syncing token to database...");
    const syncResponse = await fetch(`${API_URL}/api/v1/sync/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (syncResponse.ok) {
      console.log("Token synced successfully");
    } else {
      console.log("Token sync endpoint not available");
    }
  } catch (e) {
    console.log("Could not sync token via API");
  }

  // Get the token ID from the database
  try {
    const tokensResponse = await fetch(`${API_URL}/api/v1/tokens/`);
    if (tokensResponse.ok) {
      const tokens = await tokensResponse.json();
      const seedToken = tokens.find((t: any) => t.symbol === SYMBOL);
      if (seedToken) {
        tokenId = seedToken.token_id;
        console.log(`Found token in database: ID=${tokenId}, Symbol=${SYMBOL}`);
      } else {
        console.log(`Token ${SYMBOL} not found in database. Creating...`);
        const createResponse = await fetch(`${API_URL}/api/v1/tokens/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token_id: tokenConfig?.tokenId?.toNumber() || Date.now(),
            on_chain_config: tokenConfigPda?.toString() || `CFG${Date.now()}`,
            mint_address: mintAddress?.toString() || `MNT${Date.now()}`,
            symbol: SYMBOL,
            name: `${SYMBOL} Corporation`,
            decimals: 0,
            total_supply: ALL_PARTICIPANTS.reduce((sum, p) => sum + p.shares, 0),
            features: {
              vesting_enabled: true,
              governance_enabled: true,
              dividends_enabled: true,
              transfer_restrictions_enabled: true,
              upgradeable: false,
            },
          }),
        });
        if (createResponse.ok) {
          const createdToken = await createResponse.json();
          tokenId = createdToken.token_id;
          console.log(`Created token: ID=${tokenId}`);
        } else {
          const errorText = await createResponse.text();
          console.error(`Failed to create token: ${createResponse.status} ${errorText}`);
        }
      }
    }
  } catch (e) {
    console.error("Error fetching tokens:", e);
  }

  // ========================================
  // STEP 6: Create share classes in database
  // ========================================
  console.log("\n--- Step 6: Create Share Classes ---");

  const shareClassIds: Record<string, number> = {};

  for (const sc of SHARE_CLASSES) {
    try {
      const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/share-classes/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sc),
      });
      if (response.ok) {
        const created = await response.json();
        shareClassIds[sc.symbol === "COM" ? "common" : "preferred_a"] = created.id;
        console.log(`Created share class: ${sc.name} (ID: ${created.id})`);
      } else {
        const existing = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/share-classes/`);
        if (existing.ok) {
          const classes = await existing.json();
          const found = classes.find((c: any) => c.symbol === sc.symbol);
          if (found) {
            shareClassIds[sc.symbol === "COM" ? "common" : "preferred_a"] = found.id;
            console.log(`Found existing share class: ${sc.name} (ID: ${found.id})`);
          }
        }
      }
    } catch (e) {
      console.error(`Error creating share class ${sc.name}:`, e);
    }
  }

  // ========================================
  // STEP 7: Record confirmed blockchain transactions
  // ========================================
  console.log("\n--- Step 7: Record Confirmed Transactions ---");

  // Sort transactions by slot to ensure proper ordering
  confirmedTransactions.sort((a, b) => a.slot - b.slot);

  for (const tx of confirmedTransactions) {
    if (tx.type === "approval") {
      try {
        await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_type: "approval",
            slot: tx.slot,
            wallet: tx.participant.wallet.publicKey.toString(),
            tx_signature: tx.signature,
            triggered_by: "admin",
            notes: `Approved ${tx.participant.name}`,
          }),
        });
        console.log(`Recorded APPROVAL for ${tx.participant.name} at slot ${tx.slot}`);
      } catch (e) {
        console.error(`Error recording approval:`, e);
      }
    } else if (tx.type === "share_grant") {
      const scKey = tx.participant.shareClass === "common" ? "common" : "preferred_a";
      const shareClassId = shareClassIds[scKey];
      const priority = tx.participant.shareClass === "common" ? 2 : 1;
      const prefMult = tx.participant.shareClass === "common" ? 1.0 : 1.5;

      try {
        await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_type: "share_grant",
            slot: tx.slot,
            wallet: tx.participant.wallet.publicKey.toString(),
            amount: tx.participant.shares,
            amount_secondary: tx.participant.costBasis || 0,
            share_class_id: shareClassId,
            priority: priority,
            preference_multiple: prefMult,
            tx_signature: tx.signature,
            triggered_by: "admin",
            notes: `Issued ${tx.participant.shares.toLocaleString()} shares to ${tx.participant.name}`,
          }),
        });
        console.log(`Recorded SHARE_GRANT for ${tx.participant.name}: ${tx.participant.shares.toLocaleString()} shares at slot ${tx.slot}`);
      } catch (e) {
        console.error(`Error recording share grant:`, e);
      }
    }
  }

  // ========================================
  // STEP 8: Create Convertible Instruments (SAFEs)
  // ========================================
  console.log("\n--- Step 8: Create Convertible Instruments (SAFEs) ---");

  // Define SAFE investors (these will convert during the Series A)
  const SAFE_INVESTORS = [
    {
      name: "Seed SAFE Round 1 - Angel Investor 1",
      wallet: generateTestWallet("angel-safe-inv-001"),
      principal: 250_000_00, // $250,000 in cents
      valuationCap: 10_000_000_00, // $10M cap
      discountRate: 0.20, // 20% discount
      safeType: "post_money",
    },
    {
      name: "Seed SAFE Round 1 - Angel Investor 2",
      wallet: generateTestWallet("angel-safe-inv-002"),
      principal: 150_000_00, // $150,000 in cents
      valuationCap: 10_000_000_00, // $10M cap
      discountRate: 0.20, // 20% discount
      safeType: "post_money",
    },
  ];

  const safeIds: Record<string, number> = {};

  for (const safe of SAFE_INVESTORS) {
    try {
      const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/convertibles/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_type: "safe",
          name: safe.name,
          holder_wallet: safe.wallet.publicKey.toString(),
          holder_name: safe.name.split(" - ")[1] || safe.name,
          principal_amount: safe.principal,
          valuation_cap: safe.valuationCap,
          discount_rate: safe.discountRate,
          safe_type: safe.safeType,
          notes: `${safe.safeType} SAFE with ${(safe.discountRate * 100).toFixed(0)}% discount and $${(safe.valuationCap / 100).toLocaleString()} cap`,
        }),
      });
      if (response.ok) {
        const created = await response.json();
        safeIds[safe.name] = created.id;
        console.log(`Created SAFE: ${safe.name} (ID: ${created.id}) - $${(safe.principal / 100).toLocaleString()}`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to create SAFE: ${response.status} ${errorText}`);
      }
    } catch (e) {
      console.error(`Error creating SAFE ${safe.name}:`, e);
    }
  }

  // ========================================
  // STEP 9: Create Series A Funding Round and Convert SAFEs
  // ========================================
  console.log("\n--- Step 9: Create Series A Funding Round ---");

  // Create Series A share class
  let seriesAClassId: number | null = null;
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/share-classes/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Series A Preferred",
        symbol: "SER-A",
        priority: 1,
        preference_multiple: 1.0,
        participation_cap: null,
        anti_dilution: "broad_based_weighted_average",
        conversion_ratio: 1.0,
      }),
    });
    if (response.ok) {
      const created = await response.json();
      seriesAClassId = created.id;
      console.log(`Created Series A share class (ID: ${seriesAClassId})`);
    } else {
      // Try to find existing
      const existing = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/share-classes/`);
      if (existing.ok) {
        const classes = await existing.json();
        const found = classes.find((c: any) => c.symbol === "SER-A");
        if (found) {
          seriesAClassId = found.id;
          console.log(`Found existing Series A share class (ID: ${seriesAClassId})`);
        }
      }
    }
  } catch (e) {
    console.error(`Error creating Series A share class:`, e);
  }

  // Create Series A funding round
  let seriesARoundId: number | null = null;
  if (seriesAClassId) {
    try {
      const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Series A",
          round_type: "series_a",
          pre_money_valuation: 20_000_000_00, // $20M pre-money
          share_class_id: seriesAClassId,
          notes: "Series A round with SAFE conversions",
        }),
      });
      if (response.ok) {
        const created = await response.json();
        seriesARoundId = created.id;
        console.log(`Created Series A funding round (ID: ${seriesARoundId}) - $20M pre-money`);
        console.log(`  Price per share: $${(created.price_per_share / 100).toFixed(4)}`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to create funding round: ${response.status} ${errorText}`);
      }
    } catch (e) {
      console.error(`Error creating funding round:`, e);
    }
  }

  // Add a Series A investor
  if (seriesARoundId) {
    const seriesAInvestor = {
      name: "Venture Capital Fund Alpha",
      wallet: generateTestWallet("vc-fund-alpha-001"),
      amount: 5_000_000_00, // $5M investment
    };

    try {
      const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/${seriesARoundId}/investments/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investor_wallet: seriesAInvestor.wallet.publicKey.toString(),
          investor_name: seriesAInvestor.name,
          amount: seriesAInvestor.amount,
        }),
      });
      if (response.ok) {
        const created = await response.json();
        console.log(`Added investment: ${seriesAInvestor.name} - $${(seriesAInvestor.amount / 100).toLocaleString()} → ${created.shares_received.toLocaleString()} shares`);
      }
    } catch (e) {
      console.error(`Error adding investment:`, e);
    }

    // Convert SAFEs at this round
    console.log("\nConverting SAFEs at Series A...");
    for (const safe of SAFE_INVESTORS) {
      const safeId = safeIds[safe.name];
      if (safeId && seriesARoundId) {
        try {
          const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/convertibles/${safeId}/convert/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              funding_round_id: seriesARoundId,
            }),
          });
          if (response.ok) {
            const result = await response.json();
            console.log(`Converted SAFE: ${safe.name}`);
            console.log(`  Principal: $${(safe.principal / 100).toLocaleString()} → ${result.shares_received?.toLocaleString() || 'N/A'} shares`);
            console.log(`  Conversion price: $${((result.conversion_price || 0) / 100).toFixed(4)}/share`);
          } else {
            const errorText = await response.text();
            console.error(`Failed to convert SAFE: ${response.status} ${errorText}`);
          }
        } catch (e) {
          console.error(`Error converting SAFE:`, e);
        }
      }
    }

    // Close the funding round
    console.log("\nClosing Series A round...");
    try {
      const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/${seriesARoundId}/close/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        const result = await response.json();
        console.log(`Series A round closed!`);
        console.log(`  Post-money valuation: $${(result.post_money_valuation / 100).toLocaleString()}`);
        console.log(`  Total shares issued: ${result.shares_issued.toLocaleString()}`);
        console.log(`  Total raised: $${(result.amount_raised / 100).toLocaleString()}`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to close round: ${response.status} ${errorText}`);
      }
    } catch (e) {
      console.error(`Error closing round:`, e);
    }
  }

  // ========================================
  // STEP 10: Create Vesting Schedules (30 min with minute releases)
  // ========================================
  console.log("\n--- Step 10: Create Vesting Schedules (30 min vesting) ---");

  // Create a vesting schedule that vests over 30 minutes, releasing every minute
  const vestingSchedules = [
    {
      beneficiary: EMPLOYEES[0], // David
      totalAmount: 30_000, // 30,000 shares (1000 per minute for 30 minutes)
      durationMinutes: 30,
      cliffMinutes: 0, // No cliff for demo
      scheduleId: 1,
    },
    {
      beneficiary: EMPLOYEES[1], // Eve
      totalAmount: 15_000, // 15,000 shares (500 per minute for 30 minutes)
      durationMinutes: 30,
      cliffMinutes: 0,
      scheduleId: 2,
    },
  ];

  const vestingStartTime = Math.floor(Date.now() / 1000); // Unix timestamp

  for (const vs of vestingSchedules) {
    try {
      // Call the vesting API which creates both the model record AND the transaction
      const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/vesting/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beneficiary: vs.beneficiary.wallet.publicKey.toString(),
          total_amount: vs.totalAmount,
          start_time: vestingStartTime,
          cliff_seconds: vs.cliffMinutes * 60,
          duration_seconds: vs.durationMinutes * 60, // 30 minutes in seconds
          vesting_type: "linear",
          revocable: false,
          share_class_id: shareClassIds["common"],
          cost_basis: 0, // Grant (no cost)
          price_per_share: 0,
        }),
      });
      if (response.ok) {
        const created = await response.json();
        console.log(`Created VESTING_SCHEDULE for ${vs.beneficiary.name}: ${vs.totalAmount.toLocaleString()} shares over ${vs.durationMinutes} min (ID: ${created.on_chain_address?.slice(0, 16)}...)`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to create vesting schedule: ${response.status} ${errorText}`);
      }
    } catch (e) {
      console.error(`Error creating vesting schedule:`, e);
    }
  }

  // Also record vesting release transactions for the activity feed
  console.log("\nRecording vesting release transactions for activity feed...");

  await sleep(500);
  currentSlot = await provider.connection.getSlot("confirmed");

  for (const vs of vestingSchedules) {
    const sharesPerMinute = Math.floor(vs.totalAmount / vs.durationMinutes);

    // Simulate 10 minutes of releases
    for (let minute = 1; minute <= 10; minute++) {
      const releaseAmount = sharesPerMinute;
      const releaseTime = new Date(vestingStartTime * 1000 + minute * 60 * 1000);

      try {
        await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_type: "vesting_release",
            slot: currentSlot,
            wallet: vs.beneficiary.wallet.publicKey.toString(),
            amount: releaseAmount,
            share_class_id: shareClassIds["common"],
            priority: 2,
            preference_multiple: 1.0,
            reference_id: vs.scheduleId,
            reference_type: "vesting_schedule",
            data: {
              release_number: minute,
              release_time: releaseTime.toISOString(),
              cumulative_released: releaseAmount * minute,
              remaining: vs.totalAmount - (releaseAmount * minute),
            },
            triggered_by: "system",
            notes: `Minute ${minute} vesting release: ${releaseAmount.toLocaleString()} shares to ${vs.beneficiary.name}`,
          }),
        });
        if (minute <= 3) {
          console.log(`  Release ${minute}/30 for ${vs.beneficiary.name}: ${releaseAmount.toLocaleString()} shares (cumulative: ${(releaseAmount * minute).toLocaleString()})`);
        } else if (minute === 4) {
          console.log(`  ... (continuing releases 4-10)`);
        }
      } catch (e) {
        console.error(`Error recording vesting release:`, e);
      }

      currentSlot += 1;
    }
    console.log(`  Total vested for ${vs.beneficiary.name}: ${(sharesPerMinute * 10).toLocaleString()} of ${vs.totalAmount.toLocaleString()} shares`);
  }

  // ========================================
  // STEP 11: Create Dividend Round with Individual Payments
  // ========================================
  console.log("\n--- Step 11: Create Dividend Round with Individual Payments ---");

  await sleep(500);
  currentSlot = await provider.connection.getSlot("confirmed");

  const amountPerShare = 8; // 8 cents per share ($0.08)

  // Use USDC mint address (this is the well-known devnet USDC address as a placeholder)
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  // IMPORTANT: Get ACTUAL shareholders from reconstructed state (based on transactions)
  // Don't use ALL_PARTICIPANTS - need actual shareholders from transaction history
  let actualShareholders: { wallet: string; balance: number; name?: string }[] = [];
  try {
    // Use reconstructed state endpoint which is based on transactions (source of truth)
    const stateResponse = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/captable/state/${currentSlot}`);
    if (stateResponse.ok) {
      const state = await stateResponse.json();
      // state.balances is an object: { wallet: balance }
      actualShareholders = Object.entries(state.balances || {})
        .filter(([_, balance]) => (balance as number) > 0)
        .map(([wallet, balance]) => ({
          wallet,
          balance: balance as number,
          name: wallet.slice(0, 8) + "..." + wallet.slice(-4),
        }));
      console.log(`\nFound ${actualShareholders.length} actual shareholders from reconstructed state`);
    } else {
      console.error(`Failed to fetch reconstructed state: ${stateResponse.status}`);
    }
  } catch (e) {
    console.error(`Error fetching reconstructed state:`, e);
  }

  if (actualShareholders.length === 0) {
    console.log("No shareholders found - skipping dividend distribution");
  } else {
    // Calculate total shares from actual shareholders
    const totalShares = actualShareholders.reduce((sum, s) => sum + s.balance, 0);
    const totalDividend = totalShares * amountPerShare;

    console.log(`\nDividend Details:`);
    console.log(`  Amount per share: $${(amountPerShare / 100).toFixed(2)}`);
    console.log(`  Total shares eligible: ${totalShares.toLocaleString()}`);
    console.log(`  Total dividend pool: $${(totalDividend / 100).toLocaleString()}`);

    let dividendRoundId: number | null = null;
    try {
      // Call the dividend API which creates the DividendRound model record
      const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/dividends/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_token: USDC_MINT,
          total_pool: totalDividend,
        }),
      });
      if (response.ok) {
        const created = await response.json();
        dividendRoundId = created.id;
        console.log(`\nCreated DIVIDEND_ROUND #${created.round_number} (ID: ${dividendRoundId})`);
        console.log(`  Status: ${created.status}`);
        console.log(`  Total recipients: ${created.total_recipients}`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to create dividend round: ${response.status} ${errorText}`);
      }
    } catch (e) {
      console.error(`Error creating dividend round:`, e);
    }

    // Record individual dividend payment transactions for the activity feed
    // ONLY for actual shareholders from the cap table
    console.log("\nRecording dividend payment transactions for activity feed...");

    await sleep(500);
    currentSlot = await provider.connection.getSlot("confirmed");

    for (const shareholder of actualShareholders) {
      const paymentAmount = shareholder.balance * amountPerShare;
      const paymentSlot = currentSlot;

      try {
        await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_type: "dividend_payment",
            slot: paymentSlot,
            wallet_to: shareholder.wallet,
            amount: paymentAmount,
            reference_id: dividendRoundId || 1,
            reference_type: "dividend_round",
            data: {
              round_number: 1,
              shares: shareholder.balance,
              dividend_per_share: amountPerShare / 100,  // Store as dollars for display
              payment_token: "USDC",
              payment_status: "completed",
              payment_method: "direct_transfer",
            },
            tx_signature: `sim_div_${shareholder.wallet.slice(0, 8)}_${Date.now()}`,
            triggered_by: "system",
            notes: `Dividend payment: ${shareholder.balance.toLocaleString()} shares × $${(amountPerShare / 100).toFixed(2)} = $${(paymentAmount / 100).toLocaleString()}`,
          }),
        });
        console.log(`  Payment to ${shareholder.name?.padEnd(20) || shareholder.wallet.slice(0, 16).padEnd(20)} ${shareholder.balance.toLocaleString().padStart(10)} shares → $${(paymentAmount / 100).toLocaleString().padStart(10)}`);
      } catch (e) {
        console.error(`Error recording dividend payment:`, e);
      }

      currentSlot += 1;
    }

    console.log(`\nDividend round complete: ${actualShareholders.length} payments totaling $${(totalDividend / 100).toLocaleString()}`);
  }

  // ========================================
  // STEP 12: Record Transfer (bonus shares)
  // ========================================
  console.log("\n--- Step 12: Record Transfer ---");

  await sleep(500);
  currentSlot = await provider.connection.getSlot("confirmed");

  try {
    await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_type: "transfer",
        slot: currentSlot,
        wallet: FOUNDERS[0].wallet.publicKey.toString(), // Alice
        wallet_to: EMPLOYEES[0].wallet.publicKey.toString(), // David
        amount: 100_000,
        triggered_by: "wallet",
        notes: "Bonus shares transfer from Alice to David",
      }),
    });
    console.log(`Recorded TRANSFER: 100,000 shares from Alice to David at slot ${currentSlot}`);
  } catch (e) {
    console.error(`Error recording transfer:`, e);
  }

  // ========================================
  // STEP 13: Create Revaluation Round (409A)
  // ========================================
  console.log("\n--- Step 13: Create Revaluation Round (409A) ---");

  // A revaluation round is a $0 funding round that just updates the company valuation
  // This is typically done for 409A valuations or internal appraisals
  if (seriesAClassId) {
    try {
      const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "409A Valuation - Q1 2025",
          round_type: "revaluation",
          pre_money_valuation: 35_000_000_00, // $35M valuation (up from $25M post-Series A)
          share_class_id: seriesAClassId,
          notes: "Annual 409A valuation by independent appraiser. Company value increased due to strong growth metrics.",
        }),
      });
      if (response.ok) {
        const created = await response.json();
        console.log(`Created revaluation round (ID: ${created.id}) - $35M valuation`);

        // Close the revaluation round immediately (no investments needed)
        const closeResponse = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/${created.id}/close/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (closeResponse.ok) {
          const result = await closeResponse.json();
          console.log(`Revaluation round closed!`);
          console.log(`  New valuation: $${(result.post_money_valuation / 100).toLocaleString()}`);
          console.log(`  New price per share: $${(result.price_per_share / 100).toFixed(4)}`);
        }
      }
    } catch (e) {
      console.error(`Error creating revaluation round:`, e);
    }
  }

  // ========================================
  // STEP 14: Record Stock Split (2:1)
  // ========================================
  console.log("\n--- Step 14: Record Stock Split ---");

  await sleep(500);
  currentSlot = await provider.connection.getSlot("confirmed");

  try {
    await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_type: "stock_split",
        slot: currentSlot,
        data: { numerator: 2, denominator: 1 },
        triggered_by: "admin",
        notes: "2:1 stock split - doubling all shareholder positions",
      }),
    });
    console.log(`Recorded STOCK_SPLIT: 2:1 at slot ${currentSlot}`);
  } catch (e) {
    console.error(`Error recording stock split:`, e);
  }

  // ========================================
  // Summary
  // ========================================
  const finalSlot = await provider.connection.getSlot("confirmed");

  console.log("\n" + "=".repeat(60));
  console.log("=== Seed Complete ===");
  console.log("=".repeat(60) + "\n");

  console.log("Summary:");
  console.log(`  Token: ${SYMBOL} (ID: ${tokenId})`);
  console.log(`  Share Classes: ${Object.keys(shareClassIds).length + (seriesAClassId ? 1 : 0)}`);
  console.log(`  Participants: ${ALL_PARTICIPANTS.length}`);
  console.log(`  SAFEs Created: ${SAFE_INVESTORS.length}`);
  console.log(`  Funding Rounds: ${seriesARoundId ? 2 : 0} (Series A + Revaluation)`);
  console.log(`  Vesting Schedules: ${vestingSchedules.length} (30-min vesting with minute releases)`);
  console.log(`  Dividend Rounds: 1 (with ${ALL_PARTICIPANTS.length} individual payments)`);

  console.log(`\nSlot Range:`);
  if (confirmedTransactions.length > 0) {
    console.log(`  First transaction: slot ${confirmedTransactions[0].slot}`);
    console.log(`  Last operation: slot ${finalSlot}`);
  }
  console.log(`  Current blockchain slot: ${finalSlot}`);

  console.log(`\nTo test the features:`);
  console.log(`  1. Open the UI and select ${SYMBOL} token`);
  console.log(`  2. Go to Investments page to see:`);
  console.log(`     - Series A funding round with SAFE conversions`);
  console.log(`     - 409A Revaluation round (no new shares, just valuation update)`);
  console.log(`     - Converted SAFEs in funding round history`);
  console.log(`  3. Go to Cap Table to see all shareholders including SAFE converts`);
  console.log(`  4. Check Activity Feed for:`);
  console.log(`     - SAFE conversion transactions`);
  console.log(`     - Investment transactions`);
  console.log(`     - Minute-by-minute vesting releases`);
  console.log(`     - Individual dividend payment transactions`);

  console.log(`\nKey data points:`);
  console.log(`  - SAFEs converted at Series A with discount/cap mechanics`);
  console.log(`  - Vesting: 30-min schedules with 10 recorded minute releases each`);
  console.log(`  - Dividends: $0.08/share with individual payment records`);
  console.log(`  - Revaluation: $35M (up from $25M post-Series A)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
