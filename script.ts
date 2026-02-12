type HermesPrice = {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
};

type HermesParsedEntry = {
  id: string;
  price: HermesPrice;
};

type HermesLatestResponse = {
  parsed?: HermesParsedEntry[];
};

type DexPair = {
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: {
    usd?: number;
  };
};

type DexResponse = {
  pairs?: DexPair[];
};

const BTC_FEED_ID = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const BUTT_MINT = "Cm6fNnMk7NfzStP9CZpsQA2v3jjzbcYGAxdJySmHpump";
const PYTH_HERMES = "https://hermes.pyth.network";
const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${BUTT_MINT}`;
const BTC_CIRCULATING_SUPPLY = 19_850_000;

const REFRESH_MS = 10_000;
const TARGET_BUTT = 10_000;

const el = {
  ratioMain: document.getElementById("ratioMain") as HTMLDivElement,
  xNeeded: document.getElementById("xNeeded") as HTMLDivElement,
  xJoke: document.getElementById("xJoke") as HTMLDivElement,
  btcPrice: document.getElementById("btcPrice") as HTMLDivElement,
  buttPrice: document.getElementById("buttPrice") as HTMLDivElement,
  btcMcap: document.getElementById("btcMcap") as HTMLDivElement,
  buttMcap: document.getElementById("buttMcap") as HTMLDivElement,
  updatedAt: document.getElementById("updatedAt") as HTMLDivElement,
  status: document.getElementById("status") as HTMLDivElement,
};

const state: {
  btcUsd: number | null;
  buttUsd: number | null;
  buttMcap: number | null;
} = {
  btcUsd: null,
  buttUsd: null,
  buttMcap: null,
};

let updateInFlight = false;

function setStatus(msg: string, isError = false): void {
  el.status.textContent = msg;
  el.status.className = isError ? "err" : "";
}

function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}

function formatRatio(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatX(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--x";
  if (value >= 1000) return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}x`;
  if (value >= 10) return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}x`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
}

function formatMcap(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function funnyLine(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return "Calibrating butt-powered rockets...";
  if (x <= 1) return "Target hit. Cheeks have achieved escape velocity.";
  if (x <= 2) return "One spicy candle and we moon.";
  if (x <= 10) return "Turbo butt mode required.";
  if (x <= 100) return "Serious glute gains needed.";
  if (x <= 1000) return "Summon the council of mega butts.";
  return "Intergalactic cheek propulsion required.";
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString();
}

function render(): void {
  el.btcPrice.textContent = formatUsd(state.btcUsd);
  el.buttPrice.textContent = formatUsd(state.buttUsd);

  const ratio =
    state.btcUsd != null && state.buttUsd != null && state.buttUsd > 0
      ? state.btcUsd / state.buttUsd
      : null;

  const xNeeded = ratio != null ? ratio / TARGET_BUTT : null;
  const btcMcap = state.btcUsd != null ? state.btcUsd * BTC_CIRCULATING_SUPPLY : null;

  el.ratioMain.textContent = ratio != null ? formatRatio(ratio) : "--";
  el.xNeeded.textContent = formatX(xNeeded);
  el.xJoke.textContent = funnyLine(xNeeded);
  el.buttMcap.textContent = formatMcap(state.buttMcap);
  el.btcMcap.textContent = formatMcap(btcMcap);
  el.updatedAt.textContent = formatNowTime();
}

async function fetchBtcPriceUsd(): Promise<number> {
  const feed = `0x${BTC_FEED_ID}`;
  const url = `${PYTH_HERMES}/v2/updates/price/latest?ids[]=${encodeURIComponent(feed)}&parsed=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);

  const payload = (await res.json()) as HermesLatestResponse;
  const entry = payload.parsed?.[0]?.price;
  if (!entry) throw new Error("Pyth parsed price missing");

  const raw = Number(entry.price);
  const expo = Number(entry.expo);
  return raw * 10 ** expo;
}

async function fetchButtMarketData(): Promise<{ priceUsd: number; marketCap: number | null }> {
  const res = await fetch(DEXSCREENER_URL);
  if (!res.ok) throw new Error(`Dexscreener HTTP ${res.status}`);

  const payload = (await res.json()) as DexResponse;
  const pairs = payload.pairs ?? [];

  const sorted = pairs
    .filter((p) => Number(p.priceUsd) > 0)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));

  const best = sorted[0];
  const priceUsd = Number(best?.priceUsd ?? 0);
  const marketCapRaw = Number(best?.marketCap ?? best?.fdv ?? 0);

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error("No valid BUTTCOIN USD price found");
  }

  return {
    priceUsd,
    marketCap: Number.isFinite(marketCapRaw) && marketCapRaw > 0 ? marketCapRaw : null,
  };
}

async function updateMarketData(): Promise<void> {
  if (updateInFlight) return;
  updateInFlight = true;

  try {
    const [btcUsd, butt] = await Promise.all([fetchBtcPriceUsd(), fetchButtMarketData()]);
    state.btcUsd = btcUsd;
    state.buttUsd = butt.priceUsd;
    state.buttMcap = butt.marketCap;
    render();
    setStatus("Market data updated");
  } catch (err) {
    setStatus(`Update failed: ${String(err)}`, true);
  } finally {
    updateInFlight = false;
  }
}

await updateMarketData();
setInterval(() => {
  void updateMarketData();
}, REFRESH_MS);
