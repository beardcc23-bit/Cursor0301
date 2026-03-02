import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_PATH = path.join(__dirname, '..', 'data', 'sxf.json');

// TODO: 把這個 URL 改成你要抓新加坡富台指的公開來源
// 要求：回傳 JSON，裡面至少要有：
// last / change / changePercent / contract / volume / time
const SXF_URL = process.env.SXF_URL || 'https://example.com/sxf.json';

async function main() {
  if (!SXF_URL || SXF_URL.includes('example.com')) {
    console.warn('SXF_URL 未設定，略過更新 sxf.json');
    return;
  }

  const res = await fetch(SXF_URL, {
    headers: {
      'User-Agent': 'GitHubActionsBot',
      Accept: 'application/json,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`SXF HTTP ${res.status}`);
  }

  const raw = await res.json();

  const payload = {
    last: Number(raw.last ?? 0),
    change: Number(raw.change ?? 0),
    changePercent: Number(raw.changePercent ?? 0),
    contract: String(raw.contract ?? 'TWNF ----'),
    volume: Number(raw.volume ?? 0),
    time: raw.time || new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  console.log('SXF updated:', payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

