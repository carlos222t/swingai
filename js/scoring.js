/*
  Swing score and risk score formulas.
  These are proprietary heuristics (no standard "swing rate" metric exists),
  built from historical volatility and the frequency of large directional moves.
*/
(function(){
  "use strict";

  function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }

  function dailyReturns(history){
    const out = [];
    for(let i=1;i<history.length;i++) out.push((history[i].close - history[i-1].close) / history[i-1].close);
    return out;
  }

  function stdev(values){
    if(values.length===0) return 0;
    const mean = values.reduce((a,b)=>a+b,0) / values.length;
    const variance = values.reduce((s,v)=>s+Math.pow(v-mean,2),0) / values.length;
    return Math.sqrt(variance);
  }

  function volatilityWindow(returns, window){
    return stdev(returns.slice(-window));
  }

  // 0-100 "swing propensity" score: recent-weighted volatility (10/20/50-day)
  // blended with how often the stock makes 5%+ moves in a single day.
  function computeSwingScore(history){
    const returns = dailyReturns(history);
    const vol10 = volatilityWindow(returns, 10);
    const vol20 = volatilityWindow(returns, 20);
    const vol50 = volatilityWindow(returns, 50);
    const blendedVol = vol10*0.5 + vol20*0.3 + vol50*0.2;
    // typical daily stdev spans ~0.5% (very calm) to ~6%+ (very volatile) -> map to 0-100
    const volComponent = clamp((blendedVol / 0.06) * 100, 0, 100);

    const lookback = returns.slice(-90);
    const bigSwings = lookback.filter(r => Math.abs(r) >= 0.05).length;
    const freqPct = lookback.length ? (bigSwings / lookback.length) * 100 : 0;
    // 15%+ of days having a 5%+ move is extreme -> caps the frequency component at 100
    const freqComponent = clamp((freqPct / 15) * 100, 0, 100);

    const score = Math.round(volComponent*0.6 + freqComponent*0.4);
    return {
      score: clamp(score,0,100),
      vol10Pct: vol10*100,
      vol20Pct: vol20*100,
      vol50Pct: vol50*100,
      bigSwingCount: bigSwings,
      bigSwingWindowDays: lookback.length
    };
  }

  // 0-100 risk score (+ Low/Medium/High label) from volatility and liquidity.
  function computeRiskScore(history){
    const returns = dailyReturns(history);
    const vol20 = volatilityWindow(returns, 20);
    const volRisk = clamp((vol20 / 0.06) * 100, 0, 100);

    const avgVolume = history.slice(-20).reduce((s,d)=>s+d.volume,0) / Math.min(20, history.length);
    // liquidity risk: <1M avg daily volume is risky to enter/exit, >20M is very liquid
    const logVol = Math.log10(Math.max(avgVolume, 1));
    const liquidityRisk = clamp(100 - ((logVol - 6) / (7.3 - 6)) * 100, 0, 100);

    const score = Math.round(volRisk*0.65 + liquidityRisk*0.35);
    const label = score < 34 ? "Low" : score < 67 ? "Medium" : "High";
    return {
      score: clamp(score,0,100),
      label,
      vol20Pct: vol20*100,
      avgVolume
    };
  }

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.scoring = { computeSwingScore, computeRiskScore, dailyReturns };
})();
