/* Static market data: no live API calls of any kind (Twelve Data's free-tier
   credits kept running out, and the AI-discovery proxy added its own latency
   and moving parts). The numbers below are researched once and hardcoded —
   they're a snapshot, not a live feed, so they won't move again until
   someone edits this file. Trending is a fixed 10-name list; Premium is a
   separate fixed personal watchlist. Both share the same row shape, so
   trending.js/premium.js render them identically. (Upload Trade doesn't use
   this file at all — it sends the uploaded chart to /api/analyze-trade for
   a real AI read instead of picking from a canned list.) */
(function(){
  "use strict";

  function round2(n){ return Math.round(n * 100) / 100; }

  // Raw researched numbers per ticker, as of market close Aug 7, 2026. mapRow()
  // below derives the EMA-distance fields (dist20/dist50, and the sma20/sma50
  // aliases) from ema21Close/ema50Close so those don't have to be hand-computed
  // here. EMA values use each source's EMA20 preset as a close proxy for EMA21
  // (no source offers an exact 21-day preset).
  const RAW_TRENDING = [
    { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors",
      price: 223.96, dailyChangePct: 2.27, volume: 105669440, relVol: 0.69,
      marketCap: 5419830000000, peRatio: 34.30, epsDilTTM: 6.53, epsDilGrowthYoY: 88.62,
      divYieldPct: 0.13, setup: "Pullback",
      ema21Close: 206.82, ema50Close: 206.07, weeklyChangePct: 11.56, monthlyChangePct: 10.44 },
    { symbol: "TSLA", name: "Tesla, Inc.", sector: "Automotive",
      price: 328.58, dailyChangePct: 2.83, volume: 39492345, relVol: 0.86,
      marketCap: 1297740000000, peRatio: 305.29, epsDilTTM: 1.08, epsDilGrowthYoY: 1.88,
      divYieldPct: 0, setup: "Momentum",
      ema21Close: 343.34, ema50Close: 380.43, weeklyChangePct: 5.58, monthlyChangePct: -19.18 },
    { symbol: "AAPL", name: "Apple Inc.", sector: "Consumer Electronics",
      price: 313.33, dailyChangePct: 0.29, volume: 34437191, relVol: 0.61,
      marketCap: 4572790000000, peRatio: 35.92, epsDilTTM: 8.72, epsDilGrowthYoY: 18.02,
      divYieldPct: 0.34, setup: "Pullback",
      ema21Close: 323.42, ema50Close: 309.80, weeklyChangePct: 1.43, monthlyChangePct: -0.91 },
    { symbol: "MSFT", name: "Microsoft Corporation", sector: "Software",
      price: 499.99, dailyChangePct: 0.03, volume: 28846235, relVol: 0.70,
      marketCap: 3712700000000, peRatio: 27.86, epsDilTTM: 17.95, epsDilGrowthYoY: 13.83,
      divYieldPct: 0.71, setup: "Pullback",
      ema21Close: 423.83, ema50Close: 407.02, weeklyChangePct: 7.59, monthlyChangePct: 30.08 },
    { symbol: "PLTR", name: "Palantir Technologies Inc.", sector: "Software",
      price: 172.01, dailyChangePct: 10.32, volume: 77579878, relVol: 1.81,
      marketCap: 413360000000, peRatio: 147.00, epsDilTTM: 1.17, epsDilGrowthYoY: 112.35,
      divYieldPct: 0, setup: "Pullback",
      ema21Close: 135.04, ema50Close: 132.60, weeklyChangePct: 39.78, monthlyChangePct: 33.30 },
    { symbol: "AMZN", name: "Amazon.com, Inc.", sector: "E-commerce",
      price: 274.48, dailyChangePct: 0.82, volume: 33861436, relVol: 0.67,
      marketCap: 2960630000000, peRatio: 22.08, epsDilTTM: 12.43, epsDilGrowthYoY: 70.63,
      divYieldPct: 0, setup: "Momentum",
      ema21Close: 251.59, ema50Close: 247.50, weeklyChangePct: 1.07, monthlyChangePct: 11.11 },
    { symbol: "META", name: "Meta Platforms, Inc.", sector: "Internet Media",
      price: 592.10, dailyChangePct: 0.37, volume: 11250258, relVol: 0.62,
      marketCap: 1508380000000, peRatio: 22.30, epsDilTTM: 26.55, epsDilGrowthYoY: 35.31,
      divYieldPct: 0.35, setup: "Pullback",
      ema21Close: 612.25, ema50Close: 599.78, weeklyChangePct: 6.36, monthlyChangePct: -6.24 },
    { symbol: "AMD", name: "Advanced Micro Devices, Inc.", sector: "Semiconductors",
      price: 483.36, dailyChangePct: -1.21, volume: 26618791, relVol: 0.84,
      marketCap: 789070000000, peRatio: 124.05, epsDilTTM: 3.90, epsDilGrowthYoY: 82.56,
      divYieldPct: 0, setup: "Momentum",
      ema21Close: 503.45, ema50Close: 514.11, weeklyChangePct: 1.51, monthlyChangePct: -11.59 },
    { symbol: "SOFI", name: "SoFi Technologies, Inc.", sector: "Fintech",
      price: 18.38, dailyChangePct: 1.55, volume: 51642406, relVol: 0.65,
      marketCap: 23580000000, peRatio: 38.76, epsDilTTM: 0.47, epsDilGrowthYoY: 52.54,
      divYieldPct: 0, setup: "Momentum",
      ema21Close: 17.35, ema50Close: 17.44, weeklyChangePct: 12.69, monthlyChangePct: -1.29 },
    { symbol: "CAT", name: "Caterpillar Inc.", sector: "Industrial Machinery",
      price: 842.19, dailyChangePct: -1.72, volume: 2443792, relVol: 0.75,
      marketCap: 387130000000, peRatio: 41.90, epsDilTTM: 20.10, epsDilGrowthYoY: 40.59,
      divYieldPct: 0.73, setup: "Momentum",
      ema21Close: 868.06, ema50Close: 916.92, weeklyChangePct: 3.36, monthlyChangePct: -10.25 }
  ];

  const RAW_PREMIUM = [
    { symbol: "INTC", name: "Intel Corporation", sector: "Semiconductors",
      price: 101.65, dailyChangePct: 1.84, volume: 76760636, relVol: 0.61,
      marketCap: 512720000000, peRatio: null, epsDilTTM: -2.12, epsDilGrowthYoY: null,
      divYieldPct: 0,
      ema21Close: 96.96, ema50Close: 110.65, weeklyChangePct: 12.69, monthlyChangePct: -9.68 },
    { symbol: "ISRG", name: "Intuitive Surgical, Inc.", sector: "Medical Devices",
      price: 378.81, dailyChangePct: 1.36, volume: 2466037, relVol: 0.81,
      marketCap: 133830000000, peRatio: 43.42, epsDilTTM: 8.73, epsDilGrowthYoY: 20.92,
      divYieldPct: 0,
      ema21Close: 364.31, ema50Close: 393.16, weeklyChangePct: 7.21, monthlyChangePct: -7.96 },
    { symbol: "HLT", name: "Hilton Worldwide Holdings Inc.", sector: "Hospitality",
      price: 317.60, dailyChangePct: -1.36, volume: 1447754, relVol: 0.71,
      marketCap: 71480000000, peRatio: 46.67, epsDilTTM: 6.81, epsDilGrowthYoY: 11.50,
      divYieldPct: 0.19,
      ema21Close: 322.30, ema50Close: 332.36, weeklyChangePct: -0.90, monthlyChangePct: -5.94 },
    { symbol: "FTAI", name: "FTAI Aviation Ltd.", sector: "Aviation",
      price: 216.24, dailyChangePct: -2.26, volume: 1334415, relVol: 1.01,
      marketCap: 22210000000, peRatio: 47.10, epsDilTTM: 4.59, epsDilGrowthYoY: 34.37,
      divYieldPct: 0.69,
      ema21Close: 212.10, ema50Close: 235.35, weeklyChangePct: 4.97, monthlyChangePct: -5.17 },
    { symbol: "AGX", name: "Argan, Inc.", sector: "Engineering & Construction",
      price: 597.33, dailyChangePct: 1.09, volume: 137463, relVol: 0.40,
      marketCap: 8370000000, peRatio: 52.48, epsDilTTM: 11.38, epsDilGrowthYoY: 24.11,
      divYieldPct: 0.33,
      ema21Close: 581.29, ema50Close: 649.76, weeklyChangePct: 4.72, monthlyChangePct: -13.11 },
    { symbol: "MY", name: "China Ming Yang Wind Power Group Limited", sector: "Wind Energy",
      price: 2.44, dailyChangePct: 0.83, volume: null, relVol: 1.00,
      marketCap: 386050000, peRatio: 8.41, epsDilTTM: 0.29, epsDilGrowthYoY: null,
      divYieldPct: 0,
      ema21Close: 2.41, ema50Close: 2.40, weeklyChangePct: 0.83, monthlyChangePct: 1.67 },
    { symbol: "UNP", name: "Union Pacific Corporation", sector: "Railroads",
      price: 293.13, dailyChangePct: -0.76, volume: 2603166, relVol: 0.88,
      marketCap: 174140000000, peRatio: 23.74, epsDilTTM: 12.35, epsDilGrowthYoY: 11.99,
      divYieldPct: 1.88,
      ema21Close: 294.99, ema50Close: 279.84, weeklyChangePct: 0.34, monthlyChangePct: 2.84 },
    { symbol: "MRK", name: "Merck & Co., Inc.", sector: "Pharmaceuticals",
      price: 128.58, dailyChangePct: 0.16, volume: 7347556, relVol: 0.72,
      marketCap: 317570000000, peRatio: 36.19, epsDilTTM: 3.55, epsDilGrowthYoY: -69.26,
      divYieldPct: 2.61,
      ema21Close: 127.86, ema50Close: 123.85, weeklyChangePct: -1.24, monthlyChangePct: 2.81 },
    { symbol: "WULF", name: "TeraWulf Inc.", sector: "Bitcoin Mining",
      price: 17.08, dailyChangePct: -3.04, volume: 40854087, relVol: 1.30,
      marketCap: 8520000000, peRatio: null, epsDilTTM: -4.40, epsDilGrowthYoY: null,
      divYieldPct: 0, tag: "suggested",
      ema21Close: 18.43, ema50Close: 22.58, weeklyChangePct: -3.28, monthlyChangePct: -26.38 },
    { symbol: "WFC", name: "Wells Fargo & Company", sector: "Banking",
      price: 87.25, dailyChangePct: -0.39, volume: 7390992, relVol: 0.45,
      marketCap: 263840000000, peRatio: 12.68, epsDilTTM: 6.88, epsDilGrowthYoY: 16.44,
      divYieldPct: 2.12,
      ema21Close: 86.97, ema50Close: 84.60, weeklyChangePct: 0.93, monthlyChangePct: 0.39 },
    { symbol: "TXG", name: "10x Genomics, Inc.", sector: "Life Sciences",
      price: 52.03, dailyChangePct: 14.10, volume: 5434070, relVol: 1.72,
      marketCap: 6610000000, peRatio: null, epsDilTTM: -0.59, epsDilGrowthYoY: null,
      divYieldPct: 0, tag: "suggested",
      ema21Close: 46.46, ema50Close: 38.94, weeklyChangePct: 10.07, monthlyChangePct: 20.72 },
    { symbol: "CAT", name: "Caterpillar Inc.", sector: "Industrial Machinery",
      price: 842.19, dailyChangePct: -1.72, volume: 2443792, relVol: 0.75,
      marketCap: 387130000000, peRatio: 41.90, epsDilTTM: 20.10, epsDilGrowthYoY: 40.59,
      divYieldPct: 0.73,
      ema21Close: 868.06, ema50Close: 916.92, weeklyChangePct: 3.36, monthlyChangePct: -10.25 }
  ];

  function mapRow(raw){
    const dist20 = round2(((raw.price - raw.ema21Close) / raw.ema21Close) * 100);
    const dist50 = round2(((raw.price - raw.ema50Close) / raw.ema50Close) * 100);
    return Object.assign({}, raw, {
      sma20: raw.ema21Close, sma50: raw.ema50Close,
      dist20, dist50
    });
  }

  const TRENDING_STOCKS = RAW_TRENDING.map(mapRow);
  const PREMIUM_STOCKS = RAW_PREMIUM.map(mapRow);

  const listeners = [];
  function onUpdate(cb){ listeners.push(cb); }
  function notify(){ listeners.forEach(cb => { try{ cb(); } catch(e){} }); }
  function getStatus(){ return { loading: false, error: null, fundamentalsLoading: false }; }

  function getScreenedList(){ return TRENDING_STOCKS; }
  function getUniverseSize(){ return TRENDING_STOCKS.length; }

  function getWatchlistSymbols(){ return PREMIUM_STOCKS.map(s => s.symbol); }
  function getWatchlistStocks(){ return PREMIUM_STOCKS; }

  const ready = Promise.resolve();

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.market = {
    getScreenedList, getUniverseSize, getStatus, onUpdate, ready,
    getWatchlistSymbols, getWatchlistStocks
  };
})();
