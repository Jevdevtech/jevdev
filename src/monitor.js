const fetch = require('node-fetch');

/**
 * Pushes on-chain activity events (claim, treasury split, buyback, burn, airdrop)
 * to the Jevdev Express + MongoDB Web Monitor endpoint.
 * @param {string} monitorUrl Base URL of the monitor server (e.g. https://jevons-solana-monitor.onrender.com)
 * @param {Object} eventData Event metadata object
 * @returns {Promise<boolean>} Success status
 */
async function pushMonitorEvent(monitorUrl, eventData) {
  if (!monitorUrl) return false;
  try {
    const url = monitorUrl.replace(/\/$/, '') + '/api/events';
    const payload = {
      id: eventData.id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: eventData.type, // 'claim', 'treasury', 'buyback', 'burn', 'airdrop'
      ts: eventData.ts || Date.now(),
      tx: eventData.tx || '',
      title: eventData.title || '',
      desc: eventData.desc || '',
      valSol: (eventData.valSol || '0').toString(),
      valTok: (eventData.valTok || '0').toString(),
      mint: eventData.mint || ''
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`[Monitor Hook] Pushed ${eventData.type.toUpperCase()} event to monitor.`);
      return true;
    } else {
      console.warn(`[Monitor Hook Warning] Failed to push event. Status: ${res.status}`);
      return false;
    }
  } catch (err) {
    console.warn(`[Monitor Hook Error] Could not reach monitor URL: ${err.message}`);
    return false;
  }
}

module.exports = {
  pushMonitorEvent
};
