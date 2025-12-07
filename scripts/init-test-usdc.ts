// @ts-nocheck
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Load IDL
const testUsdcIdl = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../target/idl/test_usdc.json"),
    "utf8"
  )
);

const TEST_USDC_PROGRAM_ID = new PublicKey("28JkLhzXCQme5fFrAqoWwyJxSNiv71CMQcS5x4xCtqoX");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log("Wallet:", provider.wallet.publicKey.toString());
  console.log("Cluster:", provider.connection.rpcEndpoint);

  const testUsdcProgram = new Program(testUsdcIdl, provider);

  // Generate a new mint keypair (or load existing one)
  const mintKeypairPath = path.join(__dirname, "../test-usdc-mint.json");
  let mintKeypair: Keypair;

  if (fs.existsSync(mintKeypairPath)) {
    const mintSecret = JSON.parse(fs.readFileSync(mintKeypairPath, "utf8"));
    mintKeypair = Keypair.fromSecretKey(Uint8Array.from(mintSecret));
    console.log("\nLoaded existing TestUSDC mint:", mintKeypair.publicKey.toString());
  } else {
    mintKeypair = Keypair.generate();
    fs.writeFileSync(mintKeypairPath, JSON.stringify(Array.from(mintKeypair.secretKey)));
    console.log("\nGenerated new TestUSDC mint:", mintKeypair.publicKey.toString());
  }

  // Derive mint authority PDA
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("test_usdc_authority")],
    TEST_USDC_PROGRAM_ID
  );
  console.log("Mint Authority PDA:", mintAuthority.toString());

  // Check if mint already exists
  const mintInfo = await provider.connection.getAccountInfo(mintKeypair.publicKey);

  if (!mintInfo) {
    console.log("\nInitializing TestUSDC mint...");

    try {
      const tx = await (testUsdcProgram.methods as any)
        .initialize()
        .accounts({
          mint: mintKeypair.publicKey,
          mintAuthority: mintAuthority,
          payer: provider.wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      console.log("TestUSDC initialized! Tx:", tx);
    } catch (e: any) {
      console.error("Error initializing:", e.message);
      if (e.logs) {
        e.logs.forEach((log: string) => console.log("  ", log));
      }
      return;
    }
  } else {
    console.log("\nTestUSDC mint already exists!");
  }

  // Get or create associated token account for the wallet
  const ata = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    provider.wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("\nYour TestUSDC Token Account:", ata.toString());

  const ataInfo = await provider.connection.getAccountInfo(ata);
  if (!ataInfo) {
    console.log("Creating associated token account...");
    const createAtaIx = createAssociatedTokenAccountInstruction(
      provider.wallet.publicKey,
      ata,
      provider.wallet.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    const tx = new anchor.web3.Transaction().add(createAtaIx);
    await provider.sendAndConfirm(tx);
    console.log("Token account created!");
  }

  // Mint some tokens
  const mintAmount = 1_000_000_000_000; // 1 million USDC (6 decimals)
  console.log(`\nMinting ${mintAmount / 1_000_000} TestUSDC...`);

  try {
    const tx = await (testUsdcProgram.methods as any)
      .mint(new anchor.BN(mintAmount))
      .accounts({
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthority,
        tokenAccount: ata,
        recipient: provider.wallet.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("Minted! Tx:", tx);
  } catch (e: any) {
    console.error("Error minting:", e.message);
    if (e.logs) {
      e.logs.forEach((log: string) => console.log("  ", log));
    }
  }

  // Check balance
  const balance = await provider.connection.getTokenAccountBalance(ata);
  console.log("\nYour TestUSDC Balance:", balance.value.uiAmount);

  console.log("\n========================================");
  console.log("TESTUSDC MINT ADDRESS (use this for dividends):");
  console.log(mintKeypair.publicKey.toString());
  console.log("========================================");
}

main().catch(console.error);
