export interface ReceiptParsed {
  amount: number | null;
  date: string | null;
  merchant: string | null;
  raw: string;
}

const DATE_PATTERNS = [
  /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/,
  /\b(\d{4})-(\d{2})-(\d{2})\b/,
];

const TOTAL_KEYWORDS = ['SUMME', 'GESAMT', 'TOTAL', 'ZU ZAHLEN', 'BAR'];

function normalizeAmount(s: string): number | null {
  const cleaned = s.replace(/[^0-9,\.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function findAmount(text: string): number | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (TOTAL_KEYWORDS.some((kw) => upper.includes(kw))) {
      const m = lines[i].match(/(\d+[.,]?\d{0,2})\s*(?:€|EUR)?\s*$/);
      if (m) {
        const n = normalizeAmount(m[1]);
        if (n) return n;
      }
      if (i + 1 < lines.length) {
        const n = normalizeAmount(lines[i + 1]);
        if (n) return n;
      }
    }
  }

  const candidates: number[] = [];
  for (const m of text.matchAll(/(\d+[.,]\d{2})\s*(?:€|EUR)?/g)) {
    const n = normalizeAmount(m[1]);
    if (n) candidates.push(n);
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function findDate(text: string): string | null {
  for (const re of DATE_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    if (re.source.startsWith('\\b(\\d{4})')) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = (Number(yyyy) > 70 ? '19' : '20') + yyyy;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function findMerchant(text: string): string | null {
  const candidates = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 40 && /[A-Za-zÄÖÜäöüß]/.test(l));
  return candidates[0] ?? null;
}

export function parseReceiptText(raw: string): ReceiptParsed {
  return {
    amount: findAmount(raw),
    date: findDate(raw),
    merchant: findMerchant(raw),
    raw,
  };
}

export async function scanReceipt(file: File, onProgress?: (p: number) => void): Promise<ReceiptParsed> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('deu', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    },
  });
  const { data: { text } } = await worker.recognize(file);
  await worker.terminate();
  return parseReceiptText(text);
}
