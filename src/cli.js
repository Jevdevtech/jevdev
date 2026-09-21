#!/usr/bin/env node
require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { program } = require('commander');
const fs = require('fs');

const { loadKeypair, createWallet, getSolBalance, refundSol } = require('./wallet');
const { getTokenPrice, claimCreatorFees, buybackTokens } = require('./pumpfun');
const { burnTokens } = require('./incinerator');
const { airdropSol, airdropTokens } = require('./airdrop');
const { pushMonitorEvent } = require('./monitor');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=958b8a38-5d55-494e-8e10-7c31511e20f3';
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || 'Gg7auhxN1nfMu74GT67Cya2BUb4xaV3BshSgUw34gZP1';
const MONITOR_URL = process.env.MONITOR_API_URL || 'https://jevons-solana-monitor.onrender.com';

const connection = new Connection(RPC_URL, 'confirmed');

function getAgentWallet() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) {
    throw new Error('AGENT_PRIVATE_KEY is missing in .env file. Run `node src/cli.js wallet create` to generate one.');
  }
  return loadKeypair(pk);
}

program
  .name('jev')
  .description('Solana Autonomous Agent Toolkit — Fee Claims, Buyback & Burn, Treasury Sweeps, and Token Airdrops')
  .version('1.0.0');

// ═══ WALLET COMMANDS ═══
program
  .command('wallet:create')
  .description('Create a new agent keypair and save to .wallets.json')
  .option('-l, --label <label>', 'Label for wallet', 'agent-wallet')
  .action((options) => {
    const w = createWallet(options.label, true);
    console.log('\n[Wallet Created]');
    console.log(`Public Key:     ${w.publicKey}`);
    console.log(`Private Key:    ${w.secretKeyBase58}`);
    console.log('\nSave secretKeyBase58 to AGENT_PRIVATE_KEY in your .env file.\n');
  });

program
  .command('wallet:balance')
  .description('Check SOL balance for agent or specified public key')
  .argument('[pubkey]', 'Public key to check')
  .action(async (pubkey) => {
    const target = pubkey || getAgentWallet().publicKey.toBase58();
    const balance = await getSolBalance(connection, target);
    console.log(`\nAddress: ${target}`);
    console.log(`Balance: ${balance.toFixed(4)} SOL\n`);
  });

program
  .command('wallet:refund')
  .description('Sweep/Refund remaining SOL balance back to Treasury')
  .argument('[destination]', 'Destination pubkey (defaults to TREASURY_ADDRESS in .env)')
  .option('-a, --amount <sol>', 'Specific SOL amount to refund')
  .action(async (destination, options) => {
    const agent = getAgentWallet();
    const dest = destination || TREASURY_ADDRESS;
    const amt = options.amount ? parseFloat(options.amount) : null;

    console.log(`\nSweeping SOL from ${agent.publicKey.toBase58()} to Treasury (${dest})...`);
    const res = await refundSol(connection, agent, dest, amt);
    console.log(`Success! Refunded ${res.refundedSol.toFixed(4)} SOL.`);
    console.log(`Transaction: https://solscan.io/tx/${res.signature}\n`);

    await pushMonitorEvent(MONITOR_URL, {
      type: 'treasury',
      tx: res.signature,
      title: 'Manual SOL Refund Executed',
      desc: `Swept ${res.refundedSol.toFixed(4)} SOL to Treasury (${dest.slice(0, 6)}...${dest.slice(-4)})`,
      valSol: res.refundedSol.toString()
    });
  });

// ═══ TOKEN & PUMPFUN COMMANDS ═══
program
  .command('token:price')
  .description('Query Pump.fun bonding curve price and stats for token mint')
  .argument('<mint>', 'Token Mint Address')
  .action(async (mint) => {
    console.log(`\nFetching bonding curve price for ${mint}...`);
    const stats = await getTokenPrice(connection, mint);
    console.log(`Price (SOL):        ${stats.priceSol.toFixed(9)} SOL`);
    console.log(`SOL in Curve:       ${stats.solInCurve.toFixed(4)} SOL`);
    console.log(`Tokens in Curve:    ${stats.tokensInCurve.toLocaleString()}`);
    console.log(`Graduated to DEX:   ${stats.isGraduated ? 'YES' : 'NO'}\n`);
  });

