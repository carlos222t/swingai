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

  // Raw researched numbers per ticker, as of market close Aug 6, 2026. mapRow()
  // below derives the EMA-distance fields (dist20/dist50, and the sma20/sma50
  // aliases) from ema21Close/ema50Close so those don't have to be hand-computed
  // here. EMA values use each source's EMA20 preset as a close proxy for EMA21
  // (no source offers an exact 21-day preset).
  const RAW_TRENDING = [
    { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors",
      price: 218.99, dailyChangePct: -0.10, volume: 114304204, relVol: 0.89,
      marketCap: 5300000000000, peRatio: 33.57, epsDilTTM: 6.53, epsDilGrowthYoY: 110.60,
      divYieldPct: 0.46, setup: "Pullback",
      ema21Close: 216.20, ema50Close: 210.63, weeklyChangePct: 12.17, monthlyChangePct: 7.18 },
    { symbol: "TSLA", name: "Tesla, Inc.", sector: "Automotive",
      price: 319.53, dailyChangePct: -0.63, volume: 26086919, relVol: 0.67,
      marketCap: 1260000000000, peRatio: 295.99, epsDilTTM: 1.08, epsDilGrowthYoY: -35.60,
      divYieldPct: 0, setup: "Momentum",
      ema21Close: 320.18, ema50Close: 321.81, weeklyChangePct: 3.46, monthlyChangePct: -18.91 },
    { symbol: "AAPL", name: "Apple Inc.", sector: "Consumer Electronics",
      price: 312.41, dailyChangePct: 0.45, volume: 46237652, relVol: 0.84,
      marketCap: 4560000000000, peRatio: 35.68, epsDilTTM: 8.72, epsDilGrowthYoY: 32.60,
      divYieldPct: 0.35, setup: "Pullback",
      ema21Close: 310.82, ema50Close: 314.60, weeklyChangePct: -6.31, monthlyChangePct: -0.31 },
    { symbol: "MSFT", name: "Microsoft Corporation", sector: "Software",
      price: 499.86, dailyChangePct: 2.54, volume: 36189321, relVol: 0.94,
      marketCap: 3710000000000, peRatio: 27.16, epsDilTTM: 17.95, epsDilGrowthYoY: 31.60,
      divYieldPct: 0.73, setup: "Pullback",
      ema21Close: 491.05, ema50Close: 469.11, weeklyChangePct: 10.81, monthlyChangePct: 30.40 },
    { symbol: "PLTR", name: "Palantir Technologies Inc.", sector: "Software",
      price: 155.92, dailyChangePct: -1.58, volume: 41711184, relVol: 0.96,
      marketCap: 374680000000, peRatio: 135.50, epsDilTTM: 1.17, epsDilGrowthYoY: 287.60,
      divYieldPct: 0, setup: "Pullback",
      ema21Close: 152.97, ema50Close: 143.86, weeklyChangePct: 27.53, monthlyChangePct: 17.93 },
    { symbol: "AMZN", name: "Amazon.com, Inc.", sector: "E-commerce",
      price: 272.26, dailyChangePct: -0.14, volume: 30645404, relVol: 0.63,
      marketCap: 2940000000000, peRatio: 21.92, epsDilTTM: 12.44, epsDilGrowthYoY: 89.70,
      divYieldPct: 0, setup: "Momentum",
      ema21Close: 272.74, ema50Close: 265.71, weeklyChangePct: 15.61, monthlyChangePct: 11.76 },
    { symbol: "META", name: "Meta Platforms, Inc.", sector: "Internet Media",
      price: 589.90, dailyChangePct: 0.19, volume: 11798635, relVol: 0.63,
      marketCap: 1500000000000, peRatio: 22.19, epsDilTTM: 26.54, epsDilGrowthYoY: -3.70,
      divYieldPct: 0.36, setup: "Pullback",
      ema21Close: 585.06, ema50Close: 586.34, weeklyChangePct: 9.44, monthlyChangePct: -2.19 },
    { symbol: "AMD", name: "Advanced Micro Devices, Inc.", sector: "Semiconductors",
      price: 489.28, dailyChangePct: 1.50, volume: 24627839, relVol: 0.85,
      marketCap: 798740000000, peRatio: 124.88, epsDilTTM: 3.90, epsDilGrowthYoY: 124.80,
      divYieldPct: 0, setup: "Momentum",
      ema21Close: 492.50, ema50Close: 493.81, weeklyChangePct: 0.80, monthlyChangePct: -5.44 },
    { symbol: "SOFI", name: "SoFi Technologies, Inc.", sector: "Fintech",
      price: 18.10, dailyChangePct: -0.82, volume: 45290229, relVol: 0.54,
      marketCap: 23350000000, peRatio: 37.89, epsDilTTM: 0.48, epsDilGrowthYoY: -2.40,
      divYieldPct: 0, setup: "Momentum",
      ema21Close: 18.12, ema50Close: 17.65, weeklyChangePct: 9.90, monthlyChangePct: 2.09 },
    { symbol: "CAT", name: "Caterpillar Inc.", sector: "Industrial Machinery",
      price: 856.96, dailyChangePct: -1.62, volume: 2853491, relVol: 0.95,
      marketCap: 393920000000, peRatio: 36.93, epsDilTTM: 23.21, epsDilGrowthYoY: 18.00,
      divYieldPct: 0.76, setup: "Momentum",
      ema21Close: 867.59, ema50Close: 859.67, weeklyChangePct: 5.91, monthlyChangePct: -9.61 }
  ];

  const RAW_PREMIUM = [
    { symbol: "INTC", name: "Intel Corporation", sector: "Semiconductors",
      price: 99.81, dailyChangePct: -1.24, volume: 77946062, relVol: 0.68,
      marketCap: 503440000000, peRatio: null, epsDilTTM: -2.30, epsDilGrowthYoY: null,
      divYieldPct: 0,
      ema21Close: 99.50, ema50Close: 97.10, weeklyChangePct: 9.53, monthlyChangePct: -9.46 },
    { symbol: "ISRG", name: "Intuitive Surgical, Inc.", sector: "Medical Devices",
      price: 373.71, dailyChangePct: -0.40, volume: 2594668, relVol: 0.61,
      marketCap: 132020000000, peRatio: 42.85, epsDilTTM: 8.72, epsDilGrowthYoY: 21.60,
      divYieldPct: 0,
      ema21Close: 371.27, ema50Close: 365.35, weeklyChangePct: 5.88, monthlyChangePct: -9.97 },
    { symbol: "HLT", name: "Hilton Worldwide Holdings Inc.", sector: "Hospitality",
      price: 321.98, dailyChangePct: -0.79, volume: 948041, relVol: 0.43,
      marketCap: 72470000000, peRatio: 47.71, epsDilTTM: 6.80, epsDilGrowthYoY: 4.40,
      divYieldPct: 0.19,
      ema21Close: 321.09, ema50Close: 320.33, weeklyChangePct: -0.01, monthlyChangePct: -3.35 },
    { symbol: "FTAI", name: "FTAI Aviation Ltd.", sector: "Aviation",
      price: 221.23, dailyChangePct: -1.12, volume: 1593465, relVol: 0.89,
      marketCap: 22720000000, peRatio: 48.29, epsDilTTM: 4.58, epsDilGrowthYoY: 13.10,
      divYieldPct: 0.90,
      ema21Close: 221.93, ema50Close: 217.39, weeklyChangePct: 12.01, monthlyChangePct: 2.37 },
    { symbol: "AGX", name: "Argan, Inc.", sector: "Engineering & Construction",
      price: 590.87, dailyChangePct: -1.82, volume: 154882, relVol: 0.47,
      marketCap: 8280000000, peRatio: 51.93, epsDilTTM: 11.38, epsDilGrowthYoY: 59.40,
      divYieldPct: 0.34,
      ema21Close: 603.54, ema50Close: 592.40, weeklyChangePct: 1.90, monthlyChangePct: -11.21 },
    { symbol: "MY", name: "China Ming Yang Wind Power Group Limited", sector: "Wind Energy",
      price: 2.44, dailyChangePct: 0.83, volume: null, relVol: 1.00,
      marketCap: 386050000, peRatio: 8.41, epsDilTTM: 0.29, epsDilGrowthYoY: null,
      divYieldPct: 0,
      ema21Close: 2.41, ema50Close: 2.40, weeklyChangePct: 0.83, monthlyChangePct: 1.67 },
    { symbol: "UNP", name: "Union Pacific Corporation", sector: "Railroads",
      price: 295.38, dailyChangePct: -0.05, volume: 1719864, relVol: 0.54,
      marketCap: 175480000000, peRatio: 23.92, epsDilTTM: 12.35, epsDilGrowthYoY: 7.30,
      divYieldPct: 1.92,
      ema21Close: 294.77, ema50Close: 294.51, weeklyChangePct: 2.05, monthlyChangePct: 5.14 },
    { symbol: "MRK", name: "Merck & Co., Inc.", sector: "Pharmaceuticals",
      price: 128.37, dailyChangePct: 0.03, volume: 7051682, relVol: 0.84,
      marketCap: 317050000000, peRatio: 100.85, epsDilTTM: 1.27, epsDilGrowthYoY: -80.40,
      divYieldPct: 2.65,
      ema21Close: 128.81, ema50Close: 129.01, weeklyChangePct: -1.09, monthlyChangePct: 1.89 },
    { symbol: "WULF", name: "TeraWulf Inc.", sector: "Bitcoin Mining",
      price: 17.62, dailyChangePct: -2.52, volume: 20171606, relVol: 0.60,
      marketCap: 8790000000, peRatio: null, epsDilTTM: -4.51, epsDilGrowthYoY: null,
      divYieldPct: 0,
      ema21Close: 18.27, ema50Close: 18.35, weeklyChangePct: -1.12, monthlyChangePct: -22.82 },
    { symbol: "WFC", name: "Wells Fargo & Company", sector: "Banking",
      price: 87.59, dailyChangePct: -1.77, volume: 13163482, relVol: 0.78,
      marketCap: 264870000000, peRatio: 12.73, epsDilTTM: 6.88, epsDilGrowthYoY: 18.10,
      divYieldPct: 2.28,
      ema21Close: 88.13, ema50Close: 87.58, weeklyChangePct: 2.53, monthlyChangePct: 2.37 }
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
