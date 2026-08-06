/* Real market data via Twelve Data, plus the trend/momentum/pullback screener.
   Price, EMA20/50/200, volume and daily/weekly/monthly change all come from
   real daily candles (batched in one request per chunk of symbols).
   Fundamentals (P/E, EPS, div yield, market cap) come from /statistics,
   which the free plan only serves one symbol at a time, so those load in
   the background afterward, paced to stay under the 8 requests/minute cap,
   and the table re-renders as each one arrives. Sector is static reference
   data (the /profile endpoint that would fetch it live is a paid-plan-only
   feature on this key) so it isn't "real-time" the way the rest of this is.
   Universe is trimmed to 15 liquid names on purpose: /statistics costs one
   request per symbol with no batching, so a bigger list would eat most of
   a day's 800-request budget on a single fundamentals pass. */
(function(){
  "use strict";

  function hashCode(str){
    let h = 0;
    for(let i = 0; i < str.length; i++){
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h;
  }
  function round2(n){ return Math.round(n * 100) / 100; }
  function round1(n){ return Math.round(n * 10) / 10; }
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function chunk(arr, size){
    const out = [];
    for(let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // Twelve Data's free plan caps at 8 requests/minute, and each symbol inside
  // a batched request counts as its own request toward that cap. 8 symbols
  // is the most this can ask for in a single time_series call without going
  // over the limit in one shot, so a second chunk (the AI-sourced additions
  // below) needs a full minute's wait before it can safely go out.
  const BASE_UNIVERSE = [
    ["NVDA","NVIDIA Corp","Semiconductors"],
    ["AAPL","Apple Inc","Consumer Electronics"],
    ["MSFT","Microsoft Corp","Software"],
    ["AMZN","Amazon.com Inc","E-commerce"],
    ["TSLA","Tesla Inc","Automotive"],
    ["JPM","JPMorgan Chase","Banking"],
    ["COST","Costco Wholesale","Retail"],
    ["XOM","Exxon Mobil","Energy"]
  ];

  // Local-only proxy (swingai-server/) that holds the Anthropic key and asks
  // Claude, grounded with web search, for a handful of stocks currently
  // trending with swing traders. Never called directly from the browser —
  // Anthropic's API rejects browser origins outright. If the proxy isn't
  // running, this fails silently and the universe just stays at the base 8.
  const AI_TRENDING_URL = "http://localhost:8787/api/trending-stocks";
  const AI_TICKERS_CACHE_KEY = "swingai_ai_tickers_cache_v1";
  const AI_TICKERS_CACHE_TTL_MS = 60 * 60 * 1000;

  async function fetchAiTickers(){
    const cached = readCache(AI_TICKERS_CACHE_KEY, AI_TICKERS_CACHE_TTL_MS);
    if(cached) return cached;
    try{
      const res = await fetch(AI_TRENDING_URL);
      const data = await res.json();
      const baseSymbols = new Set(BASE_UNIVERSE.map(u => u[0]));
      const additions = (data.stocks || [])
        .filter(s => s.symbol && !baseSymbols.has(s.symbol.toUpperCase()))
        .slice(0, 4)
        .map(s => [s.symbol.toUpperCase(), s.name || s.symbol, s.sector || "AI Trending"]);
      writeCache(AI_TICKERS_CACHE_KEY, additions);
      return additions;
    } catch(e){
      return []; // proxy not running or unreachable: fall back to the base universe only
    }
  }

  const PRICE_CACHE_KEY = "swingai_price_cache_v1";
  const PRICE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour: daily candles don't move faster than this
  const STATS_CACHE_KEY = "swingai_stats_cache_v1";
  const STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // fundamentals move slowly, cache for a day

  let STOCKS = [];
  let status = { loading: true, error: null, fundamentalsLoading: false };
  const listeners = [];

  function onUpdate(cb){ listeners.push(cb); }
  function notify(){ listeners.forEach(cb => { try{ cb(); } catch(e){} }); }
  function getStatus(){ return status; }

  function getApiKey(){
    return (window.SwingAI.config && window.SwingAI.config.TWELVE_DATA_KEY) || null;
  }

  function readCache(key, ttlMs){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(Date.now() - parsed.fetchedAt > ttlMs) return null;
      return parsed.data;
    } catch(e){ return null; }
  }
  function writeCache(key, data){
    try{ localStorage.setItem(key, JSON.stringify({ fetchedAt: Date.now(), data })); }
    catch(e){}
  }

  function computeEMA(closesOldestFirst, period){
    if(closesOldestFirst.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closesOldestFirst.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for(let i = period; i < closesOldestFirst.length; i++){
      ema = closesOldestFirst[i] * k + ema * (1 - k);
    }
    return ema;
  }

  async function fetchJson(url){
    const res = await fetch(url);
    const data = await res.json();
    if(data && data.status === "error"){
      throw new Error(data.message || "Twelve Data returned an error.");
    }
    return data;
  }

  async function fetchTimeSeriesChunk(symbols, apiKey){
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbols.join(","))}&interval=1day&outputsize=260&apikey=${apiKey}`;
    const data = await fetchJson(url);
    return symbols.length === 1 ? { [symbols[0]]: data } : data;
  }

  // Same free-tier per-minute cap applies here: on a 429, wait it out once and retry.
  async function fetchTimeSeriesWithRetry(symbols, apiKey){
    try{
      return await fetchTimeSeriesChunk(symbols, apiKey);
    } catch(e){
      if(!/run out of api credits|rate limit/i.test(e.message || "")) throw e;
      await sleep(65000);
      return await fetchTimeSeriesChunk(symbols, apiKey);
    }
  }

  function buildStockFromSeries(symbol, name, sector, series){
    if(!series || !series.values || series.values.length < 60) return null;

    const valuesNewestFirst = series.values;
    const closesNewestFirst = valuesNewestFirst.map(v => parseFloat(v.close));
    const volumesNewestFirst = valuesNewestFirst.map(v => parseFloat(v.volume));
    const closesOldestFirst = [...closesNewestFirst].reverse();

    const price = closesNewestFirst[0];
    const ema20 = computeEMA(closesOldestFirst, 20);
    const ema50 = computeEMA(closesOldestFirst, 50);
    const ema200 = closesOldestFirst.length >= 200 ? computeEMA(closesOldestFirst, 200) : null;
    if(ema20 == null || ema50 == null || ema200 == null) return null;

    const dist20 = ((price - ema20) / ema20) * 100;
    const dist50 = ((price - ema50) / ema50) * 100;
    const dist200 = ((price - ema200) / ema200) * 100;

    const dailyChangePct = closesNewestFirst.length > 1 ? ((price - closesNewestFirst[1]) / closesNewestFirst[1]) * 100 : 0;
    const weeklyChangePct = closesNewestFirst.length > 5 ? ((price - closesNewestFirst[5]) / closesNewestFirst[5]) * 100 : 0;
    const monthlyChangePct = closesNewestFirst.length > 21 ? ((price - closesNewestFirst[21]) / closesNewestFirst[21]) * 100 : 0;

    const volume = volumesNewestFirst[0];
    const last20Vol = volumesNewestFirst.slice(0, 20);
    const avgVolume = last20Vol.reduce((a, b) => a + b, 0) / last20Vol.length;
    const relVol = avgVolume ? volume / avgVolume : 1;

    return {
      symbol, name, sector,
      price: round2(price), sma20: round2(ema20), sma50: round2(ema50), sma200: round2(ema200),
      dist20, dist50, dist200,
      dailyChangePct: round2(dailyChangePct), weeklyChangePct: round2(weeklyChangePct), monthlyChangePct: round2(monthlyChangePct),
      volume: Math.round(volume), avgVolume: Math.round(avgVolume), relVol: round2(relVol),
      marketCap: null, peRatio: null, epsDilTTM: null, epsDilGrowthYoY: null, divYieldPct: null
    };
  }

  async function fetchStatisticsFor(symbol, apiKey){
    try{
      const data = await fetchJson(`https://api.twelvedata.com/statistics?symbol=${symbol}&apikey=${apiKey}`);
      const stats = data.statistics;
      if(!stats) return null;
      const val = stats.valuations_metrics || {};
      const income = (stats.financials && stats.financials.income_statement) || {};
      const divs = stats.dividends_and_splits || {};
      return {
        marketCap: typeof val.market_capitalization === "number" ? val.market_capitalization : null,
        peRatio: typeof val.trailing_pe === "number" ? round1(val.trailing_pe) : null,
        epsDilTTM: typeof income.diluted_eps_ttm === "number" ? round2(income.diluted_eps_ttm) : null,
        epsDilGrowthYoY: typeof income.quarterly_earnings_growth_yoy === "number" ? round1(income.quarterly_earnings_growth_yoy * 100) : null,
        divYieldPct: typeof divs.trailing_annual_dividend_yield === "number" ? round2(divs.trailing_annual_dividend_yield * 100) : 0
      };
    } catch(e){
      return null;
    }
  }

  async function fillFundamentals(apiKey){
    status.fundamentalsLoading = true;
    notify();
    const statsCache = readCache(STATS_CACHE_KEY, STATS_CACHE_TTL_MS) || {};
    let dirty = false;
    for(const stock of STOCKS){
      if(statsCache[stock.symbol]){
        Object.assign(stock, statsCache[stock.symbol]);
        notify();
        continue;
      }
      const stats = await fetchStatisticsFor(stock.symbol, apiKey);
      if(stats){
        Object.assign(stock, stats);
        statsCache[stock.symbol] = stats;
        dirty = true;
      }
      notify();
      await sleep(8000); // /statistics is 1 request per symbol with no batching; stay well under 8/min
    }
    if(dirty) writeCache(STATS_CACHE_KEY, statsCache);
    status.fundamentalsLoading = false;
    notify();
  }

  async function loadMarketData(){
    const apiKey = getApiKey();
    if(!apiKey){
      status = { loading: false, error: "No Twelve Data API key configured (js/config.js).", fundamentalsLoading: false };
      notify();
      return;
    }

    const cached = readCache(PRICE_CACHE_KEY, PRICE_CACHE_TTL_MS);
    if(cached && cached.length){
      STOCKS = cached;
      status = { loading: false, error: null, fundamentalsLoading: false };
      notify();
      fillFundamentals(apiKey);
      return;
    }

    try{
      const aiTickers = await fetchAiTickers();
      const universe = BASE_UNIVERSE.concat(aiTickers);
      const chunks = chunk(universe.map(u => u[0]), 8);

      const results = {};
      for(let i = 0; i < chunks.length; i++){
        const chunkResults = await fetchTimeSeriesWithRetry(chunks[i], apiKey);
        Object.assign(results, chunkResults);
        if(i < chunks.length - 1) await sleep(65000); // next chunk needs a fresh per-minute window too
      }

      const stocks = universe
        .map(([symbol, name, sector]) => buildStockFromSeries(symbol, name, sector, results[symbol]))
        .filter(Boolean);

      if(!stocks.length){
        throw new Error("Twelve Data didn't return usable price history for any symbol.");
      }

      STOCKS = stocks;
      writeCache(PRICE_CACHE_KEY, STOCKS);
      status = { loading: false, error: null, fundamentalsLoading: false };
      notify();
      await sleep(60000); // the price fetch just spent the whole per-minute budget; give it a full cycle to reset
      fillFundamentals(apiKey);
    } catch(e){
      status = { loading: false, error: e.message || "Couldn't load real market data.", fundamentalsLoading: false };
      notify();
    }
  }

  // ---------- Screener ----------
  // One combined Trending list: a stock qualifies if the 21 EMA sits 0-3%
  // above price (still setting up, "Momentum") OR 0-3% below price (already
  // reclaimed, testing it as support, "Pullback"). dist20 is "price is X%
  // above the 20 EMA", so those are a small negative or small positive
  // dist20 respectively; a stock can only ever match one side.
  function baseQualityFilters(s){
    return { priceOk: s.price >= 10 };
  }
  function baseQualityPass(f){ return f.priceOk; }

  function buildRow(s){
    const bq = baseQualityFilters(s);
    const emaAbovePrice = s.dist20 <= 0 && s.dist20 >= -3;
    const emaBelowPrice = s.dist20 >= 0 && s.dist20 <= 3;
    const setup = emaAbovePrice ? "Momentum" : emaBelowPrice ? "Pullback" : null;
    const qualifies = baseQualityPass(bq) && setup !== null;

    const score = 3 - Math.abs(s.dist20); // closest to the 21 EMA ranks first

    return Object.assign({}, s, { bq, setup, qualifies, score });
  }

  function getScreenedList(){
    return STOCKS
      .map(s => buildRow(s))
      .filter(r => r.qualifies)
      .sort((a, b) => b.score - a.score);
  }

  function getUniverseSize(){ return STOCKS.length; }

  function pickStock(seed){
    if(!STOCKS.length) return null;
    const idx = Math.abs(hashCode(seed)) % STOCKS.length;
    return STOCKS[idx];
  }

  // ---------- Premium Stocks: a personal, unscreened watchlist ----------
  // Whatever the user adds here is just shown, real Twelve Data numbers, no
  // trend/momentum/pullback filtering. Symbols persist across reloads; price
  // data for each is cached individually so re-adding a previously-tracked
  // symbol is instant.
  const WATCHLIST_KEY = "swingai_watchlist_v1";
  const WATCHLIST_DATA_CACHE_KEY = "swingai_watchlist_data_v1";

  let watchlistSymbols = [];
  try{ watchlistSymbols = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]"); } catch(e){}
  const watchlistStocks = {}; // symbol -> stock row (buildRow'd) | { symbol, loading: true } | { symbol, error }

  function persistWatchlistSymbols(){
    try{ localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlistSymbols)); } catch(e){}
  }
  function readWatchlistDataCache(){
    try{ return JSON.parse(localStorage.getItem(WATCHLIST_DATA_CACHE_KEY) || "{}"); } catch(e){ return {}; }
  }
  function writeWatchlistDataCache(cache){
    try{ localStorage.setItem(WATCHLIST_DATA_CACHE_KEY, JSON.stringify(cache)); } catch(e){}
  }

  function getWatchlistSymbols(){ return watchlistSymbols.slice(); }
  function getWatchlistStocks(){ return watchlistSymbols.map(sym => watchlistStocks[sym] || { symbol: sym, loading: true }); }

  async function loadWatchlistSymbol(symbol, apiKey, useCache){
    const dataCache = readWatchlistDataCache();
    if(useCache && dataCache[symbol] && Date.now() - dataCache[symbol].fetchedAt < PRICE_CACHE_TTL_MS){
      watchlistStocks[symbol] = buildRow(dataCache[symbol].data);
      notify();
      return true;
    }

    watchlistStocks[symbol] = { symbol, loading: true };
    notify();
    try{
      const results = await fetchTimeSeriesWithRetry([symbol], apiKey);
      const raw = buildStockFromSeries(symbol, symbol, "Watchlist", results[symbol]);
      if(!raw){
        watchlistStocks[symbol] = { symbol, error: "No price history found for this symbol." };
        notify();
        return false;
      }
      watchlistStocks[symbol] = buildRow(raw);
      dataCache[symbol] = { fetchedAt: Date.now(), data: raw };
      writeWatchlistDataCache(dataCache);
      notify();

      // Fundamentals, best-effort, sharing the same cache Trending fills.
      const statsCache = readCache(STATS_CACHE_KEY, STATS_CACHE_TTL_MS) || {};
      if(statsCache[symbol]){
        Object.assign(watchlistStocks[symbol], statsCache[symbol]);
        notify();
      } else {
        fetchStatisticsFor(symbol, apiKey).then(stats => {
          if(!stats || !watchlistStocks[symbol]) return;
          Object.assign(watchlistStocks[symbol], stats);
          const cache = readCache(STATS_CACHE_KEY, STATS_CACHE_TTL_MS) || {};
          cache[symbol] = stats;
          writeCache(STATS_CACHE_KEY, cache);
          notify();
        });
      }
      return true;
    } catch(e){
      watchlistStocks[symbol] = { symbol, error: e.message || "Couldn't load this symbol." };
      notify();
      return false;
    }
  }

  async function addWatchlistSymbol(rawSymbol){
    const symbol = (rawSymbol || "").trim().toUpperCase();
    if(!symbol || !/^[A-Z][A-Z.]{0,7}$/.test(symbol)){
      return { ok: false, error: "Enter a valid ticker symbol." };
    }
    const apiKey = getApiKey();
    if(!apiKey) return { ok: false, error: "No Twelve Data API key configured." };

    if(!watchlistSymbols.includes(symbol)){
      watchlistSymbols.push(symbol);
      persistWatchlistSymbols();
    }
    const ok = await loadWatchlistSymbol(symbol, apiKey, true);
    if(!ok){
      // Keep it in the list with its error shown rather than silently dropping
      // it — the user can remove it themselves if the symbol was a typo.
    }
    return { ok };
  }

  function removeWatchlistSymbol(symbol){
    watchlistSymbols = watchlistSymbols.filter(s => s !== symbol);
    delete watchlistStocks[symbol];
    persistWatchlistSymbols();
    notify();
  }

  async function initWatchlist(){
    const apiKey = getApiKey();
    if(!apiKey || !watchlistSymbols.length) return;
    for(const symbol of watchlistSymbols){
      await loadWatchlistSymbol(symbol, apiKey, true);
    }
  }

  const ready = loadMarketData();
  ready.then(() => initWatchlist());

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.market = {
    getScreenedList, getUniverseSize, pickStock, getStatus, onUpdate, ready,
    getWatchlistSymbols, getWatchlistStocks, addWatchlistSymbol, removeWatchlistSymbol
  };
})();
