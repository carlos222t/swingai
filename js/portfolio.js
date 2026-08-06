/*
  AI portfolio: a fake-money book the app "trades" on its own, grounded in the
  same synthetic price history as everything else (so entries/exits are real
  points on the existing OHLC series, not just invented numbers). Deterministic
  per session build, not randomly different on every reload.
*/
(function(){
  "use strict";
  const data = window.SwingAI.data;

  function hashCode(str){
    let h = 0;
    for(let i=0;i<str.length;i++){ h = (Math.imul(31,h) + str.charCodeAt(i))|0; }
    return h;
  }
  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STARTING_CAPITAL = 10000;
  const TRADE_SYMBOLS = ["NVDA","TSLA","AAPL","AMD","COIN","PLTR","SOFI","UBER","GOOGL","META"];
  const REASONS = [
    "Bounced off the 20-day EMA on rising volume.",
    "Broke out above resistance with strong follow-through.",
    "Pulled back to the 50-day average and held.",
    "Momentum picked up after a catalyst.",
    "Held a key support level on a retest.",
    "Volume surged into a breakout above the recent range.",
    "Higher highs and higher lows stayed intact through the pullback.",
    "Reward to risk cleared 2 to 1 off the swing low."
  ];

  let cache = null;

  function buildTrades(){
    const rng = mulberry32(hashCode("ai-portfolio-v1"));
    const trades = [];
    TRADE_SYMBOLS.forEach((symbol, idx) => {
      const history = data.getHistory(symbol);
      const n = history.length;
      const entryIdx = Math.max(5, n - 1 - (10 + Math.floor(rng()*55)));
      const entry = history[entryIdx];
      const allocation = 800 + rng()*1700;
      const shares = allocation / entry.close;
      const isClosed = idx % 2 === 0;
      const quote = data.getQuote(symbol);

      let exit = null;
      if(isClosed){
        const exitIdx = Math.min(n-1, entryIdx + 5 + Math.floor(rng()*20));
        exit = history[exitIdx];
      }
      const markPrice = isClosed ? exit.close : quote.price;
      const pl = shares * (markPrice - entry.close);
      const plPct = ((markPrice - entry.close) / entry.close) * 100;

      trades.push({
        symbol,
        name: quote.name,
        shares,
        entryPrice: entry.close,
        entryDate: entry.date,
        status: isClosed ? "closed" : "open",
        exitPrice: isClosed ? exit.close : null,
        exitDate: isClosed ? exit.date : null,
        currentPrice: quote.price,
        markPrice,
        pl,
        plPct,
        allocation: shares * entry.close,
        reason: REASONS[Math.floor(rng()*REASONS.length)]
      });
    });

    trades.sort((a,b) => new Date(b.exitDate || b.entryDate) - new Date(a.exitDate || a.entryDate));
    return trades;
  }

  function getPortfolio(){
    if(cache) return cache;
    const trades = buildTrades();
    const totalPL = trades.reduce((s,t) => s + t.pl, 0);
    const totalValue = STARTING_CAPITAL + totalPL;
    const totalPLPct = (totalPL / STARTING_CAPITAL) * 100;
    cache = {
      trades,
      openTrades: trades.filter(t => t.status === "open"),
      closedTrades: trades.filter(t => t.status === "closed"),
      startingCapital: STARTING_CAPITAL,
      totalValue,
      totalPL,
      totalPLPct
    };
    return cache;
  }

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.portfolio = { getPortfolio, STARTING_CAPITAL };
})();
