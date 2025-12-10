// @ts-nocheck
/**
 * Demo Data Seed Script for ChainEquity
 *
 * Creates 4 realistic cap tables with proper funding round structures:
 *
 * 1. FRSH - Freshly Inc (Early Stage)
 *    - Just closed seed round with SAFE conversions
 *    - 6 shareholders
 *
 * 2. GRWP - GrowthPath (Growth Stage)
 *    - Series A complete, healthy expansion
 *    - 12 shareholders
 *    - Vesting schedules (minutes - for quick demo)
 *
 * 3. SCFR - ScaleForce (Scale Stage)
 *    - Series B complete, mature cap table
 *    - 18 shareholders
 *    - Vesting schedules (hours - for demo)
 *    - Dividend distribution
 *
 * 4. TBDG - TechBridge (Troubled - Down Round)
 *    - Series C rescue financing at lower valuation
 *    - 22 shareholders
 *    - Higher preference multiples on Series C (3x)
 *
 * Share Classes:
 * - COM  (Priority 9, 1x pref) - Common
 * - S1X  (Priority 8, 1x pref) - Seed
 * - A1X  (Priority 7, 1x pref) - Series A
 * - B2X  (Priority 6, 2x pref) - Series B
 * - C3X  (Priority 5, 3x pref) - Series C (rescue financing)
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/seed-demo-data.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
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

// Nominal cost basis for common shares (founder grants) - $0.001 per share
const NOMINAL_COST_BASIS_PER_SHARE = 0.1; // In cents ($0.001 = 0.1 cents)

// Test wallets - generate deterministic keypairs for testing
function generateTestWallet(seed: string): Keypair {
  const seedBytes = new Uint8Array(32);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(seed.padEnd(32, "0"));
  seedBytes.set(encoded.slice(0, 32));
  return Keypair.fromSeed(seedBytes);
}

// ============================================
// Standard Share Classes
// ============================================
const SHARE_CLASSES = {
  COM: { name: "Common", symbol: "COM", priority: 9, preference_multiple: 1 },
  S1X: { name: "Seed", symbol: "S1X", priority: 8, preference_multiple: 1 },
  A1X: { name: "Series A", symbol: "A1X", priority: 7, preference_multiple: 1 },
  B2X: { name: "Series B", symbol: "B2X", priority: 6, preference_multiple: 2 },
  C3X: { name: "Series C", symbol: "C3X", priority: 5, preference_multiple: 3 },
};

// ============================================
// Company Configurations
// ============================================

interface Shareholder {
  name: string;
  seed: string;
  shares: number;
  class: "COM" | "S1X" | "A1X" | "B2X" | "C3X";
  costBasis?: number; // in cents, undefined = use nominal for COM
  isOptionPool?: boolean;
  vesting?: {
    cliffSeconds: number;
    durationSeconds: number;
  };
}

interface FundingRound {
  name: string;
  type: "seed" | "series_a" | "series_b" | "series_c";
  raised: number; // cents
  preMoney: number; // cents
  shareClass: "S1X" | "A1X" | "B2X" | "C3X";
  investments: { name: string; seed: string; amount: number }[];
}

interface SafeNote {
  name: string;
  seed: string;
  principal: number; // cents
  cap: number; // cents
  discount: number; // 0.20 = 20%
  convertsAtRound: "seed" | "series_a";
}

interface CompanyConfig {
  symbol: string;
  name: string;
  description: string;
  stage: "early" | "grow" | "scale" | "trouble";

  // Shareholders who get shares directly (founders, employees, option pool)
  commonShareholders: Shareholder[];

  // Funding rounds in order
  fundingRounds: FundingRound[];

  // SAFEs that convert
  safes: SafeNote[];

  // Corporate actions
  hasDividend?: boolean;
  dividendPerShare?: number; // cents per share
}

// ============================================
// 1. FRSH - Freshly Inc (Early Stage)
// ============================================
const FRSH_CONFIG: CompanyConfig = {
  symbol: "FRSH",
  name: "Freshly Inc",
  description: "Early stage - Just closed seed round with SAFE conversions",
  stage: "early",

  commonShareholders: [
    { name: "Sarah Chen (CEO)", seed: "frsh-sarah-ceo", shares: 5_000_000, class: "COM" },
    { name: "Mike Torres (CTO)", seed: "frsh-mike-cto", shares: 3_000_000, class: "COM" },
    { name: "Option Pool", seed: "frsh-option-pool", shares: 2_000_000, class: "COM", isOptionPool: true },
  ],

  fundingRounds: [
    {
      name: "Seed Round",
      type: "seed",
      raised: 1_500_000_00, // $1.5M
      preMoney: 6_000_000_00, // $6M
      shareClass: "S1X",
      investments: [
        { name: "Rainfall Ventures", seed: "frsh-rainfall", amount: 1_000_000_00 },
        { name: "Tom Bradley", seed: "frsh-tom-angel", amount: 250_000_00 },
        // Lisa Park's $250K comes from SAFE conversion
      ],
    },
  ],

  safes: [
    {
      name: "Lisa Park",
      seed: "frsh-lisa-safe",
      principal: 250_000_00, // $250K
      cap: 4_000_000_00, // $4M cap
      discount: 0.20,
      convertsAtRound: "seed",
    },
  ],
};

// ============================================
// 2. GRWP - GrowthPath (Growth Stage)
// ============================================
const GRWP_CONFIG: CompanyConfig = {
  symbol: "GRWP",
  name: "GrowthPath",
  description: "Growth stage - Series A complete, healthy expansion",
  stage: "grow",

  commonShareholders: [
    { name: "James Liu (CEO)", seed: "grwp-james-ceo", shares: 4_000_000, class: "COM" },
    { name: "Rachel Kim (CTO)", seed: "grwp-rachel-cto", shares: 2_500_000, class: "COM" },
    { name: "David Okonkwo (COO)", seed: "grwp-david-coo", shares: 1_500_000, class: "COM" },
    { name: "Option Pool", seed: "grwp-option-pool", shares: 2_000_000, class: "COM", isOptionPool: true },
    // VP hires with vesting (3 minute cliff, 6 minute total for quick demo)
    {
      name: "VP Engineering",
      seed: "grwp-vp-eng",
      shares: 300_000,
      class: "COM",
      vesting: { cliffSeconds: 180, durationSeconds: 360 } // 3 min cliff, 6 min total
    },
    {
      name: "VP Sales",
      seed: "grwp-vp-sales",
      shares: 200_000,
      class: "COM",
      vesting: { cliffSeconds: 180, durationSeconds: 360 }
    },
  ],

  fundingRounds: [
    {
      name: "Seed Round",
      type: "seed",
      raised: 2_000_000_00, // $2M
      preMoney: 8_000_000_00, // $8M
      shareClass: "S1X",
      investments: [
        { name: "Sunrise Capital", seed: "grwp-sunrise-seed", amount: 1_000_000_00 },
        { name: "Angel Group LLC", seed: "grwp-angel-group", amount: 500_000_00 },
        { name: "Mark Stevens", seed: "grwp-mark-angel", amount: 250_000_00 },
        { name: "Nina Patel", seed: "grwp-nina-angel", amount: 250_000_00 },
      ],
    },
    {
      name: "Series A",
      type: "series_a",
      raised: 8_000_000_00, // $8M
      preMoney: 25_000_000_00, // $25M
      shareClass: "A1X",
      investments: [
        { name: "Sequoia Growth", seed: "grwp-sequoia", amount: 5_000_000_00 },
        { name: "First Round", seed: "grwp-first-round", amount: 2_000_000_00 },
        { name: "Sunrise Capital", seed: "grwp-sunrise-a", amount: 1_000_000_00 }, // Follow-on
      ],
    },
  ],

  safes: [],
};

// ============================================
// 3. SCFR - ScaleForce (Scale Stage)
// ============================================
const SCFR_CONFIG: CompanyConfig = {
  symbol: "SCFR",
  name: "ScaleForce",
  description: "Scale stage - Series B complete, mature cap table with dividends",
  stage: "scale",

  commonShareholders: [
    { name: "Emily Zhang (CEO)", seed: "scfr-emily-ceo", shares: 4_500_000, class: "COM" },
    { name: "Carlos Mendez (CTO)", seed: "scfr-carlos-cto", shares: 3_000_000, class: "COM" },
    { name: "Anna Thompson (CFO)", seed: "scfr-anna-cfo", shares: 1_200_000, class: "COM" },
    { name: "Option Pool", seed: "scfr-option-pool", shares: 2_200_000, class: "COM", isOptionPool: true },
    // Executive hires with vesting (1 hour cliff, 2 hour total for demo)
    {
      name: "VP Engineering",
      seed: "scfr-vp-eng",
      shares: 600_000,
      class: "COM",
      vesting: { cliffSeconds: 3600, durationSeconds: 7200 } // 1 hr cliff, 2 hr total
    },
    {
      name: "VP Sales",
      seed: "scfr-vp-sales",
      shares: 500_000,
      class: "COM",
      vesting: { cliffSeconds: 3600, durationSeconds: 7200 }
    },
  ],

  fundingRounds: [
    {
      name: "Seed Round",
      type: "seed",
      raised: 2_500_000_00, // $2.5M
      preMoney: 10_000_000_00, // $10M
      shareClass: "S1X",
      investments: [
        { name: "Horizon Seed Fund", seed: "scfr-horizon-seed", amount: 1_500_000_00 },
        { name: "Tech Angels", seed: "scfr-tech-angels", amount: 500_000_00 },
        { name: "Greg Morrison", seed: "scfr-greg-angel", amount: 300_000_00 },
        { name: "Jane Wu", seed: "scfr-jane-angel", amount: 200_000_00 },
      ],
    },
    {
      name: "Series A",
      type: "series_a",
      raised: 10_000_000_00, // $10M
      preMoney: 30_000_000_00, // $30M
      shareClass: "A1X",
      investments: [
        { name: "Accel Partners", seed: "scfr-accel-a", amount: 6_000_000_00 },
        { name: "Benchmark", seed: "scfr-benchmark-a", amount: 3_000_000_00 },
        { name: "Horizon Seed Fund", seed: "scfr-horizon-a", amount: 1_000_000_00 }, // Follow-on
      ],
    },
    {
      name: "Series B",
      type: "series_b",
      raised: 25_000_000_00, // $25M
      preMoney: 80_000_000_00, // $80M
      shareClass: "B2X",
      investments: [
        { name: "Andreessen Horowitz", seed: "scfr-a16z", amount: 15_000_000_00 },
        { name: "Tiger Global", seed: "scfr-tiger", amount: 5_000_000_00 },
        { name: "Accel Partners", seed: "scfr-accel-b", amount: 3_000_000_00 }, // Follow-on
        { name: "Benchmark", seed: "scfr-benchmark-b", amount: 2_000_000_00 }, // Follow-on
      ],
    },
  ],

  safes: [],

  // ScaleForce is profitable enough to distribute a dividend
  hasDividend: true,
  dividendPerShare: 5, // $0.05 per share
};

// ============================================
// 4. TBDG - TechBridge (Troubled - Down Round)
// ============================================
const TBDG_CONFIG: CompanyConfig = {
  symbol: "TBDG",
  name: "TechBridge",
  description: "Troubled - Series C rescue financing at lower valuation (DOWN ROUND)",
  stage: "trouble",

  commonShareholders: [
    { name: "Robert Hayes (CEO)", seed: "tbdg-robert-ceo", shares: 3_500_000, class: "COM" },
    { name: "Jennifer Walsh (CTO)", seed: "tbdg-jennifer-cto", shares: 2_500_000, class: "COM" },
    { name: "Michael Brown (COO)", seed: "tbdg-michael-coo", shares: 1_200_000, class: "COM" },
    { name: "VP Product", seed: "tbdg-vp-product", shares: 400_000, class: "COM" },
    { name: "VP Marketing", seed: "tbdg-vp-marketing", shares: 350_000, class: "COM" },
    { name: "Director Eng 1", seed: "tbdg-dir-eng-1", shares: 200_000, class: "COM" },
    { name: "Director Eng 2", seed: "tbdg-dir-eng-2", shares: 150_000, class: "COM" },
    { name: "Option Pool", seed: "tbdg-option-pool", shares: 1_700_000, class: "COM", isOptionPool: true },
  ],

  fundingRounds: [
    {
      name: "Seed Round",
      type: "seed",
      raised: 3_000_000_00, // $3M
      preMoney: 12_000_000_00, // $12M
      shareClass: "S1X",
      investments: [
        { name: "Foundry Group", seed: "tbdg-foundry-seed", amount: 1_800_000_00 },
        { name: "SV Angel", seed: "tbdg-sv-angel", amount: 600_000_00 },
        { name: "Peter Chen", seed: "tbdg-peter-angel", amount: 360_000_00 },
        { name: "Amy Rodriguez", seed: "tbdg-amy-angel", amount: 240_000_00 },
      ],
    },
    {
      name: "Series A",
      type: "series_a",
      raised: 12_000_000_00, // $12M
      preMoney: 40_000_000_00, // $40M
      shareClass: "A1X",
      investments: [
        { name: "Insight Partners", seed: "tbdg-insight-a", amount: 8_000_000_00 },
        { name: "Greylock", seed: "tbdg-greylock-a", amount: 3_000_000_00 },
        { name: "Foundry Group", seed: "tbdg-foundry-a", amount: 1_000_000_00 }, // Follow-on
      ],
    },
    {
      name: "Series B",
      type: "series_b",
      raised: 30_000_000_00, // $30M - Peak valuation
      preMoney: 100_000_000_00, // $100M
      shareClass: "B2X",
      investments: [
        { name: "SoftBank", seed: "tbdg-softbank-b", amount: 20_000_000_00 },
        { name: "Insight Partners", seed: "tbdg-insight-b", amount: 6_000_000_00 },
        { name: "Greylock", seed: "tbdg-greylock-b", amount: 4_000_000_00 },
      ],
    },
    {
      name: "Series C (Rescue)",
      type: "series_c",
      raised: 15_000_000_00, // $15M rescue
      preMoney: 60_000_000_00, // $60M - DOWN from $130M post-B!
      shareClass: "C3X", // 3x preference for rescue investors
      investments: [
        { name: "Rescue Capital", seed: "tbdg-rescue", amount: 12_000_000_00 },
        { name: "SoftBank", seed: "tbdg-softbank-c", amount: 2_000_000_00 }, // Defensive
        { name: "Insight Partners", seed: "tbdg-insight-c", amount: 1_000_000_00 }, // Defensive
      ],
    },
  ],

  safes: [],
};

// All companies
const COMPANIES: CompanyConfig[] = [FRSH_CONFIG, GRWP_CONFIG, SCFR_CONFIG, TBDG_CONFIG];

// ============================================
// Helper Functions
// ============================================

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getConfirmedSlot(connection: anchor.web3.Connection, signature: string): Promise<number> {
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  return tx?.slot || await connection.getSlot("confirmed");
}

async function createShareClass(tokenId: number, sc: typeof SHARE_CLASSES.COM): Promise<number | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/share-classes/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sc),
    });
    if (response.ok) {
      const created = await response.json();
      console.log(`      Created: ${sc.symbol} (Priority ${sc.priority}, ${sc.preference_multiple}x pref)`);
      return created.id;
    } else {
      const existing = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/share-classes/`);
      if (existing.ok) {
        const classes = await existing.json();
        const found = classes.find((c: any) => c.symbol === sc.symbol);
        if (found) return found.id;
      }
    }
  } catch (e) {
    console.error(`      Error creating ${sc.symbol}:`, e);
  }
  return null;
}

async function createFundingRound(
  tokenId: number,
  name: string,
  roundType: string,
  preMoney: number,
  shareClassId: number
): Promise<number | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds`, {
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
      return created.id;
    } else {
      const errorText = await response.text();
      console.error(`      Failed to create ${name}: ${response.status} - ${errorText.slice(0, 100)}`);
    }
  } catch (e) {
    console.error(`      Error creating round ${name}:`, e);
  }
  return null;
}

async function addInvestment(
  tokenId: number,
  roundId: number,
  investor: { name: string; seed: string; amount: number }
): Promise<{ shares: number } | null> {
  const wallet = generateTestWallet(investor.seed);
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/${roundId}/investments`, {
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
      const shares = created.shares_received || 0;
      console.log(`        ${investor.name}: $${(investor.amount / 100).toLocaleString()} → ${shares.toLocaleString()} shares`);
      return { shares };
    } else {
      const errorText = await response.text();
      console.error(`        Failed ${investor.name}: ${response.status} - ${errorText.slice(0, 100)}`);
    }
  } catch (e) {
    console.error(`        Error: ${investor.name}:`, e);
  }
  return null;
}

async function createAndConvertSafe(
  tokenId: number,
  safe: SafeNote,
  roundId: number
): Promise<void> {
  const wallet = generateTestWallet(safe.seed);
  try {
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
      console.log(`        Created SAFE: ${safe.name} ($${(safe.principal / 100).toLocaleString()} @ $${(safe.cap / 100).toLocaleString()} cap)`);

      const convertResponse = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/convertibles/${created.id}/convert/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funding_round_id: roundId }),
      });

      if (convertResponse.ok) {
        const result = await convertResponse.json();
        console.log(`          → Converted to ${result.shares_received?.toLocaleString() || 'N/A'} shares`);
      }
    }
  } catch (e) {
    console.error(`        Error with SAFE ${safe.name}:`, e);
  }
}

async function closeFundingRound(tokenId: number, roundId: number, roundName: string): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/funding-rounds/${roundId}/close/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (response.ok) {
      const result = await response.json();
      console.log(`      Closed: $${(result.amount_raised / 100).toLocaleString()} raised, ${result.shares_issued?.toLocaleString() || 0} shares`);
    }
  } catch (e) {
    console.error(`      Error closing ${roundName}:`, e);
  }
}

async function createVestingSchedule(
  tokenId: number,
  beneficiary: string,
  totalAmount: number,
  cliffSeconds: number,
  durationSeconds: number,
  shareClassId: number
): Promise<void> {
  const startTime = Math.floor(Date.now() / 1000);
  try {
    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/vesting/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        beneficiary,
        total_amount: totalAmount,
        start_time: startTime,
        cliff_seconds: cliffSeconds,
        duration_seconds: durationSeconds,
        vesting_type: "linear",
        revocable: true,
        share_class_id: shareClassId,
      }),
    });
    if (response.ok) {
      const cliffMin = Math.round(cliffSeconds / 60);
      const totalMin = Math.round(durationSeconds / 60);
      if (durationSeconds >= 3600) {
        const cliffHr = (cliffSeconds / 3600).toFixed(1);
        const totalHr = (durationSeconds / 3600).toFixed(1);
        console.log(`        Vesting: ${totalAmount.toLocaleString()} shares (${cliffHr}hr cliff, ${totalHr}hr total)`);
      } else {
        console.log(`        Vesting: ${totalAmount.toLocaleString()} shares (${cliffMin}min cliff, ${totalMin}min total)`);
      }
    }
  } catch (e) {
    console.error(`        Error creating vesting:`, e);
  }
}

async function createDividendRound(tokenId: number, amountPerShare: number): Promise<void> {
  try {
    // Get current state to calculate total
    const stateResponse = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/captable/state/latest`);
    if (!stateResponse.ok) return;

    const state = await stateResponse.json();
    const totalShares = Object.values(state.balances || {}).reduce((sum: number, b: any) => sum + (b as number), 0) as number;
    const totalPool = totalShares * amountPerShare;

    const response = await fetch(`${API_URL}/api/v1/tokens/${tokenId}/dividends/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_token: "USDC",
        total_pool: totalPool,
      }),
    });
    if (response.ok) {
      console.log(`      Dividend: $${(amountPerShare / 100).toFixed(4)}/share × ${totalShares.toLocaleString()} = $${(totalPool / 100).toLocaleString()}`);
    }
  } catch (e) {
    console.error(`      Error creating dividend:`, e);
  }
}

// ============================================
// Main Seed Function for a Company
// ============================================
async function seedCompany(
  provider: anchor.AnchorProvider,
  factoryProgram: Program,
  tokenProgram: Program,
  factoryPda: PublicKey,
  config: CompanyConfig
): Promise<void> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${config.symbol} - ${config.name}`);
  console.log(`  ${config.description}`);
  console.log(`${"═".repeat(70)}`);

  // Calculate initial supply (common shareholders only - preferred comes from rounds)
  const commonShares = config.commonShareholders.reduce((sum, s) => sum + s.shares, 0);

  // ========================================
  // STEP 1: Create token on-chain
  // ========================================
  console.log("\n  [1] Creating token on-chain...");

  let factory;
  try {
    factory = await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
  } catch (e) {
    console.error("      Factory not initialized!");
    return;
  }

  const mintKeypair = Keypair.generate();
  const mintAddress = mintKeypair.publicKey;
  const tokenCount = factory.tokenCount.toNumber();

  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config"), factoryPda.toBuffer(), new anchor.BN(tokenCount).toArrayLike(Buffer, "le", 8)],
    FACTORY_PROGRAM_ID
  );

  const [multisigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), tokenConfigPda.toBuffer()],
    FACTORY_PROGRAM_ID
  );

  try {
    await (factoryProgram.methods as any)
      .createToken({
        symbol: config.symbol,
        name: config.name,
        decimals: 0,
        initialSupply: new anchor.BN(commonShares),
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

    console.log(`      Token created: ${config.symbol}`);
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
    console.error(`      Error: ${e.message?.slice(0, 100)}`);
    return;
  }

  // ========================================
  // STEP 2: Sync to database
  // ========================================
  console.log("\n  [2] Syncing to database...");

  let tokenId: number;
  try {
    const tokenConfigData = await (factoryProgram.account as any).tokenConfig.fetch(tokenConfigPda);
    tokenId = tokenConfigData.tokenId.toNumber();

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
        total_supply: commonShares,
        features: {
          vesting_enabled: true,
          governance_enabled: true,
          dividends_enabled: true,
          transfer_restrictions_enabled: true,
        },
      }),
    });
    console.log(`      Token ID: ${tokenId}`);
  } catch (e) {
    console.error("      Error syncing to DB");
    return;
  }

  // ========================================
  // STEP 3: Create share classes
  // ========================================
  console.log("\n  [3] Creating share classes...");

  const shareClassIds: Record<string, number> = {};

  // Always create COM
  const comId = await createShareClass(tokenId, SHARE_CLASSES.COM);
  if (comId) shareClassIds["COM"] = comId;

  // Create based on funding rounds
  const roundTypes = config.fundingRounds.map(r => r.type);

  if (roundTypes.includes("seed")) {
    const id = await createShareClass(tokenId, SHARE_CLASSES.S1X);
    if (id) shareClassIds["S1X"] = id;
  }
  if (roundTypes.includes("series_a")) {
    const id = await createShareClass(tokenId, SHARE_CLASSES.A1X);
    if (id) shareClassIds["A1X"] = id;
  }
  if (roundTypes.includes("series_b")) {
    const id = await createShareClass(tokenId, SHARE_CLASSES.B2X);
    if (id) shareClassIds["B2X"] = id;
  }
  if (roundTypes.includes("series_c")) {
    const id = await createShareClass(tokenId, SHARE_CLASSES.C3X);
    if (id) shareClassIds["C3X"] = id;
  }

  // ========================================
  // STEP 4: Issue common shares to founders/employees
  // ========================================
  console.log("\n  [4] Issuing common shares...");

  const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority"), tokenConfigPda.toBuffer()],
    TOKEN_PROGRAM_ID
  );

  for (const shareholder of config.commonShareholders) {
    if (shareholder.vesting) continue; // Handle vesting separately

    const wallet = generateTestWallet(shareholder.seed);

    // Approve wallet
    const [allowlistPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("allowlist"), tokenConfigPda.toBuffer(), wallet.publicKey.toBuffer()],
      TOKEN_PROGRAM_ID
    );

    try {
      await (tokenProgram.methods as any)
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
    } catch (e) {}

    // Create ATA
    const recipientAta = getAssociatedTokenAddressSync(mintAddress, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
    try {
      const createAtaIx = createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey, recipientAta, wallet.publicKey, mintAddress, TOKEN_2022_PROGRAM_ID
      );
      const tx = new anchor.web3.Transaction().add(createAtaIx);
      await provider.sendAndConfirm(tx);
    } catch (e) {}

    // Mint shares
    try {
      await (tokenProgram.methods as any)
        .mintTokens(new anchor.BN(shareholder.shares))
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

      // Calculate cost basis - nominal for common shares
      const costBasis = shareholder.costBasis ?? Math.round(shareholder.shares * NOMINAL_COST_BASIS_PER_SHARE);

      const label = shareholder.isOptionPool ? "(Option Pool)" : "";
      console.log(`      ${shareholder.name} ${label}: ${shareholder.shares.toLocaleString()} COM shares`);

      // Record transaction
      const slot = await provider.connection.getSlot("confirmed");
      await fetch(`${API_URL}/api/v1/tokens/${tokenId}/transactions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_type: "share_grant",
          slot,
          wallet: wallet.publicKey.toString(),
          amount: shareholder.shares,
          share_class_id: shareClassIds["COM"],
          priority: SHARE_CLASSES.COM.priority,
          preference_multiple: SHARE_CLASSES.COM.preference_multiple,
          cost_basis: costBasis,
          triggered_by: "admin",
          notes: shareholder.isOptionPool
            ? `Option pool reservation: ${shareholder.shares.toLocaleString()} shares`
            : `Founder/employee grant: ${shareholder.shares.toLocaleString()} shares to ${shareholder.name}`,
        }),
      });
    } catch (e: any) {
      console.error(`      Error minting to ${shareholder.name}: ${e.message?.slice(0, 50)}`);
    }
  }

  // ========================================
  // STEP 5: Process funding rounds
  // ========================================
  console.log("\n  [5] Processing funding rounds...");

  for (const round of config.fundingRounds) {
    console.log(`\n    ${round.name} ($${(round.raised / 100).toLocaleString()} @ $${(round.preMoney / 100).toLocaleString()} pre):`);

    const shareClassId = shareClassIds[round.shareClass];
    if (!shareClassId) {
      console.error(`      Missing share class: ${round.shareClass}`);
      continue;
    }

    const roundId = await createFundingRound(tokenId, round.name, round.type, round.preMoney, shareClassId);
    if (!roundId) continue;

    // Process SAFEs that convert at this round
    const convertingSafes = config.safes.filter(s => s.convertsAtRound === round.type);
    if (convertingSafes.length > 0) {
      console.log("      SAFE Conversions:");
      for (const safe of convertingSafes) {
        await createAndConvertSafe(tokenId, safe, roundId);
      }
    }

    // Add direct investments
    console.log("      Investments:");
    for (const inv of round.investments) {
      await addInvestment(tokenId, roundId, inv);
    }

    // Close the round
    await closeFundingRound(tokenId, roundId, round.name);
  }

  // ========================================
  // STEP 6: Create vesting schedules
  // ========================================
  const vestingHolders = config.commonShareholders.filter(s => s.vesting);
  if (vestingHolders.length > 0) {
    console.log("\n  [6] Creating vesting schedules...");

    for (const holder of vestingHolders) {
      const wallet = generateTestWallet(holder.seed);
      console.log(`      ${holder.name}:`);

      await createVestingSchedule(
        tokenId,
        wallet.publicKey.toString(),
        holder.shares,
        holder.vesting!.cliffSeconds,
        holder.vesting!.durationSeconds,
        shareClassIds["COM"]
      );
    }
  }

  // ========================================
  // STEP 7: Dividend distribution (if applicable)
  // ========================================
  if (config.hasDividend && config.dividendPerShare) {
    console.log("\n  [7] Creating dividend distribution...");
    await createDividendRound(tokenId, config.dividendPerShare);
  }

  console.log(`\n  ✓ ${config.symbol} complete!`);
}

// ============================================
// Main Entry Point
// ============================================
async function main() {
  console.log("\n" + "═".repeat(70));
  console.log("  ChainEquity Demo Data Seeder");
  console.log("═".repeat(70));
  console.log("\nCreating 4 realistic cap tables:\n");
  console.log("  FRSH - Freshly Inc       | Early  | Seed stage with SAFE conversions");
  console.log("  GRWP - GrowthPath        | Grow   | Series A, vesting (minutes)");
  console.log("  SCFR - ScaleForce        | Scale  | Series B, vesting (hours), dividends");
  console.log("  TBDG - TechBridge        | Trouble| Series C DOWN ROUND (3x pref rescue)");
  console.log("\nShare Class Reference:");
  console.log("  COM  - Common      (Priority 9, 1x pref)");
  console.log("  S1X  - Seed        (Priority 8, 1x pref)");
  console.log("  A1X  - Series A    (Priority 7, 1x pref)");
  console.log("  B2X  - Series B    (Priority 6, 2x pref)");
  console.log("  C3X  - Series C    (Priority 5, 3x pref) - Rescue financing");

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

  // Check factory
  try {
    await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
  } catch (e) {
    console.error("\nFactory not initialized. Run 'anchor run init-factory' first.");
    process.exit(1);
  }

  // Seed each company
  for (const company of COMPANIES) {
    await seedCompany(provider, factoryProgram, tokenProgram, factoryPda, company);
    await sleep(1000);
  }

  // Final summary
  console.log("\n" + "═".repeat(70));
  console.log("  SEEDING COMPLETE");
  console.log("═".repeat(70));
  console.log("\nCompanies created:");
  console.log("  ┌─────────┬──────────────────────┬─────────┬──────────────────────┐");
  console.log("  │ Ticker  │ Name                 │ Stage   │ Rounds               │");
  console.log("  ├─────────┼──────────────────────┼─────────┼──────────────────────┤");
  for (const c of COMPANIES) {
    const rounds = c.fundingRounds.map(r => r.type.replace("series_", "").toUpperCase()).join(", ");
    console.log(`  │ ${c.symbol.padEnd(7)} │ ${c.name.padEnd(20)} │ ${c.stage.padEnd(7)} │ ${rounds.padEnd(20)} │`);
  }
  console.log("  └─────────┴──────────────────────┴─────────┴──────────────────────┘");

  console.log("\nFeatures by company:");
  console.log("  • FRSH: SAFE conversion at seed");
  console.log("  • GRWP: Vesting schedules (3 min cliff / 6 min total) - watch it vest!");
  console.log("  • SCFR: Vesting (1hr/2hr) + Dividend distribution");
  console.log("  • TBDG: DOWN ROUND - Series C at $60M vs $130M post-B (3x pref rescue)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
