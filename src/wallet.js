const { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');

/**
 * Parses and loads a Solana Keypair from a Base58 string or byte array.
 * @param {string|Array|Uint8Array} secretKeyInput 
 * @returns {Keypair}
 */
function loadKeypair(secretKeyInput) {
  if (!secretKeyInput) {
    throw new Error('Keypair input is empty or undefined.');
  }

  if (typeof secretKeyInput === 'string') {
    const trimmed = secretKeyInput.trim();
    if (trimmed.startsWith('[')) {
      const parsedArray = JSON.parse(trimmed);
      return Keypair.fromSecretKey(Uint8Array.from(parsedArray));
    } else {
      return Keypair.fromSecretKey(bs58.decode(trimmed));
    }
  } else if (Array.isArray(secretKeyInput)) {
    return Keypair.fromSecretKey(Uint8Array.from(secretKeyInput));
  } else if (secretKeyInput instanceof Uint8Array) {
    return Keypair.fromSecretKey(secretKeyInput);
  }

  throw new Error('Invalid keypair format. Must be Base58 string or byte array.');
}

/**
 * Creates a brand new Solana Wallet keypair.
 * Optionally saves to local .wallets.json file.
 * @param {string} [label='agent-wallet'] 
 * @param {boolean} [saveToFile=true] 
 * @returns {{ keypair: Keypair, publicKey: string, secretKeyBase58: string }}
 */
function createWallet(label = 'agent-wallet', saveToFile = true) {
  const kp = Keypair.generate();
  const pubkeyStr = kp.publicKey.toBase58();
  const secretBase58 = bs58.encode(kp.secretKey);

  const walletData = {
    label,
    publicKey: pubkeyStr,
    secretKeyBase58: secretBase58,
    createdAt: new Date().toISOString()
  };

  if (saveToFile) {
    const filePath = path.join(process.cwd(), '.wallets.json');
    let existing = [];
    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {
        existing = [];
      }
    }
    existing.push(walletData);
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
  }

  return {
    keypair: kp,
    publicKey: pubkeyStr,
    secretKeyBase58: secretBase58
  };
}

/**
 * Fetches current SOL balance for a given address.
 * @param {Connection} connection 
 * @param {string|PublicKey} pubkey 
 * @returns {Promise<number>} Balance in SOL
 */
async function getSolBalance(connection, pubkey) {
  const pk = typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey;
  const balanceLamports = await connection.getBalance(pk);
  return balanceLamports / LAMPORTS_PER_SOL;
}

/**
 * Sweeps/Refunds remaining SOL from sourceKeypair back to treasuryPubkey.
 * Leaves 0.002 SOL for transaction fees unless amount is explicitly specified.
 * @param {Connection} connection 
 * @param {Keypair} sourceKeypair 
 * @param {string|PublicKey} destinationPubkey 
 * @param {number} [amountSol] Optional explicit SOL amount to refund
 * @returns {Promise<{ signature: string, refundedSol: number }>}
 */
async function refundSol(connection, sourceKeypair, destinationPubkey, amountSol = null) {
  const destPk = typeof destinationPubkey === 'string' ? new PublicKey(destinationPubkey) : destinationPubkey;
  const currentBalance = await connection.getBalance(sourceKeypair.publicKey);
  const feeReserve = 0.002 * LAMPORTS_PER_SOL;

  let transferLamports = 0;
  if (amountSol !== null && amountSol > 0) {
    transferLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  } else {
    transferLamports = currentBalance - feeReserve;
  }

  if (transferLamports <= 0) {
    throw new Error(`Insufficient funds to sweep. Current balance: ${(currentBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: sourceKeypair.publicKey,
      toPubkey: destPk,
      lamports: transferLamports
    })
  );

  const signature = await connection.sendTransaction(transaction, [sourceKeypair], {
    skipPreflight: false,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');

  return {
    signature,
    refundedSol: transferLamports / LAMPORTS_PER_SOL
  };
}

module.exports = {
  loadKeypair,
  createWallet,
  getSolBalance,
  refundSol
};
