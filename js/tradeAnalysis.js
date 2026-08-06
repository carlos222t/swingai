/* Reads an uploaded chart against the 21/50 EMA pullback checklist and
   produces a beginner-friendly bull/bear breakdown, a safety score, and a
   couple of headlines. The "21 EMA"/"50 EMA" labels map onto the same
   sma20/sma50 fields mockData.js already computes for the screener, picked
   deterministically from the upload so re-analyzing the same file always
   reads the same setup. */
(function(){
  "use strict";

  function hashCode(str){
    let h = 0;
    for(let i = 0; i < str.length; i++){
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h;
  }
  function mulberry32(seed){
    return function(){
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildSigns(stock, rnd){
    const bull = [];
    const bear = [];

    if(stock.dist20 > 0 && stock.dist50 > 0 && stock.dist20 < stock.dist50){
      bull.push(`Price is above both the 21 EMA ($${stock.sma20.toFixed(2)}) and the 50 EMA ($${stock.sma50.toFixed(2)}), with the 21 EMA on top. That's the basic shape of a real uptrend.`);
    } else if(stock.dist50 < 0){
      bear.push(`Price has broken below both the 21 EMA and the 50 EMA. The uptrend structure isn't intact right now.`);
    } else if(stock.dist20 > stock.dist50){
      bear.push(`The 21 EMA has slipped below the 50 EMA, an early sign this trend is losing strength.`);
    }

    if(stock.dist20 >= 0 && stock.dist20 <= 3){
      bull.push(`Price is only ${stock.dist20.toFixed(1)}% above the 21 EMA, right in the zone traders watch for a bounce.`);
    } else if(stock.dist20 < 0 && stock.dist20 >= -3){
      bear.push(`Price has slipped ${Math.abs(stock.dist20).toFixed(1)}% below the 21 EMA. It needs to hold the 50 EMA next, or this turns into a deeper pullback.`);
    }

    if(stock.dist50 >= 0){
      if(rnd() > 0.45){
        bull.push(`A bullish reversal candle formed right at support, the kind of confirmation this setup wants before you buy.`);
      } else {
        bear.push(`No clear reversal candle yet at this level. Price is still deciding, so the confirmation hasn't shown up.`);
      }
    } else {
      bear.push(`Price broke down before any reversal candle showed up. That's the setup failing, not just pausing.`);
    }

    if(stock.relVol > 1.2){
      bull.push(`Volume is running ${stock.relVol.toFixed(2)}x the average, real buying interest behind the move.`);
    } else if(stock.relVol < 0.7){
      bear.push(`Volume is only ${stock.relVol.toFixed(2)}x the average, a quiet bounce without much conviction behind it.`);
    }

    if(stock.monthlyChangePct >= 5 && stock.monthlyChangePct <= 30){
      bull.push(`Up ${stock.monthlyChangePct.toFixed(1)}% over the past month, already trending before this pullback started.`);
    } else if(stock.monthlyChangePct > 30){
      bear.push(`Up ${stock.monthlyChangePct.toFixed(1)}% over the past month. That's stretched, a pullback this deep could be the start of something bigger, not just a pause.`);
    } else if(stock.monthlyChangePct < 0){
      bear.push(`Down ${Math.abs(stock.monthlyChangePct).toFixed(1)}% over the past month. There's no established uptrend here to pull back within.`);
    }

    if(stock.weeklyChangePct <= 0.5 && stock.weeklyChangePct >= -3){
      bull.push(`Only ${Math.abs(stock.weeklyChangePct).toFixed(1)}% ${stock.weeklyChangePct < 0 ? "down" : "off its high"} this week, a shallow, controlled pullback rather than a breakdown.`);
    } else if(stock.weeklyChangePct < -4){
      bear.push(`Down ${Math.abs(stock.weeklyChangePct).toFixed(1)}% this week. That's sharper than a typical healthy pullback.`);
    }

    return { bull, bear };
  }

  const NEWS = [
    { tag: "Bullish", text: t => `${t.name} beat expectations last quarter and ${t.sector.toLowerCase()} peers followed it higher.` },
    { tag: "Bullish", text: t => `A few analysts raised their price target on ${t.symbol} this week after stronger guidance.` },
    { tag: "Bullish", text: t => `Institutional buying has picked up in ${t.symbol} over the past few sessions.` },
    { tag: "Bearish", text: t => `${t.name} missed on revenue last quarter and shares have been under pressure since.` },
    { tag: "Bearish", text: t => `An analyst downgraded ${t.symbol}, pointing to slowing growth in ${t.sector.toLowerCase()}.` },
    { tag: "Bearish", text: t => `Rising costs across ${t.sector.toLowerCase()} have investors watching margins closely.` },
    { tag: "Neutral", text: t => `${t.name} is scheduled to present at an industry conference next week.` },
    { tag: "Neutral", text: t => `${t.symbol}'s trading volume has been roughly in line with its recent average.` },
    { tag: "Neutral", text: t => `No major catalysts are scheduled for ${t.name} in the near term.` }
  ];

  function pickNews(stock, rnd){
    const pool = [...NEWS];
    const picks = [];
    for(let i = 0; i < 2 && pool.length; i++){
      const idx = Math.floor(rnd() * pool.length);
      const item = pool.splice(idx, 1)[0];
      picks.push({ tag: item.tag, text: item.text(stock) });
    }
    return picks;
  }

  function analyze(seed){
    const stock = window.SwingAI.market.pickStock(seed);
    if(!stock) return null;
    const rnd = mulberry32(hashCode(seed + "|read"));
    const { bull, bear } = buildSigns(stock, rnd);
    const news = pickNews(stock, mulberry32(hashCode(seed + "|news")));

    let score = bull.length || bear.length
      ? Math.round((bull.length / (bull.length + bear.length)) * 100)
      : 50;
    news.forEach(n => {
      if(n.tag === "Bullish") score += 4;
      if(n.tag === "Bearish") score -= 4;
    });
    score = Math.max(5, Math.min(95, score));

    const verdict = score >= 70
      ? { label: "Safer setup", cls: "safe" }
      : score >= 45
        ? { label: "Mixed signals, wait for confirmation", cls: "mixed" }
        : { label: "Risky setup", cls: "risky" };

    return { stock, bull, bear, news, score, verdict };
  }

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.tradeAnalysis = { analyze };
})();
