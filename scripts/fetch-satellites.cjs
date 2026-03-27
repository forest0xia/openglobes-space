#!/usr/bin/env node
/**
 * Fetches satellite TLE data from CelesTrak and saves to public/data/satellites-cache.json
 * Run daily via GitHub Actions: node scripts/fetch-satellites.cjs
 *
 * IMPORTANT: This is the ONLY place that contacts CelesTrak.
 * The frontend NEVER makes live API calls — it only reads this cached file.
 */

const fs = require('fs');
const path = require('path');

const GROUPS = [
  { id: 'beidou', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=json' },
  { id: 'stations', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json' },
  { id: 'gps', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json' },
  { id: 'starlink', url: 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json' },
  { id: 'visual', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json' },
  { id: 'weather', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json' },
  { id: 'resource', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=json' },
  { id: 'science', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=json' },
  { id: 'geodetic', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geodetic&FORMAT=json' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 403 && attempt < retries) {
        console.log(`  ⏳ Rate limited, waiting 30s before retry ${attempt + 1}/${retries}...`);
        await sleep(30000);
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  ⏳ Attempt ${attempt} failed: ${err.message}, retrying in 10s...`);
      await sleep(10000);
    }
  }
}

async function main() {
  const outPath = path.join(__dirname, '..', 'public', 'data', 'satellites-cache.json');

  // Load existing cache to preserve data on partial failure
  let existing = {};
  try {
    const old = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    existing = old.groups || {};
  } catch { /* no existing cache */ }

  const results = {};
  let failures = 0;

  for (const group of GROUPS) {
    try {
      console.log(`Fetching ${group.id}...`);
      const data = await fetchWithRetry(group.url);
      console.log(`  ✓ ${data.length} entries`);
      results[group.id] = data;
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      // Keep existing data on failure
      if (existing[group.id]?.length > 0) {
        console.log(`  ↩ Keeping previous ${existing[group.id].length} entries`);
        results[group.id] = existing[group.id];
      } else {
        results[group.id] = [];
      }
      failures++;
    }
    // Polite delay between requests (CelesTrak rate limits)
    await sleep(2000);
  }

  const output = {
    timestamp: new Date().toISOString(),
    groups: results,
  };

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output));

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nSaved to ${outPath} (${sizeMB} MB)`);

  let total = 0;
  for (const [id, data] of Object.entries(results)) {
    console.log(`  ${id}: ${data.length}`);
    total += data.length;
  }
  console.log(`  Total: ${total} satellites`);

  if (failures > 0) {
    console.log(`\n⚠ ${failures} group(s) failed — previous data preserved where available`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
