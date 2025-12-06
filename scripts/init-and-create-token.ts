// @ts-nocheck
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Load IDL files
const factoryIdl = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../target/idl/chainequity_factory.json"),
    "utf8"
  )
);

// Program IDs from Anchor.toml localnet
const FACTORY_PROGRAM_ID = new PublicKey("3Jui9FBBhqbbxE9s83fcUya1xrG9kpUZS1pTBAcWohbE");

async function main() {
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log("Wallet:", provider.wallet.publicKey.toString());
  console.log("Cluster:", provider.connection.rpcEndpoint);

  // Create program instance
  const factoryProgram = new Program(factoryIdl, provider);

  // Derive Factory PDA
  const [factoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory")],
    FACTORY_PROGRAM_ID
  );
  console.log("\nFactory PDA:", factoryPda.toString());

  // Check if factory is already initialized
  let factoryExists = false;
  try {
    const existingFactory = await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
    console.log("\nFactory already initialized!");
    console.log("  Authority:", existingFactory.authority.toString());
    console.log("  Token Count:", existingFactory.tokenCount.toString());
    console.log("  Creation Fee:", existingFactory.creationFee.toString());
    console.log("  Paused:", existingFactory.paused);
    factoryExists = true;
  } catch (e) {
    // Factory not initialized, let's initialize it
    console.log("\nInitializing Factory...");

    try {
      const tx = await (factoryProgram.methods as any)
        .initializeFactory(new anchor.BN(0)) // 0 creation fee for testing
        .accounts({
          factory: factoryPda,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Factory initialized! Tx:", tx);

      // Fetch and display factory state
      const factory = await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
      console.log("\nFactory State:");
      console.log("  Authority:", factory.authority.toString());
      console.log("  Token Count:", factory.tokenCount.toString());
      console.log("  Creation Fee:", factory.creationFee.toString());
      console.log("  Paused:", factory.paused);
      factoryExists = true;
    } catch (initError: any) {
      console.error("Error initializing factory:", initError);
      if (initError.logs) {
        console.log("\nTransaction logs:");
        initError.logs.forEach((log: string) => console.log("  ", log));
      }
      throw initError;
    }
  }

  if (!factoryExists) {
    console.log("Factory initialization failed, cannot create token");
    return;
  }

  // Now let's create a token
  console.log("\n--- Creating Security Token ---");

  // Generate a mint keypair
  const mintKeypair = Keypair.generate();
  console.log("Mint Address:", mintKeypair.publicKey.toString());

  // Get current factory token count to derive correct PDA
  const currentFactory = await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
  const tokenCount = currentFactory.tokenCount;

  // Derive Token Config PDA using factory and token_count
  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_config"),
      factoryPda.toBuffer(),
      new anchor.BN(tokenCount).toArrayLike(Buffer, "le", 8)
    ],
    FACTORY_PROGRAM_ID
  );
  console.log("Token Config PDA:", tokenConfigPda.toString());

  // Derive MultiSig PDA
  const [multisigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), tokenConfigPda.toBuffer()],
    FACTORY_PROGRAM_ID
  );
  console.log("MultiSig PDA:", multisigPda.toString());

  // Token creation parameters (matching Rust CreateTokenParams struct exactly)
  const createTokenParams = {
    symbol: "ACME",
    name: "Acme Corporation",
    decimals: 6,
    initialSupply: new anchor.BN(1_000_000_000_000), // 1 million tokens with 6 decimals
    features: {
      vestingEnabled: true,
      governanceEnabled: true,
      dividendsEnabled: true,
      transferRestrictionsEnabled: true,
      upgradeable: false,
    },
    adminSigners: [provider.wallet.publicKey], // Single signer for simplicity
    adminThreshold: 1,
    templateId: null, // Optional template
  };

  try {
    const createTx = await (factoryProgram.methods as any)
      .createToken(createTokenParams)
      .accounts({
        factory: factoryPda,
        tokenConfig: tokenConfigPda,
        multisig: multisigPda,
        mint: mintKeypair.publicKey,
        authority: provider.wallet.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("\nToken created! Tx:", createTx);

    // Fetch token config
    const tokenConfig = await (factoryProgram.account as any).tokenConfig.fetch(tokenConfigPda);
    console.log("\nToken Config:");
    console.log("  Name:", tokenConfig.name);
    console.log("  Symbol:", tokenConfig.symbol);
    console.log("  Decimals:", tokenConfig.decimals);
    console.log("  Total Supply:", tokenConfig.totalSupply.toString());
    console.log("  Mint:", tokenConfig.mint.toString());
    console.log("  Authority:", tokenConfig.authority.toString());
    console.log("  Features:", JSON.stringify(tokenConfig.features, null, 2));

    // Update factory state
    const updatedFactory = await (factoryProgram.account as any).tokenFactory.fetch(factoryPda);
    console.log("\nUpdated Factory Token Count:", updatedFactory.tokenCount.toString());

  } catch (createError: any) {
    console.error("Error creating token:", createError);
    if (createError.logs) {
      console.log("\nTransaction logs:");
      createError.logs.forEach((log: string) => console.log("  ", log));
    }
  }

  console.log("\n--- Done ---");
}

main().catch(console.error);
