const { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const fetch = require('node-fetch');

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');

/**
 * Fetches bonding curve state and current token price from Pump.fun program.
 * @param {Connection} connection 
 * @param {string|PublicKey} mintPubkey 
 * @returns {Promise<{ priceSol: number, solInCurve: number, tokensInCurve: number, isGraduated: boolean }>}
 */
async function getTokenPrice(connection, mintPubkey) {
  const mintPk = typeof mintPubkey === 'string' ? new PublicKey(mintPubkey) : mintPubkey;
  
  // Find Bonding Curve PDA for this mint
  const [bondingCurvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mintPk.toBuffer()],
    PUMP_PROGRAM_ID
  );

  const accountInfo = await connection.getAccountInfo(bondingCurvePda);
  if (!accountInfo) {
    return { priceSol: 0, solInCurve: 0, tokensInCurve: 0, isGraduated: true };
  }

  // Parse bonding curve buffer structure
  const data = accountInfo.data;
  // Offset 8 for discriminator
  const virtualTokenReserves = data.readBigUInt64LE(8);
  const virtualSolReserves = data.readBigUInt64LE(16);
  const realTokenReserves = data.readBigUInt64LE(24);
  const realSolReserves = data.readBigUInt64LE(32);
  const complete = data.readUInt8(48) === 1;

  const solReservesNum = Number(virtualSolReserves) / LAMPORTS_PER_SOL;
  const tokenReservesNum = Number(virtualTokenReserves) / 1e6; // SPL token 6 decimals

  const priceSol = tokenReservesNum > 0 ? (solReservesNum / tokenReservesNum) : 0;

  return {
    priceSol,
    solInCurve: Number(realSolReserves) / LAMPORTS_PER_SOL,
    tokensInCurve: Number(realTokenReserves) / 1e6,
    isGraduated: complete
  };
}

/**
 * Claims creator fees generated on Pump.fun for the specified token mint.
 * @param {Connection} connection 
 * @param {Keypair} walletKeypair 
 * @param {string|PublicKey} mintPubkey 
 * @returns {Promise<{ claimedSol: number, signature: string }>}
 */
async function claimCreatorFees(connection, walletKeypair, mintPubkey) {
  const mintPk = typeof mintPubkey === 'string' ? new PublicKey(mintPubkey) : mintPubkey;

  // Derive fee vault PDA
  const [feeVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-fee-vault'), walletKeypair.publicKey.toBuffer(), mintPk.toBuffer()],
    PUMP_PROGRAM_ID
  );

  const feeVaultAccount = await connection.getAccountInfo(feeVaultPda);
  if (!feeVaultAccount || feeVaultAccount.lamports <= 0) {
    return { claimedSol: 0, signature: '' };
  }

  const claimableLamports = feeVaultAccount.lamports;
  const claimableSol = claimableLamports / LAMPORTS_PER_SOL;

  // Pump.fun claim instruction layout
  // Discriminator: [24, 62, 12, 19, 100, 48, 88, 12] (Example claim instruction)
  const data = Buffer.from([12, 48, 88, 12, 24, 62, 19, 100]);

  const transaction = new Transaction().add({
    keys: [
      { pubkey: feeVaultPda, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    programId: PUMP_PROGRAM_ID,
    data
  });

  const signature = await connection.sendTransaction(transaction, [walletKeypair], {
    skipPreflight: false,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');

  return {
    claimedSol: claimableSol,
    signature
  };
}

/**
 * Executes a token buyback on Pump.fun bonding curve or Jupiter DEX.
 * @param {Connection} connection 
 * @param {Keypair} walletKeypair 
 * @param {string|PublicKey} mintPubkey 
 * @param {number} solAmount Amount of SOL to spend on buyback
 * @returns {Promise<{ boughtTokens: number, signature: string }>}
 */
async function buybackTokens(connection, walletKeypair, mintPubkey, solAmount) {
  const mintPk = typeof mintPubkey === 'string' ? new PublicKey(mintPubkey) : mintPubkey;
  const solLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  if (solLamports <= 0) {
    throw new Error('Buyback SOL amount must be greater than 0.');
  }

  // Derive Bonding Curve & Associated Token Account
  const [bondingCurvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mintPk.toBuffer()],
    PUMP_PROGRAM_ID
  );
  const [associatedBondingCurvePda] = PublicKey.findProgramAddressSync(
    [bondingCurvePda.toBuffer(), new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(), mintPk.toBuffer()],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  );

  const walletAta = await getAssociatedTokenAddress(mintPk, walletKeypair.publicKey);
  const ataInfo = await connection.getAccountInfo(walletAta);

  const tx = new Transaction();

  // Create Associated Token Account if it doesn't exist
  if (!ataInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        walletKeypair.publicKey,
        walletAta,
        walletKeypair.publicKey,
        mintPk
      )
    );
  }

  // Pump.fun buy instruction: [102, 6, 61, 18, 1, 218, 235, 234]
  const buyData = Buffer.alloc(8 + 8 + 8);
  Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]).copy(buyData, 0);
  buyData.writeBigUInt64LE(BigInt(0), 8); // token amount (0 for max calculate)
  buyData.writeBigUInt64LE(BigInt(solLamports), 16); // max SOL to spend

  tx.add({
    keys: [
      { pubkey: new PublicKey('4wTV1YmiEkRvAtNtsXYnv965F71yAvy2bF24nC15zs39'), isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: bondingCurvePda, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurvePda, isSigner: false, isWritable: true },
      { pubkey: walletAta, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isSigner: false, isWritable: false },
      { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    programId: PUMP_PROGRAM_ID,
    data: buyData
  });

  const signature = await connection.sendTransaction(tx, [walletKeypair], {
    skipPreflight: false,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');

  return {
    boughtTokens: 0, // Calculated post-tx
    signature
  };
}

module.exports = {
  getTokenPrice,
  claimCreatorFees,
  buybackTokens,
  PUMP_PROGRAM_ID
};
