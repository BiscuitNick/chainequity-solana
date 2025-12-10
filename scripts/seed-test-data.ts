// @ts-nocheck
/**
 * Seed test data for ChainEquity
 *
 * Creates 4 tokens at different funding stages:
 * - EARLY: Seed stage only (S1X shares)
 * - GROW: Series A stage (S1X, A1X shares)
 * - SCALE: Series B stage (S1X, A1X, B2X shares)
 * - LATE: Series C stage (S1X, A1X, B2X, C3X shares)
 *
 * Share Classes (standard):
 * - Common (COM) - Priority 9, 1x preference
 * - Seed (S1X) - Priority 8, 1x preference
 * - Series A (A1X) - Priority 7, 1x preference
 * - Series B (B2X) - Priority 6, 2x preference
 * - Series C (C3X) - Priority 5, 3x preference
 *
 * All preferred shares come from funding rounds (direct investments or SAFE conversions).
 * SAFEs convert at the Seed round.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/seed-test-data.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

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

// ============================================
// Standard Share Classes (matches frontend)
// ============================================
const SHARE_CLASSES = {
  COM: { name: "Common", symbol: "COM", priority: 9, preference_multiple: 1 },
  S1X: { name: "Seed", symbol: "S1X", priority: 8, preference_multiple: 1 },
  A1X: { name: "Series A", symbol: "A1X", priority: 7, preference_multiple: 1 },
  B2X: { name: "Series B", symbol: "B2X", priority: 6, preference_multiple: 2 },
  C3X: { name: "Series C", symbol: "C3X", priority: 5, preference_multiple: 3 },
};

// ============================================
// Token Configurations - 4 companies at different stages
// ============================================
interface TokenConfig {
  symbol: string;
  name: string;
  stage: "seed" | "series_a" | "series_b" | "series_c";
  founders: { name: string; seed: string; shares: number }[];
  employees: { name: string; seed: string; shares: number; vestingMonths: number }[];
  safes: { name: string; seed: string; principal: number; cap: number; discount: number }[];
  seedRound: { investors: { name: string; seed: string; amount: number }[]; preMoney: number } | null;
  seriesARound: { investors: { name: string; seed: string; amount: number }[]; preMoney: number } | null;
  seriesBRound: { investors: { name: string; seed: string; amount: number }[]; preMoney: number } | null;
  seriesCRound: { investors: { name: string; seed: string; amount: number }[]; preMoney: number } | null;
  hasDividends: boolean;
  hasStockSplit: boolean;
}

const TOKENS: TokenConfig[] = [
  // ============================================
  // EARLY - Seed stage startup (just raised seed round)
  // ============================================
  {
    symbol: "EARLY",
    name: "Early Stage Inc",
    stage: "seed",
    founders: [
      { name: "Founder A", seed: "early-founder-a-001", shares: 5_000_000 },
      { name: "Founder B", seed: "early-founder-b-002", shares: 3_000_000 },
    ],
    employees: [
      { name: "Engineer 1", seed: "early-eng-001", shares: 200_000, vestingMonths: 48 },
    ],
    safes: [
      { name: "Angel 1", seed: "early-angel-001", principal: 100_000_00, cap: 8_000_000_00, discount: 0.20 },
      { name: "Angel 2", seed: "early-angel-002", principal: 50_000_00, cap: 8_000_000_00, discount: 0.20 },
    ],
    seedRound: {
      investors: [
        { name: "Seed Fund Alpha", seed: "early-seed-alpha", amount: 500_000_00 },
      ],
      preMoney: 8_000_000_00, // $8M pre-money
    },
    seriesARound: null,
    seriesBRound: null,
    seriesCRound: null,
    hasDividends: false,
    hasStockSplit: false,
  },
  // ============================================
  // GROW - Series A startup
  // ============================================
  {
    symbol: "GROW",
    name: "Growth Corp",
    stage: "series_a",
    founders: [
      { name: "CEO", seed: "grow-ceo-001", shares: 4_000_000 },
      { name: "CTO", seed: "grow-cto-002", shares: 3_000_000 },
      { name: "COO", seed: "grow-coo-003", shares: 2_000_000 },
    ],
    employees: [
      { name: "VP Engineering", seed: "grow-vpe-001", shares: 300_000, vestingMonths: 48 },
      { name: "VP Sales", seed: "grow-vps-002", shares: 250_000, vestingMonths: 48 },
    ],
    safes: [
      { name: "Pre-Seed Angel", seed: "grow-preseed-001", principal: 200_000_00, cap: 6_000_000_00, discount: 0.25 },
    ],
    seedRound: {
      investors: [
        { name: "Seed Ventures", seed: "grow-seed-vent", amount: 1_000_000_00 },
        { name: "Angel Syndicate", seed: "grow-angel-synd", amount: 500_000_00 },
      ],
      preMoney: 10_000_000_00, // $10M
    },
    seriesARound: {
      investors: [
        { name: "VC Partners I", seed: "grow-vc-part-1", amount: 5_000_000_00 },
        { name: "Strategic Investor", seed: "grow-strat-inv", amount: 2_000_000_00 },
      ],
      preMoney: 25_000_000_00, // $25M
    },
    seriesBRound: null,
    seriesCRound: null,
    hasDividends: false,
    hasStockSplit: false,
  },
  // ============================================
  // SCALE - Series B startup
  // ============================================
  {
    symbol: "SCALE",
    name: "ScaleUp Technologies",
    stage: "series_b",
    founders: [
      { name: "CEO", seed: "scale-ceo-001", shares: 3_500_000 },
      { name: "CTO", seed: "scale-cto-002", shares: 2_500_000 },
    ],
    employees: [
      { name: "CFO", seed: "scale-cfo-001", shares: 400_000, vestingMonths: 48 },
      { name: "VP Product", seed: "scale-vpp-002", shares: 300_000, vestingMonths: 48 },
      { name: "VP Eng", seed: "scale-vpe-003", shares: 300_000, vestingMonths: 48 },
    ],
    safes: [], // No SAFEs - already past that stage
    seedRound: {
      investors: [
        { name: "Early Seed Fund", seed: "scale-early-seed", amount: 800_000_00 },
      ],
      preMoney: 8_000_000_00,
    },
    seriesARound: {
      investors: [
        { name: "Series A Lead", seed: "scale-ser-a-lead", amount: 8_000_000_00 },
        { name: "Series A Follow", seed: "scale-ser-a-fol", amount: 2_000_000_00 },
      ],
      preMoney: 30_000_000_00,
    },
    seriesBRound: {
      investors: [
        { name: "Growth Equity Fund", seed: "scale-growth-eq", amount: 25_000_000_00 },
        { name: "Corporate VC", seed: "scale-corp-vc", amount: 10_000_000_00 },
      ],
      preMoney: 100_000_000_00, // $100M pre-money
    },
    seriesCRound: null,
    hasDividends: true,
    hasStockSplit: true,
  },
  // ============================================
  // LATE - Series C (late stage)
  // ============================================
  {
    symbol: "LATE",
    name: "LateStage Holdings",
    stage: "series_c",
    founders: [
      { name: "CEO", seed: "late-ceo-001", shares: 2_000_000 },
      { name: "President", seed: "late-pres-002", shares: 1_500_000 },
    ],
    employees: [
      { name: "CFO", seed: "late-cfo-001", shares: 500_000, vestingMonths: 48 },
      { name: "CTO", seed: "late-cto-002", shares: 500_000, vestingMonths: 48 },
      { name: "CMO", seed: "late-cmo-003", shares: 400_000, vestingMonths: 48 },
      { name: "COO", seed: "late-coo-004", shares: 400_000, vestingMonths: 48 },
    ],
    safes: [], // No SAFEs at this stage
    seedRound: {
      investors: [
        { name: "Seed Investor", seed: "late-seed-inv", amount: 500_000_00 },
      ],
      preMoney: 5_000_000_00,
    },
    seriesARound: {
      investors: [
        { name: "Series A VC", seed: "late-ser-a-vc", amount: 10_000_000_00 },
      ],
      preMoney: 25_000_000_00,
    },
    seriesBRound: {
      investors: [
        { name: "Series B Lead", seed: "late-ser-b-lead", amount: 30_000_000_00 },
        { name: "Series B Participant", seed: "late-ser-b-part", amount: 15_000_000_00 },
      ],
      preMoney: 80_000_000_00,
    },
    seriesCRound: {
      investors: [
        { name: "Crossover Fund", seed: "late-crossover", amount: 75_000_000_00 },
        { name: "Late Stage Partners", seed: "late-stage-part", amount: 50_000_000_00 },
        { name: "Sovereign Wealth Fund", seed: "late-swf", amount: 25_000_000_00 },
      ],
      preMoney: 300_000_000_00, // $300M pre-money!
    },
    hasDividends: true,
    hasStockSplit: true,
  },
];

// Track transactions
interface ConfirmedTransaction {
  type: string;
  slot: number;
  signature: string;
  participant?: any;
  data?: any;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getConfirmedSlot(connection: anchor.web3.Connection, signature: string): Promise<number> {
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || tx.slot === undefined) {
    return await connection.getSlot("confirmed");
  }
  return tx.slot;
}

// ============================================
// Helper: Create share class via API
// ============================================
async function createShareClass(tokenId: number, sc: typeof SHARE_CLASSES.COM): Promise<number | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/share-classes/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sc),
    });
    if (response.ok) {
      const created = await response.json();
      console.log(`    Created share class: ${sc.symbol} (ID: ${created.id})`);
      return created.id;
    } else {
      // Try to find existing
      const existing = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/share-classes/`);
      if (existing.ok) {
        const classes = await existing.json();
        const found = classes.find((c: any) => c.symbol === sc.symbol);
        if (found) {
          console.log(`    Found existing share class: ${sc.symbol} (ID: ${found.id})`);
          return found.id;
        }
      }
    }
  } catch (e) {
    console.error(`    Error creating share class ${sc.symbol}:`, e);
  }
  return null;
}

// ============================================
// Helper: Create funding round
// ============================================
async function createFundingRound(
  tokenId: number,
  name: string,
  roundType: string,
  preMoney: number,
  shareClassId: number
): Promise<number | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        round_type: roundType,
        pre_money_valuation: preMoney,
        share_class_id: shareClassId,
      }),
    });
    if (response.ok) {
      const created = await response.json();
      console.log(`    Created ${name} round (ID: ${created.id}) - $${(preMoney / 100).toLocaleString()} pre-money`);
      return created.id;
    } else {
      const errorText = await response.text();
      console.error(`    Failed to create ${name}: ${response.status} ${errorText}`);
    }
  } catch (e) {
    console.error(`    Error creating ${name}:`, e);
  }
  return null;
}

// ============================================
// Helper: Add investment to round
// ============================================
async function addInvestment(
  tokenId: number,
  roundId: number,
  investor: { name: string; seed: string; amount: number }
): Promise<void> {
  const wallet = generateTestWallet(investor.seed);
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/${roundId}/investments/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investor_wallet: wallet.publicKey.toString(),
        investor_name: investor.name,
        amount: investor.amount,
      }),
    });
    if (response.ok) {
      const created = await response.json();
      console.log(`      ${investor.name}: $${(investor.amount / 100).toLocaleString()} → ${created.shares_received?.toLocaleString() || 'N/A'} shares`);
    }
  } catch (e) {
    console.error(`      Error adding investment for ${investor.name}:`, e);
  }
}

// ============================================
// Helper: Create and convert SAFE
// ============================================
async function createAndConvertSafe(
  tokenId: number,
  safe: { name: string; seed: string; principal: number; cap: number; discount: number },
  roundId: number
): Promise<void> {
  const wallet = generateTestWallet(safe.seed);
  try {
    // Create SAFE
    const createResponse = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/convertibles/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument_type: "safe",
        name: `SAFE - ${safe.name}`,
        holder_wallet: wallet.publicKey.toString(),
        holder_name: safe.name,
        principal_amount: safe.principal,
        valuation_cap: safe.cap,
        discount_rate: safe.discount,
        safe_type: "post_money",
      }),
    });

    if (createResponse.ok) {
      const created = await createResponse.json();
      console.log(`      Created SAFE for ${safe.name}: $${(safe.principal / 100).toLocaleString()}`);

      // Convert SAFE at the round
      const convertResponse = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/convertibles/${created.id}/convert/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funding_round_id: roundId }),
      });

      if (convertResponse.ok) {
        const result = await convertResponse.json();
        console.log(`        Converted → ${result.shares_received?.toLocaleString() || 'N/A'} shares`);
      }
    }
  } catch (e) {
    console.error(`      Error with SAFE for ${safe.name}:`, e);
  }
}

// ============================================
// Helper: Close funding round
// ============================================
async function closeFundingRound(tokenId: number, roundId: number, roundName: string): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/${roundId}/close/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (response.ok) {
      const result = await response.json();
      console.log(`    Closed ${roundName}: $${(result.amount_raised / 100).toLocaleString()} raised, ${result.shares_issued?.toLocaleString() || 0} shares issued`);
    }
  } catch (e) {
    console.error(`    Error closing ${roundName}:`, e);
  }
}

// ============================================
// Main seed function for a single token
// ============================================
async function seedToken(
  provider: anchor.AnchorProvider,
  factoryProgram: Program,
  tokenProgram: Program,
  factoryPda: PublicKey,
  config: TokenConfig,
  tokenIndex: number
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SEEDING: ${config.symbol} - ${config.name} (${config.stage})`);
  console.log("=".repeat(60));

  const confirmedTransactions: ConfirmedTransaction[] = [];
  let currentSlot = await provider.connection.getSlot("confirmed");

  // Calculate total founder shares for initial supply
  const founderShares = config.founders.reduce((sum, f) => sum + f.shares, 0);
  const employeeShares = config.employees.reduce((sum, e) => sum + e.shares, 0);
  const totalInitialShares = founderShares + employeeShares;

  // ========================================
  // STEP 1: Create token on-chain
  // ========================================
  console.log("\n  [1] Creating token on-chain...");

  let factory;
  try {
    factory = await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
  } catch (e) {
    console.error("  Factory not initialized!");
    return;
  }

  const mintKeypair = Keypair.generate();
  const mintAddress = mintKeypair.publicKey;
  const tokenCount = factory.tokenCount.toNumber();

  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
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

  try {
    const createTx = await (factoryProgram.methods as any)
      .createToken({
        symbol: config.symbol,
        name: config.name,
        decimals: 0,
        initialSupply: new anchor.BN(totalInitialShares),
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
      })
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

    console.log(`    Token created: ${config.symbol}`);
    await sleep(500);

    // Initialize mint authority
    const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority"), tokenConfigPda.toBuffer()],
      TOKEN_PROGRAM_ID
    );

    await (tokenProgram.methods as any)
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
    await sleep(300);

    await (factoryProgram.methods as any)
      .transferMintAuthority()
      .accounts({
        tokenConfig: tokenConfigPda,
        mint: mintAddress,
        newAuthority: mintAuthorityPda,
        authority: provider.wallet.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    await sleep(300);
  } catch (e: any) {
    console.error(`    Error creating token: ${e.message?.slice(0, 100)}`);
    return;
  }

  // ========================================
  // STEP 2: Sync to database
  // ========================================
  console.log("\n  [2] Syncing to database...");

  let tokenId: number;
  try {
    const tokenConfig = await (factoryProgram.account as any).tokenConfig.fetch(tokenConfigPda);
    tokenId = tokenConfig.tokenId.toNumber();

    await fetch(`${API_URL}/api/v1/tokens/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token_id: tokenId,
        on_chain_config: tokenConfigPda.toString(),
        mint_address: mintAddress.toString(),
        symbol: config.symbol,
        name: config.name,
        decimals: 0,
        total_supply: totalInitialShares,
        features: {
          vesting_enabled: true,
          governance_enabled: true,
          dividends_enabled: true,
          transfer_restrictions_enabled: true,
        },
      }),
    });
    console.log(`    Token synced: ID=${tokenId}`);
  } catch (e) {
    console.error("    Error syncing token");
    return;
  }

  // ========================================
  // STEP 3: Create share classes
  // ========================================
  console.log("\n  [3] Creating share classes...");

  const shareClassIds: Record<string, number> = {};

  // Always create Common
  const comId = await createShareClass(tokenId, SHARE_CLASSES.COM);
  if (comId) shareClassIds["COM"] = comId;

  // Create classes based on stage
  const s1xId = await createShareClass(tokenId, SHARE_CLASSES.S1X);
  if (s1xId) shareClassIds["S1X"] = s1xId;

  if (config.stage !== "seed") {
    const a1xId = await createShareClass(tokenId, SHARE_CLASSES.A1X);
    if (a1xId) shareClassIds["A1X"] = a1xId;
  }

  if (config.stage === "series_b" || config.stage === "series_c") {
    const b2xId = await createShareClass(tokenId, SHARE_CLASSES.B2X);
    if (b2xId) shareClassIds["B2X"] = b2xId;
  }

  if (config.stage === "series_c") {
    const c3xId = await createShareClass(tokenId, SHARE_CLASSES.C3X);
    if (c3xId) shareClassIds["C3X"] = c3xId;
  }

  // ========================================
  // STEP 4: Approve and mint to founders (Common shares)
  // ========================================
  console.log("\n  [4] Issuing founder shares (Common)...");

  const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority"), tokenConfigPda.toBuffer()],
    TOKEN_PROGRAM_ID
  );

  for (const founder of config.founders) {
    const wallet = generateTestWallet(founder.seed);

    // Approve
    const [allowlistPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("allowlist"), tokenConfigPda.toBuffer(), wallet.publicKey.toBuffer()],
      TOKEN_PROGRAM_ID
    );

    try {
      const approvalTx = await (tokenProgram.methods as any)
        .addToAllowlist()
        .accounts({
          tokenConfig: tokenConfigPda,
          allowlistEntry: allowlistPda,
          wallet: wallet.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await sleep(200);

      const slot = await getConfirmedSlot(provider.connection, approvalTx);
      confirmedTransactions.push({ type: "approval", slot, signature: approvalTx, participant: { ...founder, wallet } });
    } catch (e) {
      // May already be approved
    }

    // Create ATA
    const recipientAta = getAssociatedTokenAddressSync(mintAddress, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
    try {
      const createAtaIx = createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey, recipientAta, wallet.publicKey, mintAddress, TOKEN_2022_PROGRAM_ID
      );
      const tx = new anchor.web3.Transaction().add(createAtaIx);
      await provider.sendAndConfirm(tx);
    } catch (e) {}

    // Mint
    try {
      const mintTx = await (tokenProgram.methods as any)
        .mintTokens(new anchor.BN(founder.shares))
        .accounts({
          tokenConfig: tokenConfigPda,
          mint: mintAddress,
          mintAuthority: mintAuthorityPda,
          recipientAllowlist: allowlistPda,
          recipientTokenAccount: recipientAta,
          recipient: wallet.publicKey,
          authority: provider.wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      await sleep(200);

      const slot = await getConfirmedSlot(provider.connection, mintTx);
      confirmedTransactions.push({ type: "share_grant", slot, signature: mintTx, participant: { ...founder, wallet, shareClass: "COM" } });
      console.log(`    ${founder.name}: ${founder.shares.toLocaleString()} COM shares`);
    } catch (e: any) {
      console.error(`    Error minting to ${founder.name}: ${e.message?.slice(0, 50)}`);
    }
  }

  // ========================================
  // STEP 5: Record transactions in database
  // ========================================
  console.log("\n  [5] Recording transactions...");

  confirmedTransactions.sort((a, b) => a.slot - b.slot);
  for (const tx of confirmedTransactions) {
    try {
      if (tx.type === "approval") {
        await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_type: "approval",
            slot: tx.slot,
            wallet: tx.participant.wallet.publicKey.toString(),
            tx_signature: tx.signature,
            triggered_by: "admin",
          }),
        });
      } else if (tx.type === "share_grant") {
        await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_type: "share_grant",
            slot: tx.slot,
            wallet: tx.participant.wallet.publicKey.toString(),
            amount: tx.participant.shares,
            share_class_id: shareClassIds["COM"],
            priority: SHARE_CLASSES.COM.priority,
            preference_multiple: SHARE_CLASSES.COM.preference_multiple,
            tx_signature: tx.signature,
            triggered_by: "admin",
            notes: `Founder grant: ${tx.participant.shares.toLocaleString()} shares to ${tx.participant.name}`,
          }),
        });
      }
    } catch (e) {}
  }
  console.log(`    Recorded ${confirmedTransactions.length} transactions`);

  // ========================================
  // STEP 6: Seed Funding Round (with SAFE conversions)
  // ========================================
  if (config.seedRound && shareClassIds["S1X"]) {
    console.log("\n  [6] Seed Round (S1X shares)...");

    const seedRoundId = await createFundingRound(tokenId, "Seed Round", "seed", config.seedRound.preMoney, shareClassIds["S1X"]);

    if (seedRoundId) {
      // Convert SAFEs first (they convert at the seed round)
      if (config.safes.length > 0) {
        console.log("    Converting SAFEs...");
        for (const safe of config.safes) {
          await createAndConvertSafe(tokenId, safe, seedRoundId);
        }
      }

      // Add direct investments
      console.log("    Adding investments...");
      for (const investor of config.seedRound.investors) {
        await addInvestment(tokenId, seedRoundId, investor);
      }

      await closeFundingRound(tokenId, seedRoundId, "Seed Round");
    }
  }

  // ========================================
  // STEP 7: Series A Round
  // ========================================
  if (config.seriesARound && shareClassIds["A1X"]) {
    console.log("\n  [7] Series A Round (A1X shares)...");

    const seriesARoundId = await createFundingRound(tokenId, "Series A", "series_a", config.seriesARound.preMoney, shareClassIds["A1X"]);

    if (seriesARoundId) {
      for (const investor of config.seriesARound.investors) {
        await addInvestment(tokenId, seriesARoundId, investor);
      }
      await closeFundingRound(tokenId, seriesARoundId, "Series A");
    }
  }

  // ========================================
  // STEP 8: Series B Round
  // ========================================
  if (config.seriesBRound && shareClassIds["B2X"]) {
    console.log("\n  [8] Series B Round (B2X shares - 2x preference)...");

    const seriesBRoundId = await createFundingRound(tokenId, "Series B", "series_b", config.seriesBRound.preMoney, shareClassIds["B2X"]);

    if (seriesBRoundId) {
      for (const investor of config.seriesBRound.investors) {
        await addInvestment(tokenId, seriesBRoundId, investor);
      }
      await closeFundingRound(tokenId, seriesBRoundId, "Series B");
    }
  }

  // ========================================
  // STEP 9: Series C Round
  // ========================================
  if (config.seriesCRound && shareClassIds["C3X"]) {
    console.log("\n  [9] Series C Round (C3X shares - 3x preference)...");

    const seriesCRoundId = await createFundingRound(tokenId, "Series C", "series_c", config.seriesCRound.preMoney, shareClassIds["C3X"]);

    if (seriesCRoundId) {
      for (const investor of config.seriesCRound.investors) {
        await addInvestment(tokenId, seriesCRoundId, investor);
      }
      await closeFundingRound(tokenId, seriesCRoundId, "Series C");
    }
  }

  // ========================================
  // STEP 10: Employee vesting schedules
  // ========================================
  if (config.employees.length > 0) {
    console.log("\n  [10] Creating employee vesting schedules...");

    const vestingStartTime = Math.floor(Date.now() / 1000);

    for (const emp of config.employees) {
      const wallet = generateTestWallet(emp.seed);
      try {
        await fetch(`${API_URL}/api/v1/tokens/${tokenId}/vesting/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beneficiary: wallet.publicKey.toString(),
            total_amount: emp.shares,
            start_time: vestingStartTime,
            cliff_seconds: 365 * 24 * 60 * 60, // 1 year cliff
            duration_seconds: emp.vestingMonths * 30 * 24 * 60 * 60,
            vesting_type: "linear",
            revocable: true,
            share_class_id: shareClassIds["COM"],
          }),
        });
        console.log(`    ${emp.name}: ${emp.shares.toLocaleString()} shares vesting over ${emp.vestingMonths} months`);
      } catch (e) {}
    }
  }

  // ========================================
  // STEP 11: Dividends (if applicable)
  // ========================================
  if (config.hasDividends) {
    console.log("\n  [11] Creating dividend round...");

    currentSlot = await provider.connection.getSlot("confirmed");
    const amountPerShare = 10; // $0.10 per share

    try {
      const stateResponse = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/captable/state/${currentSlot}`);
      if (stateResponse.ok) {
        const state = await stateResponse.json();
        const shareholders = Object.entries(state.balances || {}).filter(([_, b]) => (b as number) > 0);
        const totalShares = shareholders.reduce((sum, [_, b]) => sum + (b as number), 0);

        await fetch(`${API_URL}/api/v1/tokens/${tokenId}/dividends/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_token: "USDC",
            total_pool: totalShares * amountPerShare,
          }),
        });
        console.log(`    Dividend: $${(amountPerShare / 100).toFixed(2)}/share to ${shareholders.length} shareholders`);
      }
    } catch (e) {}
  }

  // ========================================
  // STEP 12: Stock split (if applicable)
  // ========================================
  if (config.hasStockSplit) {
    console.log("\n  [12] Recording stock split (2:1)...");

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
      console.log(`    2:1 stock split recorded`);
    } catch (e) {}
  }

  console.log(`\n  ✓ ${config.symbol} seeding complete!`);
}

// ============================================
// Main
// ============================================
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("ChainEquity Multi-Token Seed Script");
  console.log("=".repeat(60));
  console.log("\nThis will create 4 tokens at different funding stages:");
  console.log("  - EARLY: Seed stage");
  console.log("  - GROW: Series A stage");
  console.log("  - SCALE: Series B stage");
  console.log("  - LATE: Series C stage");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log(`\nWallet: ${provider.wallet.publicKey.toString()}`);
  console.log(`Cluster: ${provider.connection.rpcEndpoint}`);

  const factoryProgram = new Program(factoryIdl, provider);
  const tokenProgram = new Program(tokenIdl, provider);

  const [factoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory")],
    FACTORY_PROGRAM_ID
  );

  // Check factory is initialized
  try {
    await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
  } catch (e) {
    console.error("\nFactory not initialized. Run 'anchor run init-factory' first.");
    process.exit(1);
  }

  // Seed each token
  for (let i = 0; i < TOKENS.length; i++) {
    await seedToken(provider, factoryProgram, tokenProgram, factoryPda, TOKENS[i], i);
    await sleep(1000);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SEEDING COMPLETE");
  console.log("=".repeat(60));
  console.log("\nTokens created:");
  for (const token of TOKENS) {
    const rounds = [
      token.seedRound ? "Seed" : null,
      token.seriesARound ? "Series A" : null,
      token.seriesBRound ? "Series B" : null,
      token.seriesCRound ? "Series C" : null,
    ].filter(Boolean).join(", ");
    console.log(`  ${token.symbol}: ${token.name} - ${token.stage} (${rounds})`);
  }

  console.log("\nShare Class Reference:");
  console.log("  COM  - Common (Priority 9, 1x pref)");
  console.log("  S1X  - Seed (Priority 8, 1x pref)");
  console.log("  A1X  - Series A (Priority 7, 1x pref)");
  console.log("  B2X  - Series B (Priority 6, 2x pref)");
  console.log("  C3X  - Series C (Priority 5, 3x pref)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
