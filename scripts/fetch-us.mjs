import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.join(__dirname, '..', 'data');

// Yahoo Finance symbols
const SYMBOLS = ['MNQ=F', 'MYM=F', 'VOO'];

const QUOTE_URL = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
  SYMBOLS.join(',')
)}`;

async function fetchQuotes() {
  const res = await fetch(QUOTE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json,*/*;q=0.8',
    },
  });

  if (!res.ok) throw new Error(`US quote HTTP ${res.status}`);

  const json = await res.json();
  const list = json.quoteResponse?.result || [];
  const map = new Map(list.map((q) => [q.symbol, q]));
  return map;
}

function toIsoFromEpoch(secOrMs) {
  if (!secOrMs) return new Date().toISOString();
  const ms = secOrMs < 1e12 ? secOrMs * 1000 : secOrMs;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

async function writeJson(name, payload) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, name);
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function main() {
  const quotes = await fetchQuotes();

  // MNQ (小那斯)
  {
    const q = quotes.get('MNQ=F');
    if (q) {
      const payload = {
        last: Number(q.regularMarketPrice ?? 0),
        change: Number(q.regularMarketChange ?? 0),
        changePercent: Number(q.regularMarketChangePercent ?? 0),
        contract: String(q.symbol || 'MNQ=F'),
        volume: Number(q.regularMarketVolume ?? 0),
        time: toIsoFromEpoch(q.regularMarketTime),
      };
      await writeJson('us_nq.json', payload);
      console.log('US_NQ updated:', payload);
    }
  }

  // MYM (小道瓊)
  {
    const q = quotes.get('MYM=F');
    if (q) {
      const payload = {
        last: Number(q.regularMarketPrice ?? 0),
        change: Number(q.regularMarketChange ?? 0),
        changePercent: Number(q.regularMarketChangePercent ?? 0),
        contract: String(q.symbol || 'MYM=F'),
        volume: Number(q.regularMarketVolume ?? 0),
        time: toIsoFromEpoch(q.regularMarketTime),
      };
      await writeJson('us_dj.json', payload);
      console.log('US_DJ updated:', payload);
    }
  }

  // VOO ETF
  {
    const q = quotes.get('VOO');
    if (q) {
      const payload = {
        last: Number(q.regularMarketPrice ?? 0),
        change: Number(q.regularMarketChange ?? 0),
        changePercent: Number(q.regularMarketChangePercent ?? 0),
        contract: 'VOO',
        volume: Number(q.regularMarketVolume ?? 0),
        time: toIsoFromEpoch(q.regularMarketTime),
      };
      await writeJson('us_voo.json', payload);
      console.log('US_VOO updated:', payload);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

