const { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } = require('@solana/spl-token');

/**
 * Batch airdrops SOL to a list of recipient addresses.
 * @param {Connection} connection 
 * @param {Keypair} senderKeypair 
 * @param {string[]} recipients Array of recipient wallet base58 public keys
 * @param {number} solPerRecipient Amount of SOL to send to each recipient
 * @returns {Promise<{ signature: string, recipientCount: number, totalSol: number }>}
 */
async function airdropSol(connection, senderKeypair, recipients, solPerRecipient) {
  if (!recipients || recipients.length === 0) {
    throw new Error('Recipients list cannot be empty.');
  }

  const lamportsPerRecipient = Math.floor(solPerRecipient * LAMPORTS_PER_SOL);
  const transaction = new Transaction();

  recipients.forEach(pubkeyStr => {
    const recipientPk = new PublicKey(pubkeyStr.trim());
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: recipientPk,
        lamports: lamportsPerRecipient
      })
    );
  });

  const signature = await connection.sendTransaction(transaction, [senderKeypair], {
    skipPreflight: false,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');

  return {
    signature,
    recipientCount: recipients.length,
    totalSol: solPerRecipient * recipients.length
  };
}

/**
 * Batch airdrops SPL tokens or stocks to a list of recipient addresses.
 * @param {Connection} connection 
 * @param {Keypair} senderKeypair 
 * @param {string|PublicKey} mintPubkey 
 * @param {string[]} recipients Array of recipient wallet base58 public keys
 * @param {number} tokensPerRecipient Amount of tokens/stocks to send to each recipient
 * @returns {Promise<{ signature: string, recipientCount: number, totalTokens: number }>}
 */
async function airdropTokens(connection, senderKeypair, mintPubkey, recipients, tokensPerRecipient) {
  const mintPk = typeof mintPubkey === 'string' ? new PublicKey(mintPubkey) : mintPubkey;
  const senderAta = await getAssociatedTokenAddress(mintPk, senderKeypair.publicKey);
  const rawAmountPerRecipient = BigInt(Math.floor(tokensPerRecipient * 1e6));

  const transaction = new Transaction();

  for (const pubkeyStr of recipients) {
    const recipientPk = new PublicKey(pubkeyStr.trim());
    const recipientAta = await getAssociatedTokenAddress(mintPk, recipientPk);

    const ataInfo = await connection.getAccountInfo(recipientAta);
    if (!ataInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderKeypair.publicKey,
          recipientAta,
          recipientPk,
          mintPk
        )
      );
    }

    transaction.add(
      createTransferInstruction(
        senderAta,
        recipientAta,
        senderKeypair.publicKey,
        rawAmountPerRecipient
      )
    );
  }

  const signature = await connection.sendTransaction(transaction, [senderKeypair], {
    skipPreflight: false,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');

  return {
    signature,
    recipientCount: recipients.length,
    totalTokens: tokensPerRecipient * recipients.length
  };
}

module.exports = {
  airdropSol,
  airdropTokens
};
