import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  getAssociatedTokenAddress,
  createSyncNativeInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import bs58 from "bs58";

// Devnet RPC URL - can be overridden via environment variable
const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");

// Singleton connection instance
let connectionInstance: Connection | null = null;

/**
 * Get or create a Solana connection to devnet
 */
export function getConnection(): Connection {
  if (!connectionInstance) {
    connectionInstance = new Connection(RPC_URL, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
    });
  }
  return connectionInstance;
}

/**
 * Load wallet keypair from environment variable (base58 encoded private key)
 */
export function loadWallet(): Keypair {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "WALLET_PRIVATE_KEY environment variable is required. Provide a base58-encoded private key."
    );
  }
  try {
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(decoded);
  } catch (err) {
    throw new Error(`Failed to decode wallet private key: ${err}`);
  }
}

/**
 * Get wallet public key without loading full keypair (for read-only operations)
 */
export function getWalletPublicKey(): PublicKey {
  return loadWallet().publicKey;
}

/**
 * Get the wrapped SOL (WSOL) mint address
 */
export function getWrappedSolMint(): PublicKey {
  return NATIVE_MINT;
}

/**
 * Check if a mint is native SOL (wrapped SOL)
 */
export function isNativeSol(mint: PublicKey | string): boolean {
  const mintPubkey = typeof mint === "string" ? new PublicKey(mint) : mint;
  return mintPubkey.equals(NATIVE_MINT);
}

/**
 * Get or create associated token account for a given mint
 */
export async function getOrCreateATA(
  owner: PublicKey,
  mint: PublicKey
): Promise<{
  address: PublicKey;
  instruction: ReturnType<
    typeof createAssociatedTokenAccountInstruction
  > | null;
}> {
  const connection = getConnection();
  const ata = await getAssociatedTokenAddress(mint, owner);

  try {
    await getAccount(connection, ata);
    return { address: ata, instruction: null };
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      const instruction = createAssociatedTokenAccountInstruction(
        owner,
        ata,
        owner,
        mint
      );
      return { address: ata, instruction };
    }
    throw error;
  }
}

/**
 * Create instruction to sync native SOL balance in wrapped SOL account
 */
export function createSyncNativeIx(wrappedSolAccount: PublicKey) {
  return createSyncNativeInstruction(wrappedSolAccount);
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Request airdrop on devnet (for testing)
 */
export async function requestAirdrop(
  address: PublicKey,
  amountSol: number = 1
): Promise<string> {
  const connection = getConnection();
  const signature = await connection.requestAirdrop(
    address,
    solToLamports(amountSol)
  );
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

/**
 * Get SOL balance for an address
 */
export async function getSolBalance(address: PublicKey): Promise<number> {
  const connection = getConnection();
  const balance = await connection.getBalance(address);
  return lamportsToSol(balance);
}

// Well-known devnet token mints for testing
export const DEVNET_TOKENS = {
  SOL: NATIVE_MINT.toBase58(),
  // Common devnet test tokens - these may vary
  USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Example devnet USDC
  USDT: "EJwZgeZrdC8TXTQbQBoL6bfuAnFUQMSZrhnDS6SUVGjP", // Example devnet USDT
} as const;
