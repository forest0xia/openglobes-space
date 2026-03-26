#!/usr/bin/env node
/**
 * Fetches satellite TLE data from CelesTrak and saves to public/data/satellites-cache.json
 * Run daily via GitHub Actions or manually: node scripts/fetch-satellites.js
 */

const fs = require('fs');
const path = require('path');

const GROUPS = [
  { id: 'beidou', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=json' },
  { id: 'stations', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json' },
  { id: 'gps', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json' },
  { id: 'starlink', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json' },
  { id: 'visual', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json' },
];

async function fetchGroup(group) {
  console.log(`Fetching ${group.id}...`);
  const res = await fetch(group.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${group.id}`);
  const data = await res.json();
  console.log(`  → ${data.length} entries`);
  return { id: group.id, data };
}

async function main() {
  const results = {};
  for (const group of GROUPS) {
    try {
      const { id, data } = await fetchGroup(group);
      results[id] = data;
    } catch (err) {
      console.error(`Failed to fetch ${group.id}:`, err.message);
      results[group.id] = [];
    }
  }

  const output = {
    timestamp: new Date().toISOString(),
    groups: results,
  };

  const outDir = path.join(__dirname, '..', 'public', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'satellites-cache.json');
  fs.writeFileSync(outPath, JSON.stringify(output));

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nSaved to ${outPath} (${sizeMB} MB)`);

  // Summary
  let total = 0;
  for (const [id, data] of Object.entries(results)) {
    console.log(`  ${id}: ${data.length}`);
    total += data.length;
  }
  console.log(`  Total: ${total} satellites`);
}

main().catch(err => { console.error(err); process.exit(1); });
