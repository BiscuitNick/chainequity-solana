// @ts-nocheck
/**
 * Create a new security token on ChainEquity
 *
 * Usage:
 *   npx ts-node scripts/create-token.ts --symbol TICKER --name "Company Name" --supply 1000000
 *
 * Options:
 *   --symbol        Token symbol/ticker (required, max 10 chars)
 *   --name          Token name (required, max 50 chars)
 *   --supply        Initial supply (required, in whole tokens)
 *   --decimals      Token decimals (default: 6)
 *   --no-vesting    Disable vesting feature
 *   --no-governance Disable governance feature
 *   --no-dividends  Disable dividends feature
 *   --no-transfer-restrictions  Disable transfer restrictions
 *   --upgradeable   Make token upgradeable
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Parse command line arguments
function parseArgs(): {
  symbol: string;
  name: string;
  supply: number;
  decimals: number;
  vestingEnabled: boolean;
  governanceEnabled: boolean;
  dividendsEnabled: boolean;
  transferRestrictionsEnabled: boolean;
  upgradeable: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    symbol: "",
    name: "",
    supply: 0,
    decimals: 6,
    vestingEnabled: true,
    governanceEnabled: true,
    dividendsEnabled: true,
    transferRestrictionsEnabled: true,
    upgradeable: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--symbol":
        result.symbol = args[++i]?.toUpperCase() || "";
        break;
      case "--name":
        result.name = args[++i] || "";
        break;
      case "--supply":
        result.supply = parseInt(args[++i] || "0", 10);
        break;
      case "--decimals":
        result.decimals = parseInt(args[++i] || "6", 10);
        break;
      case "--no-vesting":
        result.vestingEnabled = false;
        break;
      case "--no-governance":
        result.governanceEnabled = false;
        break;
      case "--no-dividends":
        result.dividendsEnabled = false;
        break;
      case "--no-transfer-restrictions":
        result.transferRestrictionsEnabled = false;
        break;
      case "--upgradeable":
        result.upgradeable = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
    }
  }

  // Validation
  if (!result.symbol) {
    console.error("Error: --symbol is required");
    printUsage();
    process.exit(1);
  }
  if (result.symbol.length > 10) {
    console.error("Error: symbol must be 10 characters or less");
    process.exit(1);
  }
  if (!result.name) {
    console.error("Error: --name is required");
    printUsage();
    process.exit(1);
  }
  if (result.name.length > 50) {
    console.error("Error: name must be 50 characters or less");
    process.exit(1);
  }
  if (!result.supply || result.supply <= 0) {
    console.error("Error: --supply must be a positive number");
    printUsage();
    process.exit(1);
  }
  if (result.decimals < 0 || result.decimals > 18) {
    console.error("Error: decimals must be between 0 and 18");
    process.exit(1);
  }

  return result;
}

function printUsage() {
  console.log(`
Usage: npx ts-node scripts/create-token.ts [options]

Required:
  --symbol TICKER      Token symbol (max 10 chars, e.g., ACME)
  --name "Name"        Token name (max 50 chars, e.g., "Acme Corporation")
  --supply NUMBER      Initial supply in whole tokens (e.g., 1000000)

Optional:
  --decimals NUMBER    Token decimals (default: 6)
  --no-vesting         Disable vesting feature
  --no-governance      Disable governance feature
  --no-dividends       Disable dividends feature
  --no-transfer-restrictions  Disable transfer restrictions
  --upgradeable        Make token upgradeable (default: false)

Examples:
  # Create a basic token with 1 million supply
  anchor run create-token -- --symbol ACME --name "Acme Corp" --supply 1000000

  # Create token with custom decimals and no governance
  anchor run create-token -- --symbol TEST --name "Test Token" --supply 500000 --decimals 8 --no-governance
`);
}

// Load IDL files
const factoryIdl = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../target/idl/chainequity_factory.json"),
    "utf8"
  )
);

// Program IDs from Anchor.toml localnet
const FACTORY_PROGRAM_ID = new PublicKey("S7psPXnjCLjqdhoWXVG78nniuCfGPwQaciq7TUZEL2p");

async function main() {
  const config = parseArgs();

  console.log("\n=== ChainEquity Token Creator ===\n");
  console.log("Token Configuration:");
  console.log(`  Symbol:       ${config.symbol}`);
  console.log(`  Name:         ${config.name}`);
  console.log(`  Supply:       ${config.supply.toLocaleString()}`);
  console.log(`  Decimals:     ${config.decimals}`);
  console.log(`  Features:`);
  console.log(`    - Vesting:              ${config.vestingEnabled ? "✓" : "✗"}`);
  console.log(`    - Governance:           ${config.governanceEnabled ? "✓" : "✗"}`);
  console.log(`    - Dividends:            ${config.dividendsEnabled ? "✓" : "✗"}`);
  console.log(`    - Transfer Restrictions: ${config.transferRestrictionsEnabled ? "✓" : "✗"}`);
  console.log(`    - Upgradeable:          ${config.upgradeable ? "✓" : "✗"}`);

  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log(`\nWallet: ${provider.wallet.publicKey.toString()}`);
  console.log(`Cluster: ${provider.connection.rpcEndpoint}`);

  // Create program instance
  const factoryProgram = new Program(factoryIdl, provider);

  // Derive Factory PDA
  const [factoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory")],
    FACTORY_PROGRAM_ID
  );

  // Check if factory exists
  let factory;
  try {
    factory = await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
    console.log(`\nFactory found (${factory.tokenCount.toString()} tokens created)`);
  } catch (e) {
    console.error("\nError: Factory not initialized. Run 'anchor run init-factory' first.");
    process.exit(1);
  }

  // Generate a mint keypair
  const mintKeypair = Keypair.generate();
  console.log(`\nMint Address: ${mintKeypair.publicKey.toString()}`);

  // Derive Token Config PDA
  const tokenCount = factory.tokenCount;
  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_config"),
      factoryPda.toBuffer(),
      new anchor.BN(tokenCount).toArrayLike(Buffer, "le", 8)
    ],
    FACTORY_PROGRAM_ID
  );
  console.log(`Token Config PDA: ${tokenConfigPda.toString()}`);

  // Derive MultiSig PDA
  const [multisigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), tokenConfigPda.toBuffer()],
    FACTORY_PROGRAM_ID
  );

  // Check if symbol already exists by querying existing token configs
  console.log(`\nChecking for duplicate symbols...`);
  for (let i = 0; i < tokenCount.toNumber(); i++) {
    const [existingTokenConfigPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("token_config"),
        factoryPda.toBuffer(),
        new anchor.BN(i).toArrayLike(Buffer, "le", 8)
      ],
      FACTORY_PROGRAM_ID
    );
    try {
      const existingConfig = await (factoryProgram.account as any).tokenConfig.fetch(existingTokenConfigPda);
      if (existingConfig.symbol.toUpperCase() === config.symbol.toUpperCase()) {
        console.error(`\n✗ Error: Symbol "${config.symbol}" is already taken!`);
        console.log(`  Existing token: ${existingConfig.name} (mint: ${existingConfig.mint.toString()})`);
        console.log(`  Please choose a different ticker.`);
        process.exit(1);
      }
    } catch (e) {
      // Token config doesn't exist or error fetching, continue
    }
  }
  console.log(`Symbol "${config.symbol}" is available.`);

  // Calculate supply with decimals
  const supplyWithDecimals = new anchor.BN(config.supply).mul(
    new anchor.BN(10).pow(new anchor.BN(config.decimals))
  );

  // Token creation parameters
  const createTokenParams = {
    symbol: config.symbol,
    name: config.name,
    decimals: config.decimals,
    initialSupply: supplyWithDecimals,
    features: {
      vestingEnabled: config.vestingEnabled,
      governanceEnabled: config.governanceEnabled,
      dividendsEnabled: config.dividendsEnabled,
      transferRestrictionsEnabled: config.transferRestrictionsEnabled,
      upgradeable: config.upgradeable,
    },
    adminSigners: [provider.wallet.publicKey],
    adminThreshold: 1,
    templateId: null,
  };

  console.log("\nCreating token...");

  try {
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

    console.log(`\n✓ Token created successfully!`);
    console.log(`  Transaction: ${createTx}`);

    // Fetch and display token config
    const tokenConfig = await (factoryProgram.account as any).tokenConfig.fetch(tokenConfigPda);
    console.log(`\nToken Details:`);
    console.log(`  Token ID:     ${tokenConfig.tokenId?.toString() || tokenCount.toString()}`);
    console.log(`  Symbol:       ${tokenConfig.symbol}`);
    console.log(`  Name:         ${tokenConfig.name}`);
    console.log(`  Decimals:     ${tokenConfig.decimals}`);
    console.log(`  Total Supply: ${(parseInt(tokenConfig.totalSupply.toString()) / Math.pow(10, config.decimals)).toLocaleString()}`);
    console.log(`  Mint:         ${tokenConfig.mint.toString()}`);

    console.log(`\n💡 The token will be automatically synced to the database on the next backend sync.`);
    console.log(`   Or trigger a manual sync: curl -X POST http://localhost:8001/api/v1/sync/tokens`);

  } catch (createError: any) {
    console.error("\n✗ Error creating token:", createError.message || createError);
    if (createError.logs) {
      console.log("\nTransaction logs:");
      createError.logs.forEach((log: string) => console.log("  ", log));
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
