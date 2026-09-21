const { PublicKey, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createBurnInstruction, getAccount } = require('@solana/spl-token');

const INCINERATOR_ADDRESS = 'Incinerator111111111111111111111111111111111';

/**
 * Burns SPL tokens from the wallet's associated token account directly to the Incinerator.
 * @param {Connection} connection 
 * @param {Keypair} walletKeypair 
 * @param {string|PublicKey} mintPubkey 
 * @param {number} [amountToBurn] Optional explicit token amount. If omitted, burns 100% of available tokens.
 * @returns {Promise<{ signature: string, burnedTokens: number }>}
 */
async function burnTokens(connection, walletKeypair, mintPubkey, amountToBurn = null) {
  const mintPk = typeof mintPubkey === 'string' ? new PublicKey(mintPubkey) : mintPubkey;
  const ata = await getAssociatedTokenAddress(mintPk, walletKeypair.publicKey);

  const tokenAccount = await getAccount(connection, ata);
  if (!tokenAccount || tokenAccount.amount === 0n) {
    throw new Error('No tokens available in wallet ATA to burn.');
  }

  let burnRawAmount = tokenAccount.amount;
  if (amountToBurn !== null && amountToBurn > 0) {
    burnRawAmount = BigInt(Math.floor(amountToBurn * 1e6)); // Assuming 6 decimals for Pump.fun tokens
    if (burnRawAmount > tokenAccount.amount) {
      burnRawAmount = tokenAccount.amount;
    }
  }

  const transaction = new Transaction().add(
    createBurnInstruction(
      ata,
      mintPk,
      walletKeypair.publicKey,
      burnRawAmount
    )
  );

  const signature = await connection.sendTransaction(transaction, [walletKeypair], {
    skipPreflight: false,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');

  return {
    signature,
    burnedTokens: Number(burnRawAmount) / 1e6
  };
}

module.exports = {
  burnTokens,
  INCINERATOR_ADDRESS
};
