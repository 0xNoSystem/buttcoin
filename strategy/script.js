const BTC_FEED_ID = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const BUTT_MINT = "Cm6fNnMk7NfzStP9CZpsQA2v3jjzbcYGAxdJySmHpump";
const PYTH_HERMES = "https://hermes.pyth.network";
const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${BUTT_MINT}`;
const SOLSCAN_TX_BASE_URL = "https://solscan.io/tx/";
const DEFAULT_BACKEND_BASE_URL = "https://edgar-nameless-dream-788.fly.dev";
const LIVE_PRICE_REFRESH_INTERVAL_MS = 10_000;

const BACKEND_BASE_URL =
  window.localStorage.getItem("backendBaseUrl") || DEFAULT_BACKEND_BASE_URL;

const el = {
  btcCurrentPrice: document.getElementById("btcCurrentPrice"),
  btcHoldingsValue: document.getElementById("btcHoldingsValue"),
  btcMarketValue: document.getElementById("btcMarketValue"),
  btcMeta: document.getElementById("btcMeta"),
  btcMetrics: document.getElementById("btcMetrics"),
  btcPnlPill: document.getElementById("btcPnlPill"),
  btcPnlRange: document.getElementById("btcPnlRange"),
  btcTransactions: document.getElementById("btcTransactions"),
  buttCurrentPrice: document.getElementById("buttCurrentPrice"),
  buttHoldingsValue: document.getElementById("buttHoldingsValue"),
  buttMarketValue: document.getElementById("buttMarketValue"),
  buttMeta: document.getElementById("buttMeta"),
  buttMetrics: document.getElementById("buttMetrics"),
  buttPnlPill: document.getElementById("buttPnlPill"),
  buttPnlRange: document.getElementById("buttPnlRange"),
  buttTransactions: document.getElementById("buttTransactions"),
  buttWalletButton: document.getElementById("buttWalletButton"),
  buttWalletText: document.getElementById("buttWalletText"),
  currentYear: document.getElementById("currentYear"),
  refreshButton: document.getElementById("refreshButton"),
  status: document.getElementById("status"),
};

const state = {
  payload: null,
  prices: {
    bitcoin: null,
    buttcoin: null,
  },
  isRefreshingData: false,
  isRefreshingPrices: false,
  buttWalletAddress: null,
};

let walletCopyResetTimer = null;

const assetConfig = {
  bitcoin: {
    acquiredKey: "btcAcquired",
    filingUrlKey: "filingUrl",
    holdingsKey: "totalBtcHoldings",
    averageCostDigits: 1,
  },
  buttcoin: {
    acquiredKey: "buttcoinAcquired",
    filingUrlKey: null,
    holdingsKey: "totalButtcoinHoldings",
    averageCostDigits: 5,
  },
};

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.className = isError ? "status err" : "status";
}

function formatUsd(value, maximumFractionDigits = 2) {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

function formatVolume(n) {
  if (n == null || !Number.isFinite(n)) return "--";

  const abs = Math.abs(n);

  if (abs >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }

  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }

  if (abs >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return String(n.toFixed(2));
}

function formatUsdSmart(value) {
  if (value == null || !Number.isFinite(value)) return "--";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${formatVolume(Math.abs(value))}`;
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDateOnly(value) {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatShortAddress(value) {
  if (!value) return "--...--";
  if (value.length <= 10) return value;
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function getPnlClass(value) {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return "pnl-neutral";
  }

  return value > 0 ? "pnl-positive" : "pnl-negative";
}

function buildPnlLabel(value, percent) {
  if (value == null || !Number.isFinite(value)) {
    return "PNL unavailable";
  }

  return `${formatUsdSmart(value)} · ${formatPercent(percent)}`;
}

function buildPnlPercentOnlyLabel(percent) {
  if (percent == null || !Number.isFinite(percent)) {
    return "PNL unavailable";
  }

  return formatPercent(percent);
}

function getDisplayedStrategyStats(purchases, acquiredKey) {
  let holdings = 0;
  let totalCostBasisUsd = 0;

  for (const purchase of purchases) {
    const acquired = Number(purchase?.[acquiredKey] ?? 0);
    const purchaseValueUsd = Number(purchase?.purchaseValueUsd ?? 0);

    if (Number.isFinite(acquired)) {
      holdings += acquired;
    }

    if (Number.isFinite(purchaseValueUsd)) {
      totalCostBasisUsd += purchaseValueUsd;
    }
  }

  return {
    holdings,
    totalCostBasisUsd,
    averageCostBasisUsd: holdings > 0 ? totalCostBasisUsd / holdings : null,
  };
}

function createMetric(label, value, extraClass = "") {
  const card = document.createElement("article");
  card.className = "metric";

  const labelEl = document.createElement("div");
  labelEl.className = "metric-label";
  labelEl.textContent = label;

  let valueEl;
  if (value instanceof Node) {
    valueEl = value;
    valueEl.className = `metric-value ${valueEl.className || ""} ${extraClass}`.trim();
  } else {
    valueEl = document.createElement("div");
    valueEl.className = `metric-value ${extraClass}`.trim();
    valueEl.textContent = value;
  }

  card.append(labelEl, valueEl);
  return card;
}

function createTxField(label, value, extraClass = "") {
  const wrapper = document.createElement("div");

  const labelEl = document.createElement("div");
  labelEl.className = "tx-item-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = `tx-item-value ${extraClass}`.trim();
  valueEl.textContent = value;

  wrapper.append(labelEl, valueEl);
  return wrapper;
}

async function fetchJson(path) {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchBtcPriceUsd() {
  const feed = `0x${BTC_FEED_ID}`;
  const url = `${PYTH_HERMES}/v2/updates/price/latest?ids[]=${encodeURIComponent(feed)}&parsed=true`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Pyth HTTP ${response.status}`);
  }

  const payload = await response.json();
  const entry = payload.parsed?.[0]?.price;

  if (!entry) {
    throw new Error("Pyth parsed price missing");
  }

  return Number(entry.price) * 10 ** Number(entry.expo);
}

async function fetchButtPriceUsd() {
  const response = await fetch(DEXSCREENER_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Dexscreener HTTP ${response.status}`);
  }

  const payload = await response.json();
  const pairs = (payload.pairs ?? [])
    .filter((pair) => Number(pair.priceUsd) > 0)
    .sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0));

  const best = pairs[0];
  const priceUsd = Number(best?.priceUsd ?? 0);

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error("No valid Buttcoin price found");
  }

  return priceUsd;
}

