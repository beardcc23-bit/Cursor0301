import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_PATH = path.join(__dirname, '..', 'data', 'txf.json');

// TODO: 把這個 URL 改成你要抓台指期的公開來源
// 要求：回傳 JSON，裡面至少要有：
// last / change / changePercent / contract / volume / time
const TXF_URL = process.env.TXF_URL || 'https://example.com/txf.json';

async function main() {
  if (!TXF_URL || TXF_URL.includes('example.com')) {
    console.warn('TXF_URL 未設定，略過更新 txf.json');
    return;
  }

  const res = await fetch(TXF_URL, {
    headers: {
      'User-Agent': 'GitHubActionsBot',
      Accept: 'application/json,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`TXF HTTP ${res.status}`);
  }

  const raw = await res.json();

  // 這裡假設來源已經是我們要的 shape，如果不是就自己在這裡轉一次
  const payload = {
    last: Number(raw.last ?? 0),
    change: Number(raw.change ?? 0),
    changePercent: Number(raw.changePercent ?? 0),
    contract: String(raw.contract ?? 'TX ----'),
    volume: Number(raw.volume ?? 0),
    time: raw.time || new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  console.log('TXF updated:', payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

