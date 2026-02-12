const BTC_FEED_ID = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const BUTT_MINT = "Cm6fNnMk7NfzStP9CZpsQA2v3jjzbcYGAxdJySmHpump";
const PYTH_HERMES = "https://hermes.pyth.network";
const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${BUTT_MINT}`;
const BTC_CIRCULATING_SUPPLY = 19850000;

const REFRESH_MS = 10000;
const REFRESH_SECONDS = Math.max(1, Math.floor(REFRESH_MS / 1000));
const TARGET_BUTT = 10000;

const el = {
  ratioMain: document.getElementById("ratioMain"),
  xNeeded: document.getElementById("xNeeded"),
  xJoke: document.getElementById("xJoke"),
  btcPrice: document.getElementById("btcPrice"),
  buttPrice: document.getElementById("buttPrice"),
  btcMcap: document.getElementById("btcMcap"),
  buttMcap: document.getElementById("buttMcap"),
  updatedAt: document.getElementById("updatedAt"),
  status: document.getElementById("status"),
};

const state = {
  btcUsd: null,
  buttUsd: null,
  buttMcap: null,
};

let updateInFlight = false;
let secondsUntilNext = REFRESH_SECONDS;

function setStatus(msg, isError = false) {
  el.status.textContent = msg;
  el.status.className = isError ? "err" : "";
}

function setCountdownStatus() {
  setStatus(`updating in ${secondsUntilNext}s`);
}

function formatUsd(value) {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}

function formatRatio(value) {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatX(value) {
  if (value == null || !Number.isFinite(value)) return "--x";
  if (value >= 1000) return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}x`;
  if (value >= 10) return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}x`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
}

function formatMcap(value) {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function funnyLine(x) {
  if (x == null || !Number.isFinite(x)) return "Calibrating butt-powered rockets...";
  if (x <= 1) return "Target hit. Cheeks have achieved escape velocity.";
  if (x <= 2) return "Clenchins at these levels.";
  if (x <= 10) return "Turbo butt mode required.";
  if (x <= 100) return "Serious glute gains needed.";
  if (x <= 1000) return "Summoning the council of mega clenchers.";
  return "Intergalactic cheek propulsion required.";
}

function formatNowTime() {
  return new Date().toLocaleTimeString();
}

function render() {
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

async function fetchBtcPriceUsd() {
  const feed = `0x${BTC_FEED_ID}`;
  const url = `${PYTH_HERMES}/v2/updates/price/latest?ids[]=${encodeURIComponent(feed)}&parsed=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);

  const payload = await res.json();
  const entry = payload.parsed?.[0]?.price;
  if (!entry) throw new Error("Pyth parsed price missing");

  const raw = Number(entry.price);
  const expo = Number(entry.expo);
  return raw * 10 ** expo;
}

async function fetchButtMarketData() {
  const res = await fetch(DEXSCREENER_URL);
  if (!res.ok) throw new Error(`Dexscreener HTTP ${res.status}`);

  const payload = await res.json();
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

async function updateMarketData() {
  if (updateInFlight) return;
  updateInFlight = true;
  setStatus("fetching latest...");

  try {
    const [btcUsd, butt] = await Promise.all([fetchBtcPriceUsd(), fetchButtMarketData()]);
    state.btcUsd = btcUsd;
    state.buttUsd = butt.priceUsd;
    state.buttMcap = butt.marketCap;
    render();
  } catch (err) {
    setStatus(`Update failed: ${String(err)}`, true);
  } finally {
    updateInFlight = false;
    secondsUntilNext = REFRESH_SECONDS;
  }
}

await updateMarketData();
setInterval(() => {
  if (updateInFlight) return;
  if (secondsUntilNext <= 0) {
    void updateMarketData();
    return;
  }
  setCountdownStatus();
  secondsUntilNext -= 1;
}, 1000);
