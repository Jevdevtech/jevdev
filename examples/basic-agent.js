/**
 * Example: Running a 1-click Jev Autonomous Agent
 */
require('dotenv').config();
const { startAutonomousAgent } = require('../src/index');

// Replace with your launched SPL Token Contract Address (CA)
const MINT_ADDRESS = process.env.MINT_ADDRESS || 'YOUR_TOKEN_MINT_ADDRESS_HERE';

console.log('Starting autonomous agent monitor...');
startAutonomousAgent(MINT_ADDRESS, 30);
