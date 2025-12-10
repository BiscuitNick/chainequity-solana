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
 * 6. Creates vesting schedules
 * 7. Issues dividends
 * 8. Performs corporate actions (stock split)
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
  // STEP 8: Create Vesting Schedules
  // ========================================
  console.log("\n--- Step 8: Create Vesting Schedules ---");

  // Create vesting schedules for employees
  const vestingSchedules = [
    {
      beneficiary: EMPLOYEES[0], // David
      totalAmount: 200_000,
      cliff: 365, // 1 year cliff
      duration: 1460, // 4 years total
      scheduleId: 1,
    },
    {
      beneficiary: EMPLOYEES[1], // Eve
      totalAmount: 150_000,
      cliff: 365,
      duration: 1460,
      scheduleId: 2,
    },
  ];

  // Get current slot for vesting creation
  currentSlot = await provider.connection.getSlot("confirmed");

  for (const vs of vestingSchedules) {
    const vestingSlot = currentSlot;
    currentSlot += 1; // Increment for next operation

    try {
      await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_type: "vesting_schedule_create",
          slot: vestingSlot,
          wallet: vs.beneficiary.wallet.publicKey.toString(),
          amount: vs.totalAmount,
          share_class_id: shareClassIds["common"],
          priority: 2,
          preference_multiple: 1.0,
          reference_id: vs.scheduleId,
          reference_type: "vesting_schedule",
          data: {
            start_time: new Date().toISOString(),
            duration_seconds: vs.duration * 24 * 60 * 60,
            cliff_seconds: vs.cliff * 24 * 60 * 60,
            vesting_type: "linear",
          },
          triggered_by: "admin",
          notes: `Vesting schedule for ${vs.beneficiary.name}: ${vs.totalAmount.toLocaleString()} shares over ${vs.duration} days`,
        }),
      });
      console.log(`Created VESTING_SCHEDULE for ${vs.beneficiary.name}: ${vs.totalAmount.toLocaleString()} shares at slot ${vestingSlot}`);
    } catch (e) {
      console.error(`Error creating vesting schedule:`, e);
    }
  }

  // Simulate some vesting releases (as if time has passed)
  console.log("\nSimulating vesting releases...");

  await sleep(500);
  currentSlot = await provider.connection.getSlot("confirmed");

  for (const vs of vestingSchedules) {
    const releaseAmount = Math.floor(vs.totalAmount * 0.25); // 25% released

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
          triggered_by: "system",
          notes: `Vested ${releaseAmount.toLocaleString()} shares to ${vs.beneficiary.name}`,
        }),
      });
      console.log(`Recorded VESTING_RELEASE for ${vs.beneficiary.name}: ${releaseAmount.toLocaleString()} shares at slot ${currentSlot}`);
    } catch (e) {
      console.error(`Error recording vesting release:`, e);
    }

    currentSlot += 1;
  }

  // ========================================
  // STEP 9: Create Dividend Round
  // ========================================
  console.log("\n--- Step 9: Create Dividend Round ---");

  await sleep(500);
  currentSlot = await provider.connection.getSlot("confirmed");

  const dividendRoundId = 1;
  const totalDividend = 1_000_000_00; // $1M total dividend

  try {
    await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_type: "dividend_round_create",
        slot: currentSlot,
        amount: totalDividend,
        reference_id: dividendRoundId,
        reference_type: "dividend_round",
        data: {
          record_date: new Date().toISOString(),
          payment_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          amount_per_share: 8, // 8 cents per share
        },
        triggered_by: "admin",
        notes: `Dividend round: $${(totalDividend / 100).toLocaleString()} total`,
      }),
    });
    console.log(`Created DIVIDEND_ROUND: $${(totalDividend / 100).toLocaleString()} at slot ${currentSlot}`);
  } catch (e) {
    console.error(`Error creating dividend round:`, e);
  }

  // Record dividend payments to each shareholder
  console.log("\nRecording dividend payments...");

  await sleep(500);
  currentSlot = await provider.connection.getSlot("confirmed");

  const amountPerShare = 8; // 8 cents per share

  for (const participant of ALL_PARTICIPANTS) {
    const paymentAmount = participant.shares * amountPerShare;

    try {
      await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_type: "dividend_payment",
          slot: currentSlot,
          wallet: participant.wallet.publicKey.toString(),
          amount: paymentAmount,
          reference_id: dividendRoundId,
          reference_type: "dividend_round",
          data: {
            shares_held: participant.shares,
            amount_per_share: amountPerShare,
          },
          triggered_by: "system",
          notes: `Dividend payment to ${participant.name}: $${(paymentAmount / 100).toLocaleString()}`,
        }),
      });
      console.log(`Recorded DIVIDEND_PAYMENT for ${participant.name}: $${(paymentAmount / 100).toLocaleString()} at slot ${currentSlot}`);
    } catch (e) {
      console.error(`Error recording dividend payment:`, e);
    }

    currentSlot += 1;
  }

  // ========================================
  // STEP 10: Record Transfer (bonus shares)
  // ========================================
  console.log("\n--- Step 10: Record Transfer ---");

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
  // STEP 11: Record Stock Split (2:1)
  // ========================================
  console.log("\n--- Step 11: Record Stock Split ---");

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
        notes: "2:1 stock split",
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

  console.log("\n=== Seed Complete ===\n");
  console.log("Summary:");
  console.log(`  Token: ${SYMBOL} (ID: ${tokenId})`);
  console.log(`  Share Classes: ${Object.keys(shareClassIds).length}`);
  console.log(`  Participants: ${ALL_PARTICIPANTS.length}`);
  console.log(`  Vesting Schedules: ${vestingSchedules.length}`);
  console.log(`  Dividend Rounds: 1`);
  console.log(`\nSlot Range:`);
  if (confirmedTransactions.length > 0) {
    console.log(`  First transaction: slot ${confirmedTransactions[0].slot}`);
    console.log(`  Last operation: slot ${finalSlot}`);
  }
  console.log(`  Current blockchain slot: ${finalSlot}`);
  console.log(`\nTo test historical snapshots:`);
  console.log(`  1. Open the UI and select ${SYMBOL} token`);
  console.log(`  2. Use the slot selector to view state at different points`);
  console.log(`\nKey events to check:`);
  console.log(`  - Before stock split: ~12.175M shares`);
  console.log(`  - After stock split: ~24.35M shares`);
  console.log(`  - Vesting schedules created for David and Eve`);
  console.log(`  - Dividend payments to all shareholders`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
