import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_PATH = path.join(__dirname, '..', 'data', 'taiex.json');

// TWSE MIS TAIEX：常見 channel 為 tse_t00.tw
const TWSE_URL =
  'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0';

async function main() {
  const res = await fetch(TWSE_URL, {
    headers: {
      'User-Agent': 'GitHubActionsBot',
      Accept: 'application/json,text/javascript,*/*;q=0.01',
    },
  });

  if (!res.ok) {
    throw new Error(`TWSE HTTP ${res.status}`);
  }

  const raw = await res.json();

  const item = raw.msgArray?.[0];
  if (!item) {
    throw new Error('TWSE response shape unexpected');
  }

  const last = Number(item.z || item.y);
  const prevClose = Number(item.y || last);
  const change = last - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  const payload = {
    last,
    change,
    changePercent,
    high: Number(item.h || 0),
    low: Number(item.l || 0),
    volume: Number(item.v || 0),
    time: item.d && item.t ? `${item.d}T${item.t}+08:00` : new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  console.log('TAIEX updated:', payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

