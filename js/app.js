(function(){
  "use strict";
  const data = window.SwingAI.data;
  const scoring = window.SwingAI.scoring;
  const strategy = window.SwingAI.strategy;
  const lessons = window.SwingAI.lessons;
  const portfolio = window.SwingAI.portfolio;
  const charts = window.SwingAI.charts;

  function fmtPrice(p){ return "$" + p.toFixed(p < 10 ? 3 : 2); }
  function fmtChange(pct){ return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%"; }
  function fmtVolume(v){
    if(v >= 1e9) return (v/1e9).toFixed(2) + "B";
    if(v >= 1e6) return (v/1e6).toFixed(1) + "M";
    if(v >= 1e3) return (v/1e3).toFixed(0) + "K";
    return String(v);
  }
  function changeClass(pct){ return pct >= 0 ? "up" : "down"; }
  function initials(symbol){ return symbol.slice(0,2); }

  function swingQualitative(score){
    if(score < 34) return "Steady";
    if(score < 67) return "Active";
    return "Volatile";
  }
  function fmtDelta(delta){ return (delta >= 0 ? "+" : "−") + fmtPrice(Math.abs(delta)); }

  // ---- Ticker tape (all pages) ----
  function initTickerTape(){
    const track = document.getElementById("tickerTrack");
    if(!track) return;
    const quotes = data.getAllQuotes();
    const itemsHtml = quotes.map(q => `
      <span class="ticker-item">
        <span class="t-sym">${q.symbol}</span>
        <span class="mono">${fmtPrice(q.price)}</span>
        <span class="t-chg mono ${changeClass(q.changePct)}">${fmtChange(q.changePct)}</span>
      </span>`).join("");
    // duplicate the list so the CSS 0%->-50% loop is seamless
    track.innerHTML = itemsHtml + itemsHtml;
  }

  // ---- Watchlist (local, decorative; no account/portfolio behind it) ----
  const WATCHLIST_KEY = "swingai_watchlist";
  function getWatchlist(){
    try{ return new Set(JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]")); }
    catch(e){ return new Set(); }
  }
  function setWatchlist(set){ localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...set])); }

  // ---- Chart time ranges: always slices from the one canonical history ----
  const RANGES = [
    { key:"1W", days:7, label:"past week", targetBars:40 },
    { key:"1M", days:30, label:"past month", targetBars:40 },
    { key:"3M", days:90, label:"past 3 months", targetBars:60 },
    { key:"6M", days:180, label:"past 6 months", targetBars:60 },
    { key:"1Y", days:365, label:"past year", targetBars:60 },
    { key:"ALL", days:Infinity, label:"all time", targetBars:60 }
  ];

  const detailState = { symbol:null, fullHistory:null, range:"3M" };

  // Every range targets a bar count on the chart: ranges with more days than
  // that get bucketed into coarser candles (weekly, monthly, ...); ranges with
  // fewer days (1W, 1M) get expanded into synthetic intraday bars instead of
  // rendering a sparse 7- or 30-candle chart.
  function aggregateOHLC(history, maxBars){
    if(history.length <= maxBars) return history;
    const bucketSize = Math.ceil(history.length / maxBars);
    const out = [];
    for(let i=0; i<history.length; i+=bucketSize){
      const chunk = history.slice(i, i+bucketSize);
      out.push({
        date: chunk[chunk.length-1].date,
        open: chunk[0].open,
        high: Math.max(...chunk.map(d=>d.high)),
        low: Math.min(...chunk.map(d=>d.low)),
        close: chunk[chunk.length-1].close,
        volume: chunk.reduce((s,d)=>s+d.volume, 0)
      });
    }
    return out;
  }

  function applyRange(rangeKey){
    detailState.range = rangeKey;
    document.querySelectorAll("#rangeTabs button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.range === rangeKey);
    });
    const cfg = RANGES.find(r => r.key === rangeKey) || RANGES[2];
    const slice = cfg.days === Infinity ? detailState.fullHistory : detailState.fullHistory.slice(-cfg.days);
    const chartSlice = slice.length < cfg.targetBars
      ? data.expandHistory(detailState.symbol, slice, cfg.targetBars)
      : aggregateOHLC(slice, cfg.targetBars);

    charts.renderPriceChart(document.getElementById("chartBox"), chartSlice, detailState.symbol, {
      onScrub(point){ updateHero(slice, point, true); },
      onLeave(){ updateHero(slice, slice[slice.length-1], false, cfg.label); }
    });
    updateHero(slice, slice[slice.length-1], false, cfg.label);
  }

  function updateHero(slice, point, scrubbing, periodLabel){
    const startPrice = slice[0].close;
    const delta = point.close - startPrice;
    const deltaPct = (delta / startPrice) * 100;
    document.getElementById("qPrice").textContent = fmtPrice(point.close);
    const chgEl = document.getElementById("qChange");
    chgEl.textContent = `${fmtDelta(delta)} (${fmtChange(deltaPct)})`;
    chgEl.className = "price-delta " + changeClass(delta);
    document.getElementById("qPeriodLabel").textContent = scrubbing ? "" : periodLabel;
  }

  // ---- Ticker detail (used on index.html) ----
  function renderTickerDetail(symbol){
    const quote = data.getQuote(symbol);
    if(!quote) return;
    const fullHistory = data.getHistory(symbol);
    const swing = scoring.computeSwingScore(fullHistory);
    const risk = scoring.computeRiskScore(fullHistory);
    const news = data.getNews(symbol);
    const aiTake = data.getAISummary(symbol);
    const today = fullHistory[fullHistory.length-1];
    const yearSlice = fullHistory.slice(-365);
    const wLow = Math.min(...yearSlice.map(d=>d.low));
    const wHigh = Math.max(...yearSlice.map(d=>d.high));

    document.getElementById("detailPanel").hidden = false;
    document.getElementById("qAvatar").textContent = initials(quote.symbol);
    document.getElementById("qSym").textContent = quote.symbol;
    document.getElementById("qName").textContent = quote.name + " · " + quote.sector;

    document.getElementById("stOpen").textContent = fmtPrice(today.open);
    document.getElementById("stDayRange").textContent = fmtPrice(today.low) + " – " + fmtPrice(today.high);
    document.getElementById("st52w").textContent = fmtPrice(wLow) + " – " + fmtPrice(wHigh);
    const todayChgEl = document.getElementById("stTodayChg");
    todayChgEl.textContent = fmtChange(quote.changePct);
    todayChgEl.className = changeClass(quote.changePct);
    document.getElementById("stVolume").textContent = fmtVolume(quote.volume);
    document.getElementById("stAvgVolume").textContent = fmtVolume(quote.avgVolume);

    const watchBtn = document.getElementById("watchlistBtn");
    const watching = getWatchlist().has(symbol);
    watchBtn.classList.toggle("active", watching);
    watchBtn.setAttribute("aria-pressed", String(watching));
    watchBtn.onclick = () => {
      const set = getWatchlist();
      if(set.has(symbol)) set.delete(symbol); else set.add(symbol);
      setWatchlist(set);
      watchBtn.classList.toggle("active", set.has(symbol));
      watchBtn.setAttribute("aria-pressed", String(set.has(symbol)));
    };

    charts.renderGauge(document.getElementById("swingGauge"), swing.score, "swing", swingQualitative(swing.score));
    document.getElementById("swingDetail").textContent =
      `10/20/50-day volatility ${swing.vol10Pct.toFixed(1)}% / ${swing.vol20Pct.toFixed(1)}% / ${swing.vol50Pct.toFixed(1)}% · `+
      `${swing.bigSwingCount} moves of 5%+ in last ${swing.bigSwingWindowDays} sessions`;

    charts.renderGauge(document.getElementById("riskGauge"), risk.score, "risk", risk.label);
    document.getElementById("riskDetail").textContent =
      `20-day volatility ${risk.vol20Pct.toFixed(1)}% · avg volume ${fmtVolume(risk.avgVolume)}/day`;

    document.getElementById("aiTakeText").textContent = aiTake;
    resetBreakdownPanel();

    const newsList = document.getElementById("newsList");
    newsList.innerHTML = news.map((n,i) => `
      <div class="news-item" style="--i:${i}">
        <div class="headline"></div>
        <div class="news-meta">
          <span class="sent sent-${n.sentiment}"><span class="badge-dot"></span>${n.sentiment}</span>
          <span>${n.source}</span>
          <span>·</span>
          <span>${n.time}</span>
        </div>
      </div>`).join("");
    // headline text is untrusted-shaped data (mock now, real copy later) -> textContent, not innerHTML
    newsList.querySelectorAll(".news-item").forEach((el, i) => {
      el.querySelector(".headline").textContent = news[i].headline;
    });

    detailState.symbol = symbol;
    detailState.fullHistory = fullHistory;
    applyRange(detailState.range);

    const url = new URL(window.location);
    url.searchParams.set("symbol", symbol);
    window.history.replaceState({}, "", url);
  }

  // ---- Full breakdown (8-step trade plan, built from price/volume history) ----
  function resetBreakdownPanel(){
    const panel = document.getElementById("breakdownPanel");
    const btn = document.getElementById("breakdownBtn");
    if(!panel || !btn) return;
    panel.hidden = true;
    document.getElementById("breakdownDivider").hidden = true;
    btn.textContent = "Full Breakdown";
    btn.classList.remove("active");
  }

  function renderBreakdown(symbol){
    const quote = data.getQuote(symbol);
    const fullHistory = data.getHistory(symbol);
    const catalyst = data.getNextCatalyst(symbol);
    const bd = strategy.computeBreakdown(symbol, fullHistory, quote, catalyst);
    const catalystDate = new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric" }).format(new Date(catalyst.date));
    const today = new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", year:"numeric" }).format(new Date());

    document.getElementById("bdMeta").textContent = `${symbol} · Generated ${today}`;

    const verdictEl = document.getElementById("bdVerdict");
    const verdicts = {
      Uptrend: { text:"Setup valid", cls:"verdict-good" },
      Consolidating: { text:"Neutral, wait", cls:"verdict-warn" },
      Downtrend: { text:"Avoid", cls:"verdict-bad" }
    };
    const verdict = verdicts[bd.trend.status];
    verdictEl.textContent = verdict.text;
    verdictEl.className = "bd-verdict " + verdict.cls;

    document.getElementById("bdEntryVal").textContent = fmtPrice(bd.trade.entry);
    document.getElementById("bdStopVal").textContent = `${fmtPrice(bd.trade.stop)} (${bd.trade.riskPct.toFixed(1)}%)`;
    document.getElementById("bdTargetVal").textContent = fmtPrice(bd.trade.target);
    document.getElementById("bdRRVal").textContent = `${bd.trade.rewardRatio.toFixed(1)} : 1`;
    document.getElementById("bdParamsTable").classList.toggle("muted", bd.trend.skip);

    const volMoveWord = bd.volatility20Pct >= 3.5 ? "sharp" : bd.volatility20Pct >= 2 ? "solid" : "modest";
    document.getElementById("bdCatalyst").textContent =
      `${symbol}'s next ${catalyst.type.toLowerCase()} lands around ${catalystDate}, ${catalyst.daysOut} days from now, right inside the 1 to 3 week window this setup wants. It's been a ${volMoveWord} mover lately too, averaging ${bd.volatility20Pct.toFixed(1)}% of daily movement over the last 20 sessions, so the catalyst alone could move it more than a typical day would.`;

    const pctSma50 = Math.abs(bd.trend.pctVsSma50).toFixed(1);
    const pctSma200 = Math.abs(bd.trend.pctVsSma200).toFixed(1);
    const trendLines = {
      Uptrend: `${symbol} is holding a confirmed uptrend: it's ${pctSma50}% above its 50-day average (${fmtPrice(bd.trend.sma50)}) and ${pctSma200}% above its 200-day (${fmtPrice(bd.trend.sma200)}), with higher highs and higher lows over the past two months.`,
      Consolidating: `${symbol} is sitting ${pctSma50}% ${bd.trend.aboveSma50 ? "above" : "below"} its 50-day average and ${pctSma200}% ${bd.trend.aboveSma200 ? "above" : "below"} its 200-day, without the clean higher-highs-higher-lows pattern this setup wants yet. Call the trend mixed for now.`,
      Downtrend: `${symbol} is trading ${pctSma50}% below its 50-day average and ${pctSma200}% below its 200-day. By this framework's own rule that's broken down: skip it, no matter how good the catalyst looks.`
    };
    document.getElementById("bdTrend").textContent = trendLines[bd.trend.status];

    const volChangeAbs = Math.abs(bd.levels.volume.changePct).toFixed(0);
    const volLine = bd.levels.volume.dryingUp
      ? `volume has cooled ${volChangeAbs}% over the last week, which is what exhausted selling on a pullback tends to look like`
      : `volume is actually running ${volChangeAbs}% hotter than a week ago, so sellers don't look tired yet`;
    document.getElementById("bdPullback").textContent =
      `The level to watch is the ${bd.levels.keyLevel.name}, at ${fmtPrice(bd.levels.keyLevel.value)}, about ${Math.abs(bd.levels.pctToKeyLevel).toFixed(1)}% ${bd.levels.pctToKeyLevel < 0 ? "below" : "above"} where it's trading now. And ${volLine}.`;

    document.getElementById("bdEntry").textContent =
      `Wait for a bounce off ${fmtPrice(bd.trade.entry)}, about ${Math.abs(bd.trade.pctToEntry).toFixed(1)}% ${bd.trade.pctToEntry < 0 ? "below" : "above"} the current price, ideally on a pickup in volume. Keep it small (5 to 10% of the portfolio at most for one swing trade) and use a limit order, not a market order.`;

    document.getElementById("bdStop").textContent =
      `${fmtPrice(bd.trade.stop)}. That's ${bd.trade.riskPct.toFixed(1)}% below entry and just under the recent swing low. If price trades through it, the thesis is wrong: exit, no averaging down, no arguing with it.`;

    document.getElementById("bdTarget").textContent =
      `${fmtPrice(bd.trade.target)}, near the next resistance level and about ${bd.trade.pctUpside.toFixed(1)}% above entry, roughly ${bd.trade.rewardRatio.toFixed(1)}:1 reward to risk. Set the limit sell there up front so emotions don't get a vote later.`;

    const runDir = bd.manage.runUp10d >= 0 ? "up" : "down";
    const runAbs = Math.abs(bd.manage.runUp10d).toFixed(1);
    document.getElementById("bdManage").textContent = bd.manage.alreadyRanHard
      ? `${symbol} is already up ${runAbs}% over the past two weeks heading into the catalyst, so some of the move may be priced in already. Worth trimming some size before the news lands rather than holding it all.`
      : `${symbol} is ${runDir} ${runAbs}% over the past two weeks, so there's less of the move priced in so far. Watch the news flow as it works toward the target, and ${catalyst.type === "Earnings" ? "remember earnings are a binary event: don't hold through the print unless a coin-flip outcome is fine with you." : "don't hold blindly into the event either way."}`;

    // Earnings gets exited before the print (per step 7), so it can't also "gap up
    // and sell into strength", that would mean still holding through the report.
    // Non-earnings catalysts (investor days, product events) can be held through.
    document.getElementById("bdExit").textContent = catalyst.type === "Earnings"
      ? `Since the catalyst here is earnings, the position should already be flat before the print, per step 7. Ahead of that: price reaches the ${fmtPrice(bd.trade.target)} target, sell. The ${fmtPrice(bd.trade.stop)} stop breaks first, sell immediately, no averaging down.`
      : `Three ways this ends. Price reaches the ${fmtPrice(bd.trade.target)} target: sell. The catalyst lands and the stock gaps above it: sell into the strength instead of getting greedy. The ${fmtPrice(bd.trade.stop)} stop breaks: sell immediately, no exceptions.`;

    document.getElementById("bdSkipBanner").hidden = !bd.trend.skip;
  }

  function initBreakdownButton(){
    const btn = document.getElementById("breakdownBtn");
    const panel = document.getElementById("breakdownPanel");
    if(!btn || !panel) return;
    btn.addEventListener("click", () => {
      const opening = panel.hidden;
      if(opening) renderBreakdown(detailState.symbol);
      panel.hidden = !opening;
      document.getElementById("breakdownDivider").hidden = !opening;
      btn.textContent = opening ? "Hide Breakdown" : "Full Breakdown";
      btn.classList.toggle("active", opening);
    });
  }

  function initSearchPage(){
    const input = document.getElementById("tickerSearch");
    const results = document.getElementById("searchResults");
    if(!input) return;

    function closeResults(){ results.classList.remove("open"); results.innerHTML=""; }

    input.addEventListener("input", () => {
      const matches = data.searchTickers(input.value);
      if(!matches.length){ closeResults(); return; }
      results.innerHTML = matches.map(m => {
        const q = data.getQuote(m.symbol);
        return `<div class="search-result-row" data-symbol="${m.symbol}">
          <div class="sr-left"><span class="sym">${m.symbol}</span><span class="name">${m.name}</span></div>
          <div><div class="sr-price">${fmtPrice(q.price)}</div><div class="sr-chg mono ${changeClass(q.changePct)}">${fmtChange(q.changePct)}</div></div>
        </div>`;
      }).join("");
      results.classList.add("open");
    });

    results.addEventListener("click", (e) => {
      const row = e.target.closest(".search-result-row");
      if(!row) return;
      input.value = row.dataset.symbol;
      closeResults();
      renderTickerDetail(row.dataset.symbol);
    });

    document.addEventListener("click", (e) => {
      if(!e.target.closest(".search-wrap")) closeResults();
    });

    document.querySelectorAll(".chip[data-symbol]").forEach(chip => {
      chip.addEventListener("click", () => {
        input.value = chip.dataset.symbol;
        renderTickerDetail(chip.dataset.symbol);
      });
    });

    document.querySelectorAll("#rangeTabs button").forEach(btn => {
      btn.addEventListener("click", () => applyRange(btn.dataset.range));
    });

    input.addEventListener("keydown", (e) => {
      if(e.key === "Enter"){
        const val = input.value.trim().toUpperCase();
        if(data.getQuote(val)){ closeResults(); renderTickerDetail(val); }
      }
    });

    const params = new URLSearchParams(window.location.search);
    const initial = params.get("symbol");
    if(initial && data.getQuote(initial)){
      input.value = initial;
      renderTickerDetail(initial);
    } else {
      renderTickerDetail("AAPL");
      input.value = "AAPL";
    }
  }

  // ---- List rendering (active.html / trending.html) ----
  function renderList(containerEl, quotes, opts){
    opts = opts || {};
    if(!quotes.length){
      containerEl.innerHTML = `<div class="empty-state">No tickers to show.</div>`;
      return;
    }
    containerEl.innerHTML = quotes.map((q, i) => {
      const swing = scoring.computeSwingScore(data.getHistory(q.symbol));
      const sub = opts.subLine ? opts.subLine(q) : fmtVolume(q.volume) + " vol";
      return `
      <a class="list-row" style="--i:${i}" href="index.html?symbol=${q.symbol}">
        <div class="list-rank">${i+1}</div>
        <div class="list-avatar">${initials(q.symbol)}</div>
        <div class="list-main">
          <div class="list-id">
            <div class="list-sym">${q.symbol}</div>
            <div class="list-name"></div>
          </div>
          <div class="list-spark" data-symbol="${q.symbol}"></div>
        </div>
        <div class="list-swing">
          <div class="swing-icon" data-score="${swing.score}"></div>
          <div class="list-swing-value">${swing.score}</div>
          <div class="list-swing-qual" style="color:${charts.swingColor(swing.score)}">${swingQualitative(swing.score)}</div>
        </div>
        <div class="list-stats">
          <div class="list-px mono">${fmtPrice(q.price)}</div>
          <div class="list-chg ${changeClass(q.changePct)}">${fmtChange(q.changePct)}</div>
          <div class="list-sub">${sub}</div>
        </div>
      </a>`;
    }).join("");
    containerEl.querySelectorAll(".list-name").forEach((el, i) => { el.textContent = quotes[i].name; });
    containerEl.querySelectorAll(".list-spark").forEach(el => {
      charts.renderSparkline(el, data.getHistory(el.dataset.symbol).slice(-30));
    });
    containerEl.querySelectorAll(".swing-icon").forEach(el => {
      charts.renderSwingIcon(el, Number(el.dataset.score));
    });
  }

  function initActivePage(){
    const el = document.getElementById("activeList");
    if(!el) return;
    renderList(el, data.getMostActive(15));
  }

  // ---- Trending: ranked by 21/50 EMA pullback fit (weighted higher) + volatility ----
  const trendState = { ranked: [] };

  function computeEmaRanking(limit){
    const scored = data.TICKERS.map(t => {
      const history = data.getHistory(t.symbol);
      const quote = data.getQuote(t.symbol);
      const setup = strategy.computeEmaSetup(history, quote.price);
      const swing = scoring.computeSwingScore(history);
      const combined = setup.score * 0.65 + swing.score * 0.35;
      return Object.assign({}, quote, { setup, swingScore: swing.score, combined });
    });
    scored.sort((a,b) => b.combined - a.combined);
    return scored.slice(0, limit || 10);
  }

  function renderTrendFeatured(item){
    const history = data.getHistory(item.symbol);
    document.getElementById("trendAvatar").textContent = initials(item.symbol);
    document.getElementById("trendSym").textContent = item.symbol;
    document.getElementById("trendName").textContent = item.name + " · " + item.sector;
    document.getElementById("trendPrice").textContent = fmtPrice(item.price);
    const chgEl = document.getElementById("trendChange");
    chgEl.textContent = fmtChange(item.changePct) + " today";
    chgEl.className = "price-delta " + changeClass(item.changePct);

    charts.renderPriceChart(document.getElementById("trendChartBox"), history.slice(-90), item.symbol);

    document.getElementById("trendSetupScoreVal").textContent = item.setup.score;
    document.getElementById("trendVolScoreVal").textContent = item.swingScore;

    const s = item.setup;
    let note;
    if(!s.trendUp){
      note = `${item.symbol}'s 21-day EMA (${fmtPrice(s.ema21)}) is below its 50-day (${fmtPrice(s.ema50)}), so there's no established uptrend to pull back within right now, no valid 21/50 setup here.`;
    } else {
      const nearestLabel = Math.abs(s.distTo21Pct) <= Math.abs(s.distTo50Pct) ? "21-day EMA" : "50-day EMA";
      const holding = s.aboveEma50 ? "Price is holding above both averages." : "Price has slipped back below the 50-day, a deeper pullback than this setup wants.";
      note = `${item.symbol} is trading ${Math.abs(s.nearestAbsPct).toFixed(1)}% from its ${nearestLabel} (21-day ${fmtPrice(s.ema21)}, 50-day ${fmtPrice(s.ema50)}), with the 21-day sitting ${s.spreadPct.toFixed(1)}% above the 50-day. ${holding}`;
    }
    document.getElementById("trendSetupNote").textContent = note;

    document.querySelectorAll(".trend-square").forEach(sq => {
      sq.classList.toggle("active", sq.dataset.symbol === item.symbol);
    });
  }

  function renderTrendGrid(ranked){
    const grid = document.getElementById("trendGrid");
    grid.innerHTML = ranked.map((item,i) => `
      <button type="button" class="trend-square" data-symbol="${item.symbol}" style="--i:${i}">
        <div class="trend-sq-top">
          <span class="trend-sq-rank">${i+1}</span>
          <span class="trend-sq-chg ${changeClass(item.changePct)}">${fmtChange(item.changePct)}</span>
        </div>
        <div class="trend-sq-spark" data-symbol="${item.symbol}"></div>
        <div class="trend-sq-sym">${item.symbol}</div>
        <div class="trend-sq-score">Setup ${item.setup.score}</div>
      </button>`).join("");
    grid.querySelectorAll(".trend-sq-spark").forEach(el => {
      charts.renderSparkline(el, data.getHistory(el.dataset.symbol).slice(-30));
    });
    grid.querySelectorAll(".trend-square").forEach(sq => {
      sq.addEventListener("click", () => {
        const item = trendState.ranked.find(r => r.symbol === sq.dataset.symbol);
        if(item) renderTrendFeatured(item);
      });
    });
  }

  function initTrendingPage(){
    const grid = document.getElementById("trendGrid");
    if(!grid) return;
    const ranked = computeEmaRanking(10);
    trendState.ranked = ranked;
    renderTrendGrid(ranked);
    renderTrendFeatured(ranked[0]);
  }

  // ---- Study tab: lesson list + full-screen slide viewer ----
  const STUDY_KEY = "swingai_study_progress";
  function getCompletedLessons(){
    try{ return new Set(JSON.parse(localStorage.getItem(STUDY_KEY) || "[]")); }
    catch(e){ return new Set(); }
  }
  function markLessonCompleted(id){
    const set = getCompletedLessons();
    set.add(id);
    localStorage.setItem(STUDY_KEY, JSON.stringify([...set]));
  }

  const studyState = { lessonId:null, index:0 };

  function renderLessonList(){
    const container = document.getElementById("lessonList");
    if(!container) return;
    const completed = getCompletedLessons();
    const list = lessons.LESSONS;
    if(!list.length){
      container.innerHTML = `<div class="empty-state">More lessons are on the way.</div>`;
      return;
    }
    container.innerHTML = list.map((l,i) => {
      const done = completed.has(l.id);
      const rightIcon = done
        ? `<div class="lesson-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>`
        : `<div class="lesson-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></div>`;
      return `
      <div class="lesson-row" data-lesson="${l.id}" style="--i:${i}">
        <div class="lesson-thumb" style="background-image:url('${l.thumb}')"></div>
        <div class="lesson-info">
          <div class="lesson-title"></div>
          <div class="lesson-sub">${l.slides.length} slides${done ? " · Completed" : ""}</div>
        </div>
        ${rightIcon}
      </div>`;
    }).join("");
    container.querySelectorAll(".lesson-title").forEach((el,i) => { el.textContent = list[i].title; });
    container.querySelectorAll(".lesson-row").forEach(row => {
      row.addEventListener("click", () => openLesson(row.dataset.lesson));
    });
  }

  function renderSlide(){
    const lesson = lessons.getLesson(studyState.lessonId);
    if(!lesson) return;
    const imageSrc = lesson.slides[studyState.index];

    // The slide images already carry their own title/label, so the viewer
    // stays out of the way: just the image, a progress bar, and controls.
    const imgEl = document.getElementById("lvImage");
    imgEl.src = imageSrc;
    imgEl.alt = `${lesson.title}, slide ${studyState.index + 1} of ${lesson.slides.length}`;
    imgEl.style.animation = "none";
    void imgEl.offsetWidth;
    imgEl.style.animation = "";

    document.getElementById("lvProgress").innerHTML = lesson.slides
      .map((_,i) => `<span class="lv-seg ${i <= studyState.index ? "filled" : ""}"></span>`).join("");

    document.getElementById("lvBack").disabled = studyState.index === 0;
    document.getElementById("lvNext").textContent = studyState.index === lesson.slides.length - 1 ? "Finish" : "Next";
  }

  function openLesson(id){
    if(!lessons.getLesson(id)) return;
    studyState.lessonId = id;
    studyState.index = 0;
    document.getElementById("lessonListView").hidden = true;
    document.getElementById("lessonViewerView").hidden = false;
    document.getElementById("mainNav").hidden = true;
    renderSlide();
  }

  function closeLesson(){
    document.getElementById("lessonViewerView").hidden = true;
    document.getElementById("lessonListView").hidden = false;
    document.getElementById("mainNav").hidden = false;
    renderLessonList();
  }

  function initStudyPage(){
    const list = document.getElementById("lessonList");
    if(!list) return;
    renderLessonList();

    document.getElementById("lvClose").addEventListener("click", closeLesson);
    document.getElementById("lvBack").addEventListener("click", () => {
      if(studyState.index > 0){ studyState.index--; renderSlide(); }
    });
    document.getElementById("lvNext").addEventListener("click", () => {
      const lesson = lessons.getLesson(studyState.lessonId);
      if(studyState.index < lesson.slides.length - 1){
        studyState.index++;
        renderSlide();
      } else {
        markLessonCompleted(studyState.lessonId);
        closeLesson();
      }
    });
    document.getElementById("lvProgress").addEventListener("click", (e) => {
      const seg = e.target.closest(".lv-seg");
      if(!seg) return;
      const segs = [...document.querySelectorAll(".lv-seg")];
      studyState.index = segs.indexOf(seg);
      renderSlide();
    });
  }

  // ---- Account: AI portfolio, trade history, aggregated news, share card ----
  const dateFmtShort = new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric" });
  function fmtMoney(v){ return "$" + v.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function fmtSignedMoney(v){ return (v >= 0 ? "+" : "−") + fmtMoney(Math.abs(v)); }

  function renderPortfolioSummary(pf){
    document.getElementById("pfValue").textContent = fmtMoney(pf.totalValue);
    const deltaEl = document.getElementById("pfDelta");
    deltaEl.textContent = `${fmtSignedMoney(pf.totalPL)} (${fmtChange(pf.totalPLPct)})`;
    deltaEl.className = "ps-delta " + changeClass(pf.totalPL);
    document.getElementById("pfStartSub").textContent = `since ${fmtMoney(pf.startingCapital)} start`;
  }

  function renderHoldings(pf){
    const container = document.getElementById("holdingsList");
    if(!container) return;
    if(!pf.openTrades.length){
      container.innerHTML = `<div class="empty-state">No open positions right now.</div>`;
      return;
    }
    container.innerHTML = pf.openTrades.map((t,i) => `
      <a class="list-row" style="--i:${i}" href="index.html?symbol=${t.symbol}">
        <div class="list-avatar">${initials(t.symbol)}</div>
        <div class="list-main">
          <div class="list-id">
            <div class="list-sym">${t.symbol}</div>
            <div class="list-name"></div>
          </div>
        </div>
        <div class="list-stats">
          <div class="list-chg ${changeClass(t.plPct)}">${fmtChange(t.plPct)}</div>
          <div class="list-sub mono">${fmtSignedMoney(t.pl)}</div>
        </div>
      </a>`).join("");
    container.querySelectorAll(".list-name").forEach((el,i) => {
      el.textContent = `${pf.openTrades[i].name} · ${pf.openTrades[i].shares.toFixed(2)} sh`;
    });
  }

  function renderTrades(pf){
    const container = document.getElementById("tradesList");
    if(!container) return;
    container.innerHTML = pf.trades.map((t,i) => `
      <div class="trade-row" style="--i:${i}">
        <div class="list-avatar">${initials(t.symbol)}</div>
        <div class="trade-main">
          <div class="trade-top">
            <span class="trade-sym">${t.symbol}</span>
            <span class="trade-badge trade-badge-${t.status}">${t.status === "closed" ? "Closed" : "Open"}</span>
          </div>
          <div class="trade-reason"></div>
          <div class="trade-meta"></div>
        </div>
        <div class="trade-stats">
          <div class="trade-pl ${changeClass(t.plPct)}">${fmtChange(t.plPct)}</div>
          <div class="trade-plabs mono">${fmtSignedMoney(t.pl)}</div>
          <button class="trade-share-btn" data-idx="${i}" type="button" aria-label="Share this trade">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>
          </button>
        </div>
      </div>`).join("");
    container.querySelectorAll(".trade-reason").forEach((el,i) => { el.textContent = pf.trades[i].reason; });
    container.querySelectorAll(".trade-meta").forEach((el,i) => {
      const t = pf.trades[i];
      el.textContent = t.status === "closed"
        ? `Bought ${fmtPrice(t.entryPrice)} on ${dateFmtShort.format(new Date(t.entryDate))}, sold ${fmtPrice(t.exitPrice)} on ${dateFmtShort.format(new Date(t.exitDate))}`
        : `Bought ${fmtPrice(t.entryPrice)} on ${dateFmtShort.format(new Date(t.entryDate))}, holding at ${fmtPrice(t.currentPrice)}`;
    });
    container.querySelectorAll(".trade-share-btn").forEach(btn => {
      btn.addEventListener("click", () => openShareModal(pf.trades[Number(btn.dataset.idx)]));
    });
  }

  function renderAccountNews(pf){
    const container = document.getElementById("acctNewsList");
    if(!container) return;
    let items = [];
    pf.trades.map(t => t.symbol).forEach(sym => {
      data.getNews(sym, 2).forEach(n => items.push(Object.assign({ symbol: sym }, n)));
    });
    items.sort((a,b) => a.hoursAgo - b.hoursAgo);
    items = items.slice(0, 14);
    if(!items.length){
      container.innerHTML = `<div class="empty-state">No recent headlines.</div>`;
      return;
    }
    container.innerHTML = items.map((n,i) => `
      <div class="news-item" style="--i:${i}">
        <div class="acct-news-sym mono">${n.symbol}</div>
        <div class="headline"></div>
        <div class="news-meta">
          <span class="sent sent-${n.sentiment}"><span class="badge-dot"></span>${n.sentiment}</span>
          <span>${n.source}</span>
          <span>·</span>
          <span>${n.time}</span>
        </div>
      </div>`).join("");
    container.querySelectorAll(".headline").forEach((el,i) => { el.textContent = items[i].headline; });
  }

  function openShareModal(trade){
    const isClosed = trade.status === "closed";
    const markPrice = isClosed ? trade.exitPrice : trade.currentPrice;
    const inner = document.getElementById("shareCardInner");
    inner.innerHTML = `
      <div class="share-brand"><span class="brand-mark">S</span> SwingAI</div>
      <div class="share-sym">${trade.symbol}</div>
      <div class="share-name"></div>
      <div class="share-pl ${changeClass(trade.plPct)}">${fmtChange(trade.plPct)}</div>
      <div class="share-abs mono">${fmtSignedMoney(trade.pl)}</div>
      <div class="share-range mono">${fmtPrice(trade.entryPrice)} → ${fmtPrice(markPrice)}</div>
      <div class="share-reason"></div>
      <div class="share-tag">${isClosed ? "Closed position" : "Open position"} · AI Portfolio</div>`;
    inner.querySelector(".share-name").textContent = trade.name;
    inner.querySelector(".share-reason").textContent = trade.reason;

    const backdrop = document.getElementById("shareBackdrop");
    backdrop.hidden = false;
    backdrop.dataset.trade = JSON.stringify({
      symbol: trade.symbol, plPct: trade.plPct,
      entryPrice: trade.entryPrice, markPrice, reason: trade.reason
    });
  }
  function closeShareModal(){ document.getElementById("shareBackdrop").hidden = true; }

  function initShareModal(){
    const backdrop = document.getElementById("shareBackdrop");
    if(!backdrop) return;
    document.getElementById("shareClose").addEventListener("click", closeShareModal);
    backdrop.addEventListener("click", (e) => { if(e.target === backdrop) closeShareModal(); });
    document.getElementById("shareCopyBtn").addEventListener("click", () => {
      const t = JSON.parse(backdrop.dataset.trade || "{}");
      if(!t.symbol) return;
      const summary = `SwingAI, AI Portfolio\n${t.symbol} ${t.plPct >= 0 ? "up" : "down"} ${Math.abs(t.plPct).toFixed(1)}% (${fmtPrice(t.entryPrice)} to ${fmtPrice(t.markPrice)})\n${t.reason}`;
      const btn = document.getElementById("shareCopyBtn");
      const original = btn.textContent;
      const done = () => { btn.textContent = "Copied"; setTimeout(() => { btn.textContent = original; }, 1600); };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(summary).then(done).catch(done);
      } else {
        done();
      }
    });
  }

  function initAccountTabs(){
    const tabs = document.getElementById("acctTabs");
    if(!tabs) return;
    const panels = { portfolio: document.getElementById("tabPortfolio"), trades: document.getElementById("tabTrades"), news: document.getElementById("tabNews") };
    tabs.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        tabs.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
        Object.keys(panels).forEach(key => { panels[key].hidden = key !== btn.dataset.tab; });
      });
    });
  }

  function initAccountPage(){
    const summaryEl = document.getElementById("pfValue");
    if(!summaryEl || !portfolio) return;
    const pf = portfolio.getPortfolio();
    renderPortfolioSummary(pf);
    renderHoldings(pf);
    renderTrades(pf);
    renderAccountNews(pf);
    initAccountTabs();
    initShareModal();
  }

  // ---- Site-wide "AI just traded" toast ----
  function showAiToast(message){
    const toast = document.createElement("a");
    toast.href = "portfolio.html";
    toast.className = "ai-toast";
    toast.innerHTML = `<span class="ai-toast-dot"></span><span class="ai-toast-text"></span><span class="ai-toast-cta">View</span>`;
    toast.querySelector(".ai-toast-text").textContent = message;
    document.body.appendChild(toast);
    // Direct inline-style writes (not a class-toggle) so the shown/hidden state
    // is correct even where the transition itself can't be trusted to run, same
    // fix as the gauge/chart reveal animations elsewhere in the app.
    void toast.offsetWidth;
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, 0)";
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%, -120%)";
      setTimeout(() => toast.remove(), 400);
    }, 6000);
  }

  function initAiTradeAlert(){
    if(!portfolio) return;
    const pf = portfolio.getPortfolio();
    if(!pf.trades.length) return;
    const latest = pf.trades[0];
    const latestId = latest.symbol + "-" + (latest.exitDate || latest.entryDate);
    const key = "swingai_last_seen_trade";
    if(localStorage.getItem(key) === latestId) return;
    localStorage.setItem(key, latestId);

    const verb = latest.status === "closed" ? "sold" : "bought";
    const price = latest.status === "closed" ? latest.exitPrice : latest.entryPrice;
    showAiToast(`AI just ${verb} ${latest.symbol} at ${fmtPrice(price)}`);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTickerTape();
    initBreakdownButton();
    initSearchPage();
    initActivePage();
    initTrendingPage();
    initStudyPage();
    initAccountPage();
    initAiTradeAlert();
  });
})();
