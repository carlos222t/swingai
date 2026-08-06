/*
  Trade-plan breakdown: turns raw OHLCV history into the 8-step swing-trading
  checklist (catalyst, trend, pullback levels, entry, stop, target, managing
  into the catalyst, exit rules). Pure functions over history/quote/catalyst
  that the caller already has, same pattern as scoring.js.
*/
(function(){
  "use strict";

  function sma(closes, period){
    const p = Math.min(period, closes.length);
    if(p === 0) return 0;
    const slice = closes.slice(-p);
    return slice.reduce((a,b)=>a+b, 0) / slice.length;
  }

  // SMA-seeded EMA, walked forward across the given closes so it's converged
  // by the last value rather than starting cold at the most recent price.
  function ema(closes, period){
    if(closes.length === 0) return 0;
    if(closes.length <= period) return sma(closes, closes.length);
    const k = 2 / (period + 1);
    let val = sma(closes.slice(0, period), period);
    for(let i=period; i<closes.length; i++) val = closes[i]*k + val*(1-k);
    return val;
  }

  // Recent half vs. earlier half of the lookback window: both the swing high
  // and swing low stepping up counts as "higher highs, higher lows."
  function higherHighsHigherLows(history, lookback){
    const w = history.slice(-lookback);
    if(w.length < 10) return false;
    const mid = Math.floor(w.length/2);
    const first = w.slice(0, mid), second = w.slice(mid);
    const higherHigh = Math.max(...second.map(d=>d.high)) > Math.max(...first.map(d=>d.high));
    const higherLow = Math.min(...second.map(d=>d.low)) > Math.min(...first.map(d=>d.low));
    return higherHigh && higherLow;
  }

  function recentLow(history, lookback){ return Math.min(...history.slice(-lookback).map(d=>d.low)); }
  function recentHigh(history, lookback){ return Math.max(...history.slice(-lookback).map(d=>d.high)); }

  function volumeStats(history){
    const vols = history.map(d=>d.volume);
    const last5 = vols.slice(-5).reduce((a,b)=>a+b, 0) / 5;
    const prior5 = vols.slice(-10,-5).reduce((a,b)=>a+b, 0) / 5;
    const changePct = prior5 > 0 ? ((last5-prior5)/prior5)*100 : 0;
    return { last5, prior5, changePct, dryingUp: last5 < prior5 };
  }

  // Stdev of daily returns over the trailing `period` sessions, as a percent,
  // used to give the catalyst step a real sense of typical daily movement.
  function recentVolatilityPct(history, period){
    const closes = history.slice(-(period+1)).map(d=>d.close);
    const returns = [];
    for(let i=1;i<closes.length;i++) returns.push((closes[i]-closes[i-1])/closes[i-1]);
    if(returns.length === 0) return 0;
    const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
    const variance = returns.reduce((s,r)=>s+Math.pow(r-mean,2),0)/returns.length;
    return Math.sqrt(variance) * 100;
  }

  // Scores how well current price action fits a classic 21/50 EMA pullback
  // swing setup: the 21 EMA needs to sit above the 50 EMA (an established
  // uptrend), and price needs to have pulled back close to one of those
  // averages rather than sitting extended away from them or having broken
  // down through the 50 EMA entirely.
  function computeEmaSetup(history, price){
    const closes = history.map(d=>d.close);
    const ema21 = ema(closes, 21);
    const ema50 = ema(closes, 50);
    const trendUp = ema21 > ema50;
    const aboveEma50 = price > ema50;
    const spreadPct = ((ema21 - ema50) / ema50) * 100;
    const distTo21Pct = ((price - ema21) / ema21) * 100;
    const distTo50Pct = ((price - ema50) / ema50) * 100;
    const nearestAbsPct = Math.min(Math.abs(distTo21Pct), Math.abs(distTo50Pct));

    // Trend alignment (0-40): both the EMA order and price holding above the 50 EMA.
    let trendPts = 0;
    if(trendUp && aboveEma50) trendPts = 40;
    else if(trendUp) trendPts = 15; // trend intact but the pullback has broken below the 50 EMA, too deep

    // Pullback proximity and trend strength only mean anything once there's an
    // actual uptrend to pull back within; being near the average while the
    // 21 EMA is already under the 50 EMA is just chop, not a setup.
    const proximityPts = trendUp ? Math.max(0, 40 * (1 - nearestAbsPct/8)) : 0;
    const strengthPts = trendUp ? Math.max(0, Math.min(20, spreadPct * 2.5)) : 0;

    const score = Math.round(Math.max(0, Math.min(100, trendPts + proximityPts + strengthPts)));

    return { score, trendUp, aboveEma50, ema21, ema50, spreadPct, distTo21Pct, distTo50Pct, nearestAbsPct };
  }

  function computeBreakdown(symbol, history, quote, catalyst){
    const closes = history.map(d=>d.close);
    const price = quote.price;

    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const ema20 = ema(closes, 20);
    const aboveSma50 = price > sma50;
    const aboveSma200 = price > sma200;
    const brokenDown = !aboveSma50 && !aboveSma200;
    const hhhl = higherHighsHigherLows(history, 40);
    const trendConfirmed = aboveSma50 && aboveSma200 && hhhl;
    const trendStatus = brokenDown ? "Downtrend" : trendConfirmed ? "Uptrend" : "Consolidating";

    const support = recentLow(history, 20);
    const resistance = recentHigh(history, 60);
    const volume = volumeStats(history);
    const volatility20Pct = recentVolatilityPct(history, 20);

    // Pick whichever key level (20 EMA / 50 SMA / recent swing low) sits
    // closest under the current price as "the" pullback level to watch.
    const levelCandidates = [
      { name:"20-day EMA", value: ema20 },
      { name:"50-day SMA", value: sma50 },
      { name:"recent swing low", value: support }
    ].filter(l => l.value < price);
    const keyLevel = levelCandidates.length
      ? levelCandidates.reduce((a,b) => b.value > a.value ? b : a)
      : { name:"recent swing low", value: support };
    const nearLevel = price <= keyLevel.value * 1.03;
    const pctToKeyLevel = ((keyLevel.value - price) / price) * 100;

    const entry = keyLevel.value;
    const stop = support * 0.98;
    const riskPerShare = Math.max(0.01, entry - stop);
    const riskPct = (riskPerShare / entry) * 100;
    const minTarget = entry + riskPerShare * 2;
    const target = Math.max(resistance, minTarget);
    const rewardPerShare = target - entry;
    const rewardRatio = rewardPerShare / riskPerShare;
    const pctToEntry = ((entry - price) / price) * 100;
    const pctUpside = ((target - entry) / entry) * 100;

    const runUp10d = history.length > 10
      ? ((price - history[history.length-11].close) / history[history.length-11].close) * 100
      : 0;
    const alreadyRanHard = runUp10d > 15;

    return {
      symbol, price, catalyst, volatility20Pct,
      trend: {
        status: trendStatus, skip: brokenDown, aboveSma50, aboveSma200, hhhl, sma50, sma200,
        pctVsSma50: ((price-sma50)/sma50)*100,
        pctVsSma200: ((price-sma200)/sma200)*100
      },
      levels: { support, resistance, ema20, sma50, keyLevel, nearLevel, pctToKeyLevel, volume },
      trade: { entry, stop, target, riskPct, rewardRatio, pctToEntry, pctUpside },
      manage: { runUp10d, alreadyRanHard }
    };
  }

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.strategy = { sma, ema, higherHighsHigherLows, computeEmaSetup, computeBreakdown };
})();