program
  .command('fees:claim')
  .description('Claim 100% creator fees from Pump.fun and split 50% Treasury / 50% Buyback')
  .argument('<mint>', 'Token Mint Address')
  .action(async (mint) => {
    const agent = getAgentWallet();
    console.log(`\nClaiming creator fees for mint ${mint}...`);
    const claimRes = await claimCreatorFees(connection, agent, mint);

    if (claimRes.claimedSol <= 0) {
      console.log('No claimable creator fees found at this time.\n');
      return;
    }

    console.log(`Claimed ${claimRes.claimedSol.toFixed(4)} SOL in creator fees!`);
    console.log(`Claim TX: https://solscan.io/tx/${claimRes.signature}`);

    await pushMonitorEvent(MONITOR_URL, {
      type: 'claim',
      tx: claimRes.signature,
      title: 'Creator Fees Claimed',
      desc: `Collected ${claimRes.claimedSol.toFixed(4)} SOL in creator fees from Pump.fun`,
      valSol: claimRes.claimedSol.toString(),
      mint
    });

    // 50/50 Split
    const treasuryShare = claimRes.claimedSol * 0.5;
    const buybackShare = claimRes.claimedSol * 0.5;

    console.log(`\nSplitting 50% to Treasury (${treasuryShare.toFixed(4)} SOL) and 50% to Buyback (${buybackShare.toFixed(4)} SOL)...`);

    // Send 50% to Treasury
    const tRes = await refundSol(connection, agent, TREASURY_ADDRESS, treasuryShare);
    console.log(`Treasury Transfer TX: https://solscan.io/tx/${tRes.signature}`);

    await pushMonitorEvent(MONITOR_URL, {
      type: 'treasury',
      tx: tRes.signature,
      title: '50% Fee Split Sent to Treasury',
      desc: `Transferred ${treasuryShare.toFixed(4)} SOL to Treasury wallet`,
      valSol: treasuryShare.toString()
    });

    // Execute 50% Buyback
    console.log(`Executing token buyback with ${buybackShare.toFixed(4)} SOL...`);
    const buyRes = await buybackTokens(connection, agent, mint, buybackShare);
    console.log(`Buyback TX: https://solscan.io/tx/${buyRes.signature}`);

    await pushMonitorEvent(MONITOR_URL, {
      type: 'buyback',
      tx: buyRes.signature,
      title: '50% Fee Split Buyback Executed',
      desc: `Purchased tokens with ${buybackShare.toFixed(4)} SOL`,
      valSol: buybackShare.toString(),
      mint
    });

    // Burn bought tokens to incinerator
    console.log(`Burning bought tokens to Incinerator...`);
    const burnRes = await burnTokens(connection, agent, mint);
    console.log(`Burn TX: https://solscan.io/tx/${burnRes.signature}`);
    console.log(`Burned ${burnRes.burnedTokens.toLocaleString()} tokens!\n`);

    await pushMonitorEvent(MONITOR_URL, {
      type: 'burn',
      tx: burnRes.signature,
      title: 'Tokens Incinerated',
      desc: `Burned ${burnRes.burnedTokens.toLocaleString()} tokens to Solana Incinerator`,
      valTok: burnRes.burnedTokens.toString(),
      mint
    });
  });

// ═══ AIRDROP COMMANDS ═══
program
  .command('airdrop:sol')
  .description('Batch airdrop SOL to a list of recipient addresses')
  .argument('<recipients>', 'Comma-separated recipient addresses or path to txt file')
  .argument('<amount>', 'SOL amount per recipient')
  .action(async (recipientsArg, amountArg) => {
    const agent = getAgentWallet();
    let recipientsList = [];
    if (fs.existsSync(recipientsArg)) {
      recipientsList = fs.readFileSync(recipientsArg, 'utf8').split('\n').filter(Boolean);
    } else {
      recipientsList = recipientsArg.split(',').map(s => s.trim()).filter(Boolean);
    }

    const solAmount = parseFloat(amountArg);
    console.log(`\nAirdropping ${solAmount} SOL to ${recipientsList.length} recipients...`);
    const res = await airdropSol(connection, agent, recipientsList, solAmount);
    console.log(`Success! Total Airdropped: ${res.totalSol.toFixed(4)} SOL`);
    console.log(`Transaction: https://solscan.io/tx/${res.signature}\n`);
  });

program
  .command('airdrop:token')
  .description('Batch airdrop SPL tokens or stocks to recipient addresses')
  .argument('<mint>', 'Token Mint Address')
  .argument('<recipients>', 'Comma-separated recipient addresses or path to txt file')
  .argument('<amount>', 'Token amount per recipient')
  .action(async (mint, recipientsArg, amountArg) => {
    const agent = getAgentWallet();
    let recipientsList = [];
    if (fs.existsSync(recipientsArg)) {
      recipientsList = fs.readFileSync(recipientsArg, 'utf8').split('\n').filter(Boolean);
    } else {
      recipientsList = recipientsArg.split(',').map(s => s.trim()).filter(Boolean);
    }

    const tokenAmount = parseFloat(amountArg);
    console.log(`\nAirdropping ${tokenAmount} tokens to ${recipientsList.length} recipients for mint ${mint}...`);
    const res = await airdropTokens(connection, agent, mint, recipientsList, tokenAmount);
    console.log(`Success! Total Tokens Airdropped: ${res.totalTokens.toLocaleString()}`);
    console.log(`Transaction: https://solscan.io/tx/${res.signature}\n`);
  });

program.parse(process.argv);
