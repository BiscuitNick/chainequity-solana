/**
 * Sync on-chain token data to the database
 * Run with: ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/sync-token-to-db.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Program IDs
const FACTORY_PROGRAM_ID = new PublicKey("3Jui9FBBhqbbxE9s83fcUya1xrG9kpUZS1pTBAcWohbE");
const TOKEN_PROGRAM_ID = new PublicKey("TxPUnQaa9MWhTdTURSZEieS6BKmpYiU4c3GtYKV3Kq2");

// Factory and Token IDLs
const factoryIdl = require("../target/idl/chainequity_factory.json");
const tokenIdl = require("../target/idl/chainequity_token.json");

async function main() {
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const factoryProgram = new Program(factoryIdl, provider);
  const tokenProgram = new Program(tokenIdl, provider);

  // Get factory PDA
  const [factoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory")],
    FACTORY_PROGRAM_ID
  );

  console.log("Factory PDA:", factoryPda.toBase58());

  // Fetch factory state
  const factoryState = await factoryProgram.account.factory.fetch(factoryPda);
  console.log("\nFactory State:");
  console.log("  Token Count:", factoryState.tokenCount.toString());

  // Fetch all token configs
  const tokenConfigs = await tokenProgram.account.tokenConfig.all();

  console.log(`\nFound ${tokenConfigs.length} tokens on-chain:\n`);

  const tokens = [];
  for (const config of tokenConfigs) {
    const data = config.account;
    const token = {
      token_id: data.tokenId.toNumber(),
      on_chain_config: config.publicKey.toBase58(),
      mint_address: data.mint.toBase58(),
      symbol: data.symbol,
      name: data.name,
      decimals: data.decimals,
      total_supply: data.totalSupply.toString(),
      features: {
        vesting_enabled: data.features.vestingEnabled,
        governance_enabled: data.features.governanceEnabled,
        dividends_enabled: data.features.dividendsEnabled,
        transfer_restrictions_enabled: data.features.transferRestrictionsEnabled,
        upgradeable: data.features.upgradeable,
      },
      is_paused: data.paused,
      created_at: new Date().toISOString(),
    };

    tokens.push(token);

    console.log(`Token #${token.token_id}:`);
    console.log(`  Name: ${token.name}`);
    console.log(`  Symbol: ${token.symbol}`);
    console.log(`  Mint: ${token.mint_address}`);
    console.log(`  Config: ${token.on_chain_config}`);
    console.log(`  Supply: ${token.total_supply}`);
    console.log(`  Decimals: ${token.decimals}`);
    console.log(`  Features:`, token.features);
    console.log();
  }

  // Now insert into database via API
  const apiUrl = process.env.API_URL || "http://localhost:8001";

  for (const token of tokens) {
    try {
      // Try to sync to database via a custom endpoint
      const response = await fetch(`${apiUrl}/api/v1/sync/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token),
      });

      if (response.ok) {
        console.log(`Synced token ${token.symbol} to database`);
      } else {
        console.log(`Sync endpoint not available - printing SQL instead:`);
        console.log(`
INSERT INTO tokens (token_id, on_chain_config, mint_address, symbol, name, decimals, total_supply, features, is_paused, created_at)
VALUES (${token.token_id}, '${token.on_chain_config}', '${token.mint_address}', '${token.symbol}', '${token.name}', ${token.decimals}, ${token.total_supply}, '${JSON.stringify(token.features)}', ${token.is_paused}, NOW())
ON CONFLICT (token_id) DO UPDATE SET
  total_supply = EXCLUDED.total_supply,
  is_paused = EXCLUDED.is_paused;
        `);
      }
    } catch (e) {
      // API not available, just output JSON
      console.log("\nToken data (JSON):");
      console.log(JSON.stringify(tokens, null, 2));
    }
  }

  console.log("\n--- Done ---");
}

main().catch(console.error);
