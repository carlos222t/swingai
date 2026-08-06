/*
  Mock market/news/AI data provider for SwingAI.
  This is the ONLY file that should change when wiring up real APIs
  (Polygon/Alpaca/Finnhub for quotes+history, NewsAPI/Benzinga for news,
  Claude API for AI summaries). Everything else consumes this interface,
  not raw data shapes, so the swap is contained here.
*/
(function(){
  "use strict";

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
  function gaussian(rng){
    const u1 = Math.max(rng(), 1e-9), u2 = rng();
    return Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
  }
  function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }

  const TICKERS = [
    {symbol:"AAPL", name:"Apple Inc.", sector:"Technology", basePrice:210, baseVolume:55e6, vol:0.016, drift:0.0004},
    {symbol:"MSFT", name:"Microsoft Corp.", sector:"Technology", basePrice:420, baseVolume:22e6, vol:0.014, drift:0.0004},
    {symbol:"NVDA", name:"NVIDIA Corp.", sector:"Semiconductors", basePrice:135, baseVolume:220e6, vol:0.032, drift:0.0009},
    {symbol:"TSLA", name:"Tesla Inc.", sector:"Automotive", basePrice:245, baseVolume:95e6, vol:0.038, drift:0.0003},
    {symbol:"AMZN", name:"Amazon.com Inc.", sector:"E-Commerce", basePrice:185, baseVolume:38e6, vol:0.019, drift:0.0005},
    {symbol:"GOOGL", name:"Alphabet Inc.", sector:"Technology", basePrice:172, baseVolume:26e6, vol:0.017, drift:0.0004},
    {symbol:"META", name:"Meta Platforms Inc.", sector:"Technology", basePrice:495, baseVolume:16e6, vol:0.022, drift:0.0005},
    {symbol:"AMD", name:"Advanced Micro Devices", sector:"Semiconductors", basePrice:158, baseVolume:48e6, vol:0.030, drift:0.0005},
    {symbol:"NFLX", name:"Netflix Inc.", sector:"Media", basePrice:680, baseVolume:3.2e6, vol:0.021, drift:0.0004},
    {symbol:"COIN", name:"Coinbase Global", sector:"Financial Services", basePrice:225, baseVolume:9.5e6, vol:0.045, drift:0.0002},
    {symbol:"PLTR", name:"Palantir Technologies", sector:"Software", basePrice:28, baseVolume:60e6, vol:0.040, drift:0.0008},
    {symbol:"RIVN", name:"Rivian Automotive", sector:"Automotive", basePrice:11, baseVolume:35e6, vol:0.048, drift:-0.0002},
    {symbol:"SOFI", name:"SoFi Technologies", sector:"Financial Services", basePrice:8.4, baseVolume:28e6, vol:0.036, drift:0.0002},
    {symbol:"GME", name:"GameStop Corp.", sector:"Retail", basePrice:22, baseVolume:6.5e6, vol:0.055, drift:-0.0001},
    {symbol:"AMC", name:"AMC Entertainment", sector:"Entertainment", basePrice:4.2, baseVolume:20e6, vol:0.060, drift:-0.0003},
    {symbol:"MARA", name:"Marathon Digital", sector:"Crypto Mining", basePrice:18, baseVolume:22e6, vol:0.058, drift:0.0001},
    {symbol:"SMCI", name:"Super Micro Computer", sector:"Technology", basePrice:32, baseVolume:18e6, vol:0.050, drift:-0.0002},
    {symbol:"ARM", name:"Arm Holdings", sector:"Semiconductors", basePrice:118, baseVolume:6e6, vol:0.033, drift:0.0006},
    {symbol:"UBER", name:"Uber Technologies", sector:"Transportation", basePrice:72, baseVolume:14e6, vol:0.020, drift:0.0004},
    {symbol:"DIS", name:"The Walt Disney Co.", sector:"Media", basePrice:98, baseVolume:9e6, vol:0.017, drift:0.0002}
  ];

  const NEWS_TEMPLATES = [
    {sent:"bullish", text:"{name} shares climb after {topic} beats analyst expectations"},
    {sent:"bullish", text:"Wall Street raises price targets on {sym} citing strong {sector} demand"},
    {sent:"bullish", text:"{name} announces buyback expansion, shares react positively"},
    {sent:"bullish", text:"Analysts turn bullish on {sym} ahead of next earnings print"},
    {sent:"bullish", text:"{name} unveils new product line, investors cheer growth outlook"},
    {sent:"bearish", text:"{name} slides on {topic} concerns, analysts flag near-term risk"},
    {sent:"bearish", text:"{sym} downgraded as competitive pressure mounts in {sector}"},
    {sent:"bearish", text:"{name} guidance disappoints, shares under pressure"},
    {sent:"bearish", text:"Regulatory scrutiny weighs on {name} amid {sector} crackdown fears"},
    {sent:"bearish", text:"{sym} sees heavy options put activity as volatility spikes"},
    {sent:"neutral", text:"{name} to present at upcoming {sector} investor conference"},
    {sent:"neutral", text:"{sym} trading volume elevated amid broader {sector} rotation"},
    {sent:"neutral", text:"What to watch: {name} earnings date confirmed for next month"},
    {sent:"neutral", text:"{name} announces executive leadership change"},
    {sent:"neutral", text:"Institutional ownership in {sym} shifts as funds rebalance {sector} exposure"}
  ];
  const NEWS_TOPICS = ["margins","revenue growth","supply chain updates","cost cuts","subscriber growth","AI investment","production numbers","guidance","market share"];
  const SOURCES = ["Reuters","Bloomberg","CNBC","MarketWatch","Barron's","Yahoo Finance","The Wall Street Journal"];

  const AI_VOL_DESC = [[0.012,"low"],[0.022,"moderate"],[0.035,"elevated"],[Infinity,"high"]];
  function describeVol(v){
    for(const [thresh,label] of AI_VOL_DESC) if(v<thresh) return label;
    return "high";
  }

  const MAX_DAYS = 500; // ~2 years of calendar days; every range/window is a slice of this one walk
  const cache = new Map();

  function tickerMeta(symbol){
    return TICKERS.find(t=>t.symbol===symbol.toUpperCase());
  }

  function generateHistory(meta){
    const rng = mulberry32(hashCode(meta.symbol));
    const history = [];
    let price = meta.basePrice * (0.75 + rng()*0.5); // vary starting point per ticker
    const today = new Date();
    for(let i=MAX_DAYS-1;i>=0;i--){
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      let ret = meta.drift + meta.vol * gaussian(rng);
      if(rng() < 0.035){ // occasional outsized swing event
        ret += (rng()<0.5?-1:1) * (0.05 + rng()*0.06);
      }
      const open = price * (1 + (rng()-0.5)*meta.vol*0.3);
      const close = Math.max(0.5, price * (1+ret));
      const high = Math.max(open,close) * (1 + rng()*meta.vol*0.5);
      const low = Math.max(0.2, Math.min(open,close) * (1 - rng()*meta.vol*0.5));
      const volume = Math.round(meta.baseVolume * (0.55 + rng()*0.9) * (1 + Math.abs(ret)*6));
      history.push({date: date.toISOString().slice(0,10), open, high, low, close, volume});
      price = close;
    }
    return history;
  }

  // Every call for a symbol slices the SAME canonical walk, so a 1-month chart's
  // tail always matches a 1-year chart's tail: no re-rolled prices on range switch.
  function getHistory(symbol, days){
    const meta = tickerMeta(symbol);
    if(!meta) return [];
    const key = symbol.toUpperCase();
    if(!cache.has(key)) cache.set(key, generateHistory(meta));
    const full = cache.get(key);
    if(!days || days >= full.length) return full;
    return full.slice(-days);
  }

  // Splits one day's OHLCV into `barCount` synthetic intraday bars: a seeded
  // random walk from the day's open to its close, with one bar forced to carry
  // the day's true high and another its true low, and volume split (summing
  // back to the day's total) across the bars. Used to fill out short ranges
  // (1W, 1M) with more bars than there are literal trading days.
  function splitDayIntoBars(symbol, day, barCount){
    if(barCount <= 1) return [day];
    const rng = mulberry32(hashCode(symbol + ":" + day.date + ":" + barCount));

    const bounds = [day.open];
    const span = (day.high - day.low) || (Math.abs(day.close - day.open) + 0.01);
    for(let i=1;i<barCount;i++){
      const t = i / barCount;
      const base = day.open + (day.close - day.open) * t;
      const noisy = base + (rng()-0.5) * span * 0.5;
      bounds.push(Math.max(day.low, Math.min(day.high, noisy)));
    }
    bounds.push(day.close);

    const highBarIdx = Math.floor(rng() * barCount);
    const lowBarIdx = (highBarIdx + 1 + Math.floor(rng() * (barCount-1))) % barCount;

    const weights = Array.from({length:barCount}, () => 0.5 + rng());
    const weightSum = weights.reduce((a,b)=>a+b, 0);
    let allocated = 0;
    const volumes = weights.map((w,i) => {
      if(i === barCount-1) return Math.max(0, day.volume - allocated);
      const v = Math.round(day.volume * (w/weightSum));
      allocated += v;
      return v;
    });

    const bars = [];
    for(let i=0;i<barCount;i++){
      const open = bounds[i], close = bounds[i+1];
      let high = Math.max(open, close), low = Math.min(open, close);
      if(i === highBarIdx) high = day.high;
      if(i === lowBarIdx) low = day.low;
      bars.push({ date: day.date, open, high, low, close, volume: volumes[i] });
    }
    return bars;
  }

  // Expands a daily history array toward `targetBars` total bars by splitting
  // days into sub-bars (most recent days get the extra bar when it doesn't
  // divide evenly). No-op if there are already at least that many days.
  function expandHistory(symbol, dailyHistory, targetBars){
    const days = dailyHistory.length;
    if(days === 0 || targetBars <= days) return dailyHistory;
    const base = Math.floor(targetBars / days);
    const remainder = targetBars - base*days;
    const out = [];
    dailyHistory.forEach((day, i) => {
      const extra = (days - i) <= remainder ? 1 : 0;
      out.push(...splitDayIntoBars(symbol, day, base + extra));
    });
    return out;
  }

  function getQuote(symbol){
    const meta = tickerMeta(symbol);
    if(!meta) return null;
    const history = getHistory(symbol);
    const last = history[history.length-1];
    const prev = history[history.length-2];
    const changePct = ((last.close - prev.close) / prev.close) * 100;
    const avgVolume = Math.round(history.slice(-20).reduce((s,d)=>s+d.volume,0) / 20);
    return {
      symbol: meta.symbol,
      name: meta.name,
      sector: meta.sector,
      price: last.close,
      changePct,
      volume: last.volume,
      avgVolume
    };
  }

  function getAllQuotes(){
    return TICKERS.map(t=>getQuote(t.symbol));
  }

  function getNews(symbol, count){
    count = count || 6;
    const meta = tickerMeta(symbol);
    if(!meta) return [];
    const rng = mulberry32(hashCode(symbol+":news"));
    const items = [];
    const usedIdx = new Set();
    while(items.length < count && usedIdx.size < NEWS_TEMPLATES.length){
      const idx = Math.floor(rng()*NEWS_TEMPLATES.length);
      if(usedIdx.has(idx)) continue;
      usedIdx.add(idx);
      const tpl = NEWS_TEMPLATES[idx];
      const topic = NEWS_TOPICS[Math.floor(rng()*NEWS_TOPICS.length)];
      const headline = tpl.text
        .replaceAll("{name}", meta.name)
        .replaceAll("{sym}", meta.symbol)
        .replaceAll("{sector}", meta.sector)
        .replaceAll("{topic}", topic);
      const hoursAgo = Math.floor(rng()*72)+1;
      items.push({
        headline,
        sentiment: tpl.sent,
        source: SOURCES[Math.floor(rng()*SOURCES.length)],
        time: hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo/24)}d ago`,
        hoursAgo
      });
    }
    items.sort((a,b)=>a.hoursAgo-b.hoursAgo);
    return items;
  }

  // Swap point: replace this with a real Claude API call (price action + technicals +
  // news headlines fed into a prompt), cached per ticker on a schedule. Three phrasing
  // variants, picked per symbol, so the takes don't all read off the same fill-in-the-blank
  // template back to back.
  const AI_TAKE_VARIANTS = [
    (c) => `${c.name} has traded with ${c.volLabel} volatility this week, moving about ${c.volPct}% a day. `+
      `Shares are ${c.dirWord} ${c.pctAbs}% over that span, and coverage has leaned ${c.lean}, most recently on "${c.headline}." `+
      `Daily volume near ${c.avgVolM}M shares points to ${c.liquidityWord} liquidity.`,
    (c) => `${c.name} is ${c.dirWord} ${c.pctAbs}% this week on ${c.volLabel} volatility, moving roughly ${c.volPct}% a day. `+
      `The latest headline, "${c.headline}," fits a broader ${c.lean} tone in recent coverage. `+
      `Average volume of ${c.avgVolM}M shares a day points to ${c.liquidityWord} liquidity.`,
    (c) => `"${c.headline}" is the story behind ${c.symbol} right now, part of a ${c.lean} run in recent coverage. `+
      `The stock is ${c.dirWord} ${c.pctAbs}% this week, with ${c.volLabel} volatility (about ${c.volPct}% daily) `+
      `and ${c.liquidityWord} liquidity on ${c.avgVolM}M shares of average volume.`
  ];

  // Synthetic mock catalyst: swap point for a real earnings-calendar / events API.
  // Deterministic per symbol so it doesn't jump around on every render, always
  // 3-28 days out from today.
  function getNextCatalyst(symbol){
    const rng = mulberry32(hashCode(symbol + ":catalyst"));
    const daysOut = 3 + Math.floor(rng() * 26);
    const date = new Date();
    date.setDate(date.getDate() + daysOut);
    const types = ["Earnings", "Earnings", "Earnings", "Investor Day", "Product Event"];
    return {
      type: types[Math.floor(rng() * types.length)],
      daysOut,
      date: date.toISOString().slice(0,10)
    };
  }

  function getAISummary(symbol){
    const meta = tickerMeta(symbol);
    if(!meta) return "";
    const quote = getQuote(symbol);
    const history = getHistory(symbol);
    const news = getNews(symbol, 5);
    const returns = [];
    for(let i=1;i<history.length;i++) returns.push((history[i].close-history[i-1].close)/history[i-1].close);
    const week = history.slice(-6);
    const weekChangePct = ((week[week.length-1].close - week[0].close)/week[0].close)*100;
    const vol20 = Math.sqrt(returns.slice(-20).reduce((s,r)=>{const m=returns.slice(-20).reduce((a,b)=>a+b,0)/20; return s+Math.pow(r-m,2);},0)/20);
    const bullish = news.filter(n=>n.sentiment==="bullish").length;
    const bearish = news.filter(n=>n.sentiment==="bearish").length;

    const ctx = {
      name: meta.name,
      symbol: meta.symbol,
      dirWord: weekChangePct >= 0 ? "up" : "down",
      pctAbs: Math.abs(weekChangePct).toFixed(1),
      volLabel: describeVol(vol20),
      volPct: (vol20*100).toFixed(1),
      lean: bullish>bearish ? "bullish" : bearish>bullish ? "bearish" : "mixed",
      headline: news[0] ? news[0].headline : "no notable news this week",
      avgVolM: (quote.avgVolume/1e6).toFixed(1),
      liquidityWord: quote.avgVolume>15e6 ? "strong" : "moderate"
    };
    const variant = AI_TAKE_VARIANTS[Math.abs(hashCode(symbol)) % AI_TAKE_VARIANTS.length];
    return variant(ctx);
  }

  function searchTickers(query){
    const q = (query||"").trim().toUpperCase();
    if(!q) return [];
    return TICKERS.filter(t => t.symbol.includes(q) || t.name.toUpperCase().includes(q)).slice(0,8);
  }

  function getMostActive(limit){
    limit = limit || 12;
    return getAllQuotes().sort((a,b)=>b.volume-a.volume).slice(0,limit);
  }

  function getTrending(limit){
    limit = limit || 12;
    const quotes = getAllQuotes().map(q=>{
      const volSurge = q.volume / q.avgVolume;
      const trendScore = Math.abs(q.changePct)*4 + (volSurge-1)*30;
      return Object.assign({}, q, {volSurge, trendScore});
    });
    return quotes.sort((a,b)=>b.trendScore-a.trendScore).slice(0,limit);
  }

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.data = {
    TICKERS,
    getQuote,
    getAllQuotes,
    getHistory,
    expandHistory,
    getNextCatalyst,
    getNews,
    getAISummary,
    searchTickers,
    getMostActive,
    getTrending
  };
})();
