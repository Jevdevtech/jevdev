require('dotenv').config();
const { Connection } = require('@solana/web3.js');
const { loadKeypair, getSolBalance, refundSol } = require('./wallet');
const { claimCreatorFees, buybackTokens } = require('./pumpfun');
const { burnTokens } = require('./incinerator');
const { pushMonitorEvent } = require('./monitor');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=958b8a38-5d55-494e-8e10-7c31511e20f3';
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || 'Gg7auhxN1nfMu74GT67Cya2BUb4xaV3BshSgUw34gZP1';
const MONITOR_URL = process.env.MONITOR_API_URL || 'https://jevons-solana-monitor.onrender.com';

const connection = new Connection(RPC_URL, 'confirmed');

async function startAutonomousAgent(mintAddress, pollIntervalSeconds = 30) {
  if (!process.env.AGENT_PRIVATE_KEY) {
    console.error('ERROR: AGENT_PRIVATE_KEY is required in .env file.');
    process.exit(1);
  }

  const agent = loadKeypair(process.env.AGENT_PRIVATE_KEY);
  console.log('=====================================================');
  console.log('   JEVDEV SOLANA AUTONOMOUS AGENT TOOLKIT RUNNING   ');
  console.log('=====================================================');
  console.log(`Agent Wallet:      ${agent.publicKey.toBase58()}`);
  console.log(`Treasury Wallet:   ${TREASURY_ADDRESS}`);
  console.log(`Target Mint (CA):  ${mintAddress}`);
  console.log(`Poll Interval:     Every ${pollIntervalSeconds} seconds`);
  console.log('=====================================================\n');

  async function cycle() {
    try {
      const bal = await getSolBalance(connection, agent.publicKey);
      console.log(`[${new Date().toLocaleTimeString()}] Checking creator fee vault (Agent Balance: ${bal.toFixed(4)} SOL)...`);

      const claimRes = await claimCreatorFees(connection, agent, mintAddress);
      if (claimRes.claimedSol > 0) {
        console.log(`🔥 Fee Vault Claimed: ${claimRes.claimedSol.toFixed(4)} SOL!`);
        
        await pushMonitorEvent(MONITOR_URL, {
          type: 'claim',
          tx: claimRes.signature,
          title: 'Creator Fees Claimed',
          desc: `Claimed ${claimRes.claimedSol.toFixed(4)} SOL in creator fees`,
          valSol: claimRes.claimedSol.toString(),
          mint: mintAddress
        });

        // 50% Treasury / 50% Buyback Split
        const treasuryShare = claimRes.claimedSol * 0.5;
        const buybackShare = claimRes.claimedSol * 0.5;

        // 1. Send 50% to Treasury
        const tRes = await refundSol(connection, agent, TREASURY_ADDRESS, treasuryShare);
        console.log(`-> Sent 50% (${treasuryShare.toFixed(4)} SOL) to Treasury: ${tRes.signature}`);
        await pushMonitorEvent(MONITOR_URL, {
          type: 'treasury',
          tx: tRes.signature,
          title: '50% Fee Split Sent to Treasury',
          desc: `Sent ${treasuryShare.toFixed(4)} SOL to Treasury wallet`,
          valSol: treasuryShare.toString()
        });

        // 2. Spend 50% on Buyback
        const buyRes = await buybackTokens(connection, agent, mintAddress, buybackShare);
        console.log(`-> Executed Buyback with 50% (${buybackShare.toFixed(4)} SOL): ${buyRes.signature}`);
        await pushMonitorEvent(MONITOR_URL, {
          type: 'buyback',
          tx: buyRes.signature,
          title: '50% Fee Split Buyback Executed',
          desc: `Bought tokens with ${buybackShare.toFixed(4)} SOL`,
          valSol: buybackShare.toString(),
          mint: mintAddress
        });

        // 3. Burn tokens to Incinerator
        const burnRes = await burnTokens(connection, agent, mintAddress);
        console.log(`-> Incinerated ${burnRes.burnedTokens.toLocaleString()} tokens: ${burnRes.signature}`);
        await pushMonitorEvent(MONITOR_URL, {
          type: 'burn',
          tx: burnRes.signature,
          title: 'Tokens Incinerated',
          desc: `Burned ${burnRes.burnedTokens.toLocaleString()} tokens to Incinerator`,
          valTok: burnRes.burnedTokens.toString(),
          mint: mintAddress
        });
      }
    } catch (err) {
      console.error(`[Cycle Error] ${err.message}`);
    }
  }

  // First run
  await cycle();
  // Loop interval
  setInterval(cycle, pollIntervalSeconds * 1000);
}

module.exports = {
  startAutonomousAgent
};

if (require.main === module) {
  const mintArg = process.argv[2];
  if (!mintArg) {
    console.log('Usage: node src/index.js <TOKEN_MINT_ADDRESS>');
    process.exit(1);
  }
  startAutonomousAgent(mintArg, 30);
}