function renderAsset(kind, payload, currentPriceUsd) {
  const config = assetConfig[kind];
  const purchases = payload?.purchases ?? [];
  const latest = purchases[purchases.length - 1] ?? null;
  const metaEl = kind === "bitcoin" ? el.btcMeta : el.buttMeta;
  const currentPriceEl = kind === "bitcoin" ? el.btcCurrentPrice : el.buttCurrentPrice;
  const holdingsValueEl = kind === "bitcoin" ? el.btcHoldingsValue : el.buttHoldingsValue;
  const marketValueEl = kind === "bitcoin" ? el.btcMarketValue : el.buttMarketValue;
  const pnlPillEl = kind === "bitcoin" ? el.btcPnlPill : el.buttPnlPill;
  const pnlRangeEl = kind === "bitcoin" ? el.btcPnlRange : el.buttPnlRange;
  const metricsEl = kind === "bitcoin" ? el.btcMetrics : el.buttMetrics;
  const txListEl = kind === "bitcoin" ? el.btcTransactions : el.buttTransactions;
  const trackedWallet = kind === "buttcoin" ? payload?.trackedWallet ?? "" : "";

  metaEl.textContent = `${payload?.count ?? 0} purchases`;
  currentPriceEl.textContent =
    kind === "bitcoin"
      ? formatUsd(currentPriceUsd, 1)
      : formatUsd(currentPriceUsd, 6);

  if (kind === "buttcoin") {
    state.buttWalletAddress = trackedWallet || null;
    el.buttWalletText.textContent = formatShortAddress(trackedWallet);
    el.buttWalletButton.disabled = !trackedWallet;
    el.buttWalletButton.title = trackedWallet ? "Copy wallet address" : "Wallet unavailable";
    el.buttWalletButton.classList.remove("copied");
  }

  metricsEl.replaceChildren();
  txListEl.replaceChildren();

  if (purchases.length === 0) {
    holdingsValueEl.textContent = "--";
    marketValueEl.textContent = "--";
    pnlPillEl.className = "pnl-pill hero-pnl-value pnl-neutral";
    pnlPillEl.textContent = "No purchases";
    pnlRangeEl.textContent = "-- - now";
    return;
  }

  const { holdings, totalCostBasisUsd, averageCostBasisUsd } = getDisplayedStrategyStats(
    purchases,
    config.acquiredKey,
  );
  const allTimeHoldings = Number(latest?.[config.holdingsKey] ?? Number.NaN);
  const marketValueUsd =
    Number.isFinite(currentPriceUsd) && Number.isFinite(allTimeHoldings)
      ? allTimeHoldings * currentPriceUsd
      : null;
  const alignedMarketValueUsd =
    Number.isFinite(currentPriceUsd) && Number.isFinite(holdings)
      ? holdings * currentPriceUsd
      : null;
  const pnlUsd =
    alignedMarketValueUsd != null && Number.isFinite(totalCostBasisUsd)
      ? alignedMarketValueUsd - totalCostBasisUsd
      : null;
  const pnlPercent =
    pnlUsd != null && totalCostBasisUsd > 0 ? (pnlUsd / totalCostBasisUsd) * 100 : null;
  const holdingsDisplay = Number.isFinite(allTimeHoldings) ? formatVolume(allTimeHoldings) : "--";
  const firstPurchaseDate = purchases[0]?.date ?? null;

  holdingsValueEl.textContent = holdingsDisplay;
  marketValueEl.textContent = formatUsdSmart(marketValueUsd);
  pnlPillEl.className = `pnl-pill hero-pnl-value ${getPnlClass(pnlUsd)}`;
  pnlPillEl.textContent = buildPnlPercentOnlyLabel(pnlPercent);
  pnlRangeEl.textContent = `${formatDateOnly(firstPurchaseDate)} - now`;

  metricsEl.append(
    createMetric("Purchases", String(payload?.count ?? purchases.length)),
    createMetric("Average cost basis", formatUsd(averageCostBasisUsd, config.averageCostDigits)),
    createMetric("Total cost basis", formatUsdSmart(totalCostBasisUsd)),
  );

  [...purchases].reverse().forEach((purchase) => {
    const acquired = Number(purchase[config.acquiredKey] ?? 0);
    const purchaseValueUsd = Number(purchase.purchaseValueUsd ?? 0);
    const currentValueUsd =
      Number.isFinite(currentPriceUsd) && Number.isFinite(acquired)
        ? acquired * currentPriceUsd
        : null;
    const rowPnlUsd =
      currentValueUsd != null && Number.isFinite(purchaseValueUsd)
        ? currentValueUsd - purchaseValueUsd
        : null;
    const rowPnlPercent =
      rowPnlUsd != null && purchaseValueUsd > 0 ? (rowPnlUsd / purchaseValueUsd) * 100 : null;

    const card = document.createElement("article");
    card.className = "tx-card";

    const top = document.createElement("div");
    top.className = "tx-top";

    const dateWrap = document.createElement("div");
    const dateEl = document.createElement("div");
    dateEl.className = "tx-date";
    dateEl.textContent = purchase.date || "--";

    const subEl = document.createElement("div");
    subEl.className = "tx-sub";
    subEl.textContent = formatDate(purchase.timestamp || purchase.date);

    dateWrap.append(dateEl, subEl);

    const pnlEl = document.createElement("div");
    pnlEl.className = `pnl-pill ${getPnlClass(rowPnlUsd)}`;
    pnlEl.textContent = buildPnlLabel(rowPnlUsd, rowPnlPercent);

    top.append(dateWrap, pnlEl);

    const grid = document.createElement("div");
    grid.className = "tx-grid";
    grid.append(
      createTxField("Acquired", formatVolume(acquired)),
      createTxField("Buy price", formatUsd(Number(purchase.purchasePriceUsd ?? 0), 6)),
      createTxField("Purchase value", formatUsdSmart(purchaseValueUsd)),
      createTxField("Current value", formatUsdSmart(currentValueUsd)),
    );

    if (kind === "buttcoin") {
      const sourceField = document.createElement("div");
      const sourceLabel = document.createElement("div");
      sourceLabel.className = "tx-item-label";
      sourceLabel.textContent = "Source";
      sourceField.append(sourceLabel);

      const sourceValue = document.createElement("div");
      sourceValue.className = "tx-item-value";
      sourceValue.textContent = purchase.source ?? "--";
      sourceField.append(sourceValue);

      if (purchase.txHash) {
        const link = document.createElement("a");
        link.className = "filing-link tx-link";
        link.href = `${SOLSCAN_TX_BASE_URL}${purchase.txHash}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open on Solscan";
        sourceField.append(link);
      }

      grid.append(
        createTxField(
          "Spend",
          purchase.spendTokenSymbol && purchase.spendAmount != null
            ? `${formatVolume(Number(purchase.spendAmount ?? 0))} ${purchase.spendTokenSymbol}`
            : "--",
        ),
        sourceField,
      );
    } else {
      const filingUrl = config.filingUrlKey ? purchase[config.filingUrlKey] : null;
      const filingField = document.createElement("div");
      const label = document.createElement("div");
      label.className = "tx-item-label";
      label.textContent = "Filing";
      filingField.append(label);

      if (filingUrl) {
        const link = document.createElement("a");
        link.className = "filing-link";
        link.href = filingUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open filing";
        filingField.append(link);
      } else {
        const value = document.createElement("div");
        value.className = "tx-item-value";
        value.textContent = "--";
        filingField.append(value);
      }

      grid.append(createTxField("BTC acquired", formatVolume(acquired)), filingField);
    }

    card.append(top, grid);
    txListEl.append(card);
  });
}

function resetAssetView(kind) {
  const currentPriceEl = kind === "bitcoin" ? el.btcCurrentPrice : el.buttCurrentPrice;
  const holdingsValueEl = kind === "bitcoin" ? el.btcHoldingsValue : el.buttHoldingsValue;
  const marketValueEl = kind === "bitcoin" ? el.btcMarketValue : el.buttMarketValue;
  const metaEl = kind === "bitcoin" ? el.btcMeta : el.buttMeta;
  const pnlPillEl = kind === "bitcoin" ? el.btcPnlPill : el.buttPnlPill;
  const pnlRangeEl = kind === "bitcoin" ? el.btcPnlRange : el.buttPnlRange;
  const metricsEl = kind === "bitcoin" ? el.btcMetrics : el.buttMetrics;
  const txListEl = kind === "bitcoin" ? el.btcTransactions : el.buttTransactions;

  currentPriceEl.textContent = "--";
  holdingsValueEl.textContent = "--";
  marketValueEl.textContent = "--";
  metaEl.textContent = "Request failed";
  pnlPillEl.className = "pnl-pill hero-pnl-value pnl-neutral";
  pnlPillEl.textContent = "Unavailable";
  pnlRangeEl.textContent = "-- - now";
  metricsEl.replaceChildren();
  txListEl.replaceChildren();

  if (kind === "buttcoin") {
    state.buttWalletAddress = null;
    el.buttWalletText.textContent = "--...--";
    el.buttWalletButton.disabled = true;
    el.buttWalletButton.classList.remove("copied");
  }
}

function updateRefreshButton() {
  el.refreshButton.disabled = state.isRefreshingData;
  el.refreshButton.textContent = state.isRefreshingData ? "Refreshing..." : "Refresh";
}

function renderDashboard() {
  if (!state.payload) return;

  renderAsset("bitcoin", state.payload.bitcoin ?? {}, state.prices.bitcoin);
  renderAsset("buttcoin", state.payload.buttcoin ?? {}, state.prices.buttcoin);
}

function renderInitialLoadError() {
  resetAssetView("bitcoin");
  resetAssetView("buttcoin");
}

async function refreshLivePrices() {
  if (state.isRefreshingPrices) {
    return { warnings: [], updated: false };
  }

  state.isRefreshingPrices = true;

  try {
    const [btcPriceResult, buttPriceResult] = await Promise.allSettled([
      fetchBtcPriceUsd(),
      fetchButtPriceUsd(),
    ]);

    if (btcPriceResult.status === "fulfilled") {
      state.prices.bitcoin = btcPriceResult.value;
    }

    if (buttPriceResult.status === "fulfilled") {
      state.prices.buttcoin = buttPriceResult.value;
    }

    const warnings = [btcPriceResult, buttPriceResult]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);

    const updated =
      btcPriceResult.status === "fulfilled" || buttPriceResult.status === "fulfilled";

    if (updated) {
      renderDashboard();
    }

    return { warnings, updated };
  } finally {
    state.isRefreshingPrices = false;
  }
}

async function loadStrategyView() {
  if (state.isRefreshingData) return;

  state.isRefreshingData = true;
  updateRefreshButton();
  setStatus("Refreshing strategy...");

  try {
    state.payload = await fetchJson("/standard");
    renderDashboard();

    const { warnings } = await refreshLivePrices();

    if (warnings.length > 0) {
      setStatus("Loaded, but one live price feed is unavailable.", true);
      return;
    }

    setStatus("Live");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!state.payload) {
      renderInitialLoadError();
      setStatus(`Could not load strategy data: ${message}`, true);
      return;
    }

    setStatus(`Could not refresh strategy data: ${message}`, true);
  } finally {
    state.isRefreshingData = false;
    updateRefreshButton();
  }
}

async function refreshLivePricesOnInterval() {
  if (!state.payload) return;

  const { warnings, updated } = await refreshLivePrices();

  if (warnings.length > 0) {
    setStatus("Loaded, but one live price feed is unavailable.", true);
    return;
  }

  if (updated && el.status.classList.contains("err")) {
    setStatus("Live");
  }
}

el.refreshButton.addEventListener("click", () => {
  void loadStrategyView();
});

el.buttWalletButton.addEventListener("click", async () => {
  if (!state.buttWalletAddress || !navigator.clipboard?.writeText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.buttWalletAddress);
    el.buttWalletButton.classList.add("copied");
    el.buttWalletText.textContent = "Copied";

    if (walletCopyResetTimer) {
      window.clearTimeout(walletCopyResetTimer);
    }

    walletCopyResetTimer = window.setTimeout(() => {
      el.buttWalletButton.classList.remove("copied");
      el.buttWalletText.textContent = formatShortAddress(state.buttWalletAddress);
      walletCopyResetTimer = null;
    }, 1200);
  } catch {
    setStatus("Could not copy wallet address.", true);
  }
});

if (el.currentYear) {
  el.currentYear.textContent = String(new Date().getFullYear());
}

void loadStrategyView();
window.setInterval(() => {
  void refreshLivePricesOnInterval();
}, LIVE_PRICE_REFRESH_INTERVAL_MS);
