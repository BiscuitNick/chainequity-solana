// @ts-nocheck
/**
 * Seed test data for ChainEquity
 *
 * This script:
 * 1. Creates a token on the blockchain (or uses existing)
 * 2. Approves multiple wallets to the allowlist
 * 3. Issues shares (mints tokens) to approved wallets
 * 4. Creates share classes in the database (Common & Preferred)
 * 5. Records all transactions to UnifiedTransaction table
 *
 * After running, you should be able to test historical snapshot viewing
 * by selecting different slots in the UI.
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
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
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
const FACTORY_PROGRAM_ID = new PublicKey("3Jui9FBBhqbbxE9s83fcUya1xrG9kpUZS1pTBAcWohbE");
const TOKEN_PROGRAM_ID = new PublicKey("TxPUnQaa9MWhTdTURSZEieS6BKmpYiU4c3GtYKV3Kq2");

// Load IDLs
const factoryIdl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../target/idl/chainequity_factory.json"), "utf8")
);
const tokenIdl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../target/idl/chainequity_token.json"), "utf8")
);

// API URL for database operations
const API_URL = process.env.API_URL || "http://localhost:8001";

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

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  let currentSlot: number;

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

      const createTokenParams = {
        symbol: SYMBOL,
        name: `${SYMBOL} Corporation`,
        decimals: 0, // Whole shares
        initialSupply: new anchor.BN(0), // Will mint later
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
    }

    console.log(`Token ID: ${tokenId}`);
    console.log(`Mint: ${mintAddress.toString()}`);
    console.log(`Config: ${tokenConfigPda.toString()}`);

    // ========================================
    // STEP 2: Approve wallets to allowlist
    // ========================================
    console.log("\n--- Step 2: Approve Wallets ---");

    currentSlot = await provider.connection.getSlot();
    console.log(`Current slot: ${currentSlot}`);

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
        // Check if already on allowlist
        await tokenProgram.account.allowlistEntry.fetch(allowlistPda);
        console.log(`  Already approved`);
      } catch (e) {
        // Not on allowlist, add them
        try {
          const tx = await (tokenProgram.methods as any)
            .addToAllowlist(2) // KYC level 2
            .accounts({
              tokenConfig: tokenConfigPda,
              allowlistEntry: allowlistPda,
              wallet: participant.wallet.publicKey,
              authority: provider.wallet.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
          console.log(`  Approved: ${tx.slice(0, 16)}...`);
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

    currentSlot = await provider.connection.getSlot();
    console.log(`Current slot: ${currentSlot}`);

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

      // Get or create associated token account
      const recipientAta = getAssociatedTokenAddressSync(
        mintAddress,
        participant.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        // Check if ATA exists
        await provider.connection.getAccountInfo(recipientAta);
      } catch (e) {
        // Create ATA
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
          // May already exist
        }
      }

      // Mint tokens
      try {
        const tx = await (tokenProgram.methods as any)
          .mintTokens(new anchor.BN(participant.shares))
          .accounts({
            tokenConfig: tokenConfigPda,
            mint: mintAddress,
            recipientAllowlist: allowlistPda,
            recipientTokenAccount: recipientAta,
            recipient: participant.wallet.publicKey,
            authority: provider.wallet.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        console.log(`  Minted: ${tx.slice(0, 16)}...`);
      } catch (mintError: any) {
        console.error(`  Error minting: ${mintError.message}`);
      }

      await sleep(300);
    }

    console.log("\n--- Step 4: Get final slot for recording ---");
    currentSlot = await provider.connection.getSlot();
    console.log(`Final slot: ${currentSlot}`);

  } else {
    // Skip on-chain, get token from database
    console.log("\nSkipping on-chain operations, using database...");
    currentSlot = Math.floor(Date.now() / 400); // Approximate slot
    tokenId = 1; // Will be set from API response
  }

  // ========================================
  // STEP 5: Sync to database via API
  // ========================================
  console.log("\n--- Step 5: Sync to Database ---");

  // First, sync the token from chain
  try {
    console.log("Syncing token to database...");
    const syncResponse = await fetch(`${API_URL}/api/v1/sync/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (syncResponse.ok) {
      console.log("Token synced successfully");
    } else {
      console.log("Token sync endpoint not available, trying direct insert...");
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
        // Create via API if sync didn't work
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
        // May already exist, try to fetch
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
  // STEP 7: Record transactions via API
  // ========================================
  console.log("\n--- Step 7: Record Transactions ---");

  let slot = currentSlot - 1000; // Start 1000 slots ago

  // Record approvals
  for (const participant of ALL_PARTICIPANTS) {
    slot += 10;
    try {
      await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_type: "APPROVAL",
          slot: slot,
          wallet: participant.wallet.publicKey.toString(),
          triggered_by: "admin",
          notes: `Approved ${participant.name}`,
        }),
      });
      console.log(`Recorded APPROVAL for ${participant.name} at slot ${slot}`);
    } catch (e) {
      console.error(`Error recording approval:`, e);
    }
  }

  // Record share grants
  for (const participant of ALL_PARTICIPANTS) {
    slot += 10;
    const scKey = participant.shareClass === "common" ? "common" : "preferred_a";
    const shareClassId = shareClassIds[scKey];
    const priority = participant.shareClass === "common" ? 2 : 1;
    const prefMult = participant.shareClass === "common" ? 1.0 : 1.5;

    try {
      await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_type: "SHARE_GRANT",
          slot: slot,
          wallet: participant.wallet.publicKey.toString(),
          amount: participant.shares,
          amount_secondary: (participant as any).costBasis || 0,
          share_class_id: shareClassId,
          priority: priority,
          preference_multiple: prefMult,
          triggered_by: "admin",
          notes: `Issued ${participant.shares.toLocaleString()} shares to ${participant.name}`,
        }),
      });
      console.log(`Recorded SHARE_GRANT for ${participant.name}: ${participant.shares.toLocaleString()} shares at slot ${slot}`);
    } catch (e) {
      console.error(`Error recording share grant:`, e);
    }
  }

  // Record a transfer (Alice transfers 100K to David as bonus)
  slot += 10;
  try {
    await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_type: "TRANSFER",
        slot: slot,
        wallet: FOUNDERS[0].wallet.publicKey.toString(), // Alice
        wallet_to: EMPLOYEES[0].wallet.publicKey.toString(), // David
        amount: 100_000,
        triggered_by: "wallet",
        notes: "Bonus shares transfer",
      }),
    });
    console.log(`Recorded TRANSFER: 100,000 shares from Alice to David at slot ${slot}`);
  } catch (e) {
    console.error(`Error recording transfer:`, e);
  }

  // Record a stock split (2:1)
  slot += 50;
  try {
    await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_type: "STOCK_SPLIT",
        slot: slot,
        data: { numerator: 2, denominator: 1 },
        triggered_by: "admin",
        notes: "2:1 stock split",
      }),
    });
    console.log(`Recorded STOCK_SPLIT: 2:1 at slot ${slot}`);
  } catch (e) {
    console.error(`Error recording stock split:`, e);
  }

  // ========================================
  // Summary
  // ========================================
  console.log("\n=== Seed Complete ===\n");
  console.log("Summary:");
  console.log(`  Token: ${SYMBOL} (ID: ${tokenId})`);
  console.log(`  Share Classes: ${Object.keys(shareClassIds).length}`);
  console.log(`  Participants: ${ALL_PARTICIPANTS.length}`);
  console.log(`  Total Shares: ${ALL_PARTICIPANTS.reduce((sum, p) => sum + p.shares, 0).toLocaleString()}`);
  console.log(`\nTransaction Timeline:`);
  console.log(`  Approvals: slots ${currentSlot - 1000} to ${currentSlot - 1000 + ALL_PARTICIPANTS.length * 10}`);
  console.log(`  Share Grants: following slots`);
  console.log(`  Transfer: slot ${slot - 50}`);
  console.log(`  Stock Split: slot ${slot}`);
  console.log(`\nTo test historical snapshots:`);
  console.log(`  1. Open the UI and select ${SYMBOL} token`);
  console.log(`  2. Use the slot selector to view state at different points`);
  console.log(`  3. Before split: total ~12.175M shares`);
  console.log(`  4. After split: total ~24.35M shares`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
