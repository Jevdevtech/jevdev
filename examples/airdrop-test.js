/**
 * Example: Batch Airdropping SOL or SPL Tokens/Stocks to users
 */
require('dotenv').config();
const { Connection } = require('@solana/web3.js');
const { loadKeypair } = require('../src/wallet');
const { airdropSol, airdropTokens } = require('../src/airdrop');

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const agentKeypair = loadKeypair(process.env.AGENT_PRIVATE_KEY);

const recipientAddresses = [
  'Gg7auhxN1nfMu74GT67Cya2BUb4xaV3BshSgUw34gZP1',
  'J95jT4fTdkHS8AbVDQzWsJ8EKRNg31dyH6h2WFKYfjqu'
];

async function runAirdropExample() {
  console.log('--- SOL Airdrop Example ---');
  const solResult = await airdropSol(connection, agentKeypair, recipientAddresses, 0.001);
  console.log(`Sent 0.001 SOL to ${solResult.recipientCount} addresses. TX: ${solResult.signature}`);

  if (process.env.MINT_ADDRESS) {
    console.log('--- Token Airdrop Example ---');
    const tokenResult = await airdropTokens(connection, agentKeypair, process.env.MINT_ADDRESS, recipientAddresses, 100);
    console.log(`Sent 100 tokens to ${tokenResult.recipientCount} addresses. TX: ${tokenResult.signature}`);
  }
}

runAirdropExample().catch(console.error);
