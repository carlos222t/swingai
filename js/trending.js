/* Trending tab: runs a single combined screener over real Twelve Data market
   data (marketData.js) and renders it as a sortable stats table. A stock
   qualifies if its 21 EMA sits 0-3% above price (Momentum: hasn't reclaimed
   it yet) or 0-3% below price (Pullback: resting on it as support), tagged
   per row via the Setup column. Fundamentals (P/E, EPS, div yield) load in
   the background after the price/EMA data, so the table re-renders as
   marketData fills each one in. */
(function(){
  "use strict";
  const market = window.SwingAI.market;

  const PAGE_SUB = "Ten hand-picked names, tagged by where price sits against the 21 EMA.";
  const CRITERIA = "<b>Momentum</b> &mdash; 21 EMA sits just above price, still catching up. <b>Pullback</b> &mdash; price has reclaimed the 21 EMA and is resting on it as support.";

  // "kind" drives how the raw number is split into a value + a small muted
  // unit suffix (or colored, for the two percent-change columns).
  const COLUMNS = [
    { key: "setup", label: "Setup", kind: "setup", get: r => r.setup },
    { key: "price", label: "Price", kind: "money", get: r => r.price },
    { key: "chg", label: "Chg %", kind: "pctColored", get: r => r.dailyChangePct },
    { key: "vol", label: "Vol", kind: "volume", get: r => r.volume },
    { key: "relvol", label: "Rel vol", kind: "plain", get: r => r.relVol },
    { key: "mktcap", label: "Mkt cap", kind: "marketcap", get: r => r.marketCap },
    { key: "pe", label: "P/E", kind: "plain", get: r => r.peRatio },
    { key: "eps", label: "EPS dil", sub: "TTM", kind: "money", get: r => r.epsDilTTM },
    { key: "epsgrowth", label: "EPS dil growth", sub: "TTM YoY", kind: "pctColored", get: r => r.epsDilGrowthYoY },
    { key: "divyield", label: "Div yield %", sub: "TTM", kind: "pctPlain", get: r => r.divYieldPct },
    { key: "sector", label: "Sector", kind: "text", get: r => r.sector }
  ];

  let state = {
    sortKey: null,
    sortDir: -1
  };

  function cell(inner, unit){
    return `<span class="cell-num">${inner}</span>${unit ? `<span class="cell-unit">${unit}</span>` : ""}`;
  }
  function renderValue(col, v){
    if(v == null) return `<td class="mono">—</td>`;
    switch(col.kind){
      case "setup": return `<td><span class="setup-badge ${v.toLowerCase()}">${v}</span></td>`;
      case "money": return `<td class="mono">${cell(v.toFixed(2), "USD")}</td>`;
      case "marketcap": {
        const [n, unit] = v >= 1e12 ? [v / 1e12, "T"] : v >= 1e9 ? [v / 1e9, "B"] : [v / 1e6, "M"];
        return `<td class="mono">${cell(n.toFixed(2), unit + " USD")}</td>`;
      }
      case "volume": {
        const [n, unit] = v >= 1e6 ? [v / 1e6, "M"] : [v / 1e3, "K"];
        return `<td class="mono">${cell(n.toFixed(2), unit)}</td>`;
      }
      case "plain": return `<td class="mono">${cell(v.toFixed(2))}</td>`;
      case "pctColored": {
        const cls = v > 0 ? "up" : v < 0 ? "down" : "";
        return `<td class="mono ${cls}">${cell((v > 0 ? "+" : "") + v.toFixed(2) + "%")}</td>`;
      }
      case "pctPlain": return `<td class="mono">${cell(v.toFixed(2) + "%")}</td>`;
      case "text": return `<td>${v}</td>`;
    }
  }

  function sortBy(key){
    if(state.sortKey === key){
      state.sortDir = -state.sortDir;
    } else {
      state.sortKey = key;
      state.sortDir = -1;
    }
    render();
  }

  function renderMeta(){
    document.getElementById("trendModeSub").textContent = PAGE_SUB;
    document.getElementById("trendCriteria").innerHTML = `<b>Trending criteria</b> &nbsp;${CRITERIA}`;
  }

  function renderHead(list){
    const row = document.getElementById("trendTableHead");
    const symHead = `
      <th class="col-sym">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <span class="col-sym-text">
          <span class="col-sym-label">Symbol</span>
          <span class="col-sym-count mono">${list.length} of ${market.getUniverseSize()}</span>
        </span>
      </th>`;
    const cells = [symHead].concat(COLUMNS.map(col => {
      const active = state.sortKey === col.key;
      const arrow = active ? `<span class="sort-arrow">${state.sortDir === -1 ? "↓" : "↑"}</span>` : "";
      const subLabel = col.sub ? `<small>${col.sub}</small>` : "";
      return `<th class="${active ? "active" : ""}" data-col="${col.key}">${arrow}<span>${col.label}</span>${subLabel}</th>`;
    }));
    row.innerHTML = cells.join("");
    row.querySelectorAll("th[data-col]").forEach(th => {
      th.addEventListener("click", () => sortBy(th.dataset.col));
    });
  }

  function sortedList(list){
    if(!state.sortKey) return list;
    const col = COLUMNS.find(c => c.key === state.sortKey);
    return [...list].sort((a, b) => {
      const av = col.get(a), bv = col.get(b);
      if(av == null && bv == null) return 0;
      if(av == null) return 1;
      if(bv == null) return -1;
      if(typeof av === "string") return av.localeCompare(bv) * state.sortDir * -1;
      return (av - bv) * state.sortDir;
    });
  }

  function avatarHue(symbol){
    let h = 0;
    for(let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 360;
    return h;
  }

  function renderBody(list){
    const body = document.getElementById("trendTableBody");
    if(!list.length){
      body.innerHTML = `<tr><td colspan="${COLUMNS.length + 1}"><div class="empty-state">No stocks meet every filter right now. Check back after the next close.</div></td></tr>`;
      return;
    }
    body.innerHTML = sortedList(list).map((r, i) => {
      const cells = COLUMNS.map(col => renderValue(col, col.get(r))).join("");
      const hue = avatarHue(r.symbol);
      return `
      <tr style="--i:${i}" data-symbol="${r.symbol}" title="Open ${r.symbol} chart on TradingView">
        <td class="col-sym">
          <span class="list-avatar" style="background:hsl(${hue} 38% 40%)">${r.symbol.charAt(0)}</span>
          <span class="list-sym-badge mono">${r.symbol}</span>
          <span class="list-name" title="${r.name}">${r.name}</span>
        </td>
        ${cells}
      </tr>`;
    }).join("");
    body.querySelectorAll("tr[data-symbol]").forEach(tr => {
      tr.addEventListener("click", () => {
        window.open(`https://www.tradingview.com/chart/?symbol=${tr.dataset.symbol}`, "_blank", "noopener");
      });
    });
  }

  function render(){
    const list = market.getScreenedList();
    renderMeta();
    renderHead(list);
    renderBody(list);
  }

  function initTrendingPage(){
    const table = document.getElementById("trendTableBody");
    if(!table) return;
    document.getElementById("tableWrap").hidden = false;
    render();
  }

  document.addEventListener("DOMContentLoaded", initTrendingPage);
})();
