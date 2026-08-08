/* Premium Stocks: a personal, unscreened watchlist. Static, hand-picked list
   (marketData.js), no add/remove — just real numbers for a fixed set of
   symbols, no trend filtering, no scoring. */
(function(){
  "use strict";
  const market = window.SwingAI.market;
  const auth = window.SwingAI.auth;

  function tagBadgeHTML(tag){
    if(tag === "favorite") return '<span class="tag-badge tag-favorite" title="Favorite">&#9733;</span>';
    if(tag === "suggested") return '<span class="tag-badge tag-suggested">Suggested</span>';
    if(tag === "lookout") return '<span class="tag-badge tag-lookout">Lookout</span>';
    return "";
  }
  function tagSelectHTML(symbol, tag){
    const opt = (value, label) => `<option value="${value}"${tag === value ? " selected" : ""}>${label}</option>`;
    return `<select class="tag-select" data-symbol="${symbol}" title="Set tag (owner only)">
      ${opt("", "No tag")}${opt("suggested", "Suggested")}${opt("lookout", "Lookout")}${opt("favorite", "Favorite ★")}
    </select>`;
  }

  function directionBadgeHTML(direction){
    if(direction === "long") return '<span class="tag-badge tag-long">Long</span>';
    if(direction === "short") return '<span class="tag-badge tag-short">Short</span>';
    return "";
  }
  function directionToggleHTML(symbol, direction){
    const btn = (value, label) => `<button type="button" class="dir-btn dir-${value}${direction === value ? " active" : ""}" data-symbol="${symbol}" data-dir="${value}" title="Call ${label} (owner only)">${label}</button>`;
    return `<span class="dir-toggle">${btn("long", "Long")}${btn("short", "Short")}</span>`;
  }

  const COLUMNS = [
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

  let state = { sortKey: null, sortDir: -1 };

  function cell(inner, unit){
    return `<span class="cell-num">${inner}</span>${unit ? `<span class="cell-unit">${unit}</span>` : ""}`;
  }
  function renderValue(col, v){
    if(v == null) return `<td class="mono">—</td>`;
    switch(col.kind){
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

  function renderHead(list){
    const row = document.getElementById("premiumTableHead");
    const symHead = `
      <th class="col-sym">
        <span class="col-sym-text">
          <span class="col-sym-label">Symbol</span>
          <span class="col-sym-count mono">Watching ${list.length}</span>
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
    const body = document.getElementById("premiumTableBody");
    if(!list.length){
      body.innerHTML = `<tr><td colspan="${COLUMNS.length + 1}"><div class="empty-state">No stocks yet.</div></td></tr>`;
      return;
    }
    const owner = auth.isOwner();
    body.innerHTML = sortedList(list).map((r, i) => {
      const hue = avatarHue(r.symbol);
      const tag = auth.getEffectiveTag(r);
      const direction = auth.getEffectiveDirection(r.symbol);
      const idCell = `
        <td class="col-sym">
          <span class="list-avatar" style="background:hsl(${hue} 38% 40%)">${r.symbol.charAt(0)}</span>
          <span class="list-sym-badge mono">${r.symbol}</span>
          ${tagBadgeHTML(tag)}
          ${directionBadgeHTML(direction)}
          <span class="list-name" title="${r.name}">${r.name}</span>
          ${owner ? tagSelectHTML(r.symbol, tag) : ""}
          ${owner ? directionToggleHTML(r.symbol, direction) : ""}
        </td>`;
      const cells = COLUMNS.map(col => renderValue(col, col.get(r))).join("");
      return `<tr style="--i:${i}" data-symbol="${r.symbol}" title="Open ${r.symbol} chart on TradingView">${idCell}${cells}</tr>`;
    }).join("");

    body.querySelectorAll("tr[data-symbol]").forEach(tr => {
      tr.addEventListener("click", () => {
        window.open(`https://www.tradingview.com/chart/?symbol=${tr.dataset.symbol}`, "_blank", "noopener");
      });
    });
    body.querySelectorAll(".tag-select").forEach(sel => {
      sel.addEventListener("click", e => e.stopPropagation());
      sel.addEventListener("change", e => {
        e.stopPropagation();
        auth.setTag(sel.dataset.symbol, sel.value || null);
        render();
      });
    });
    body.querySelectorAll(".dir-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const current = auth.getEffectiveDirection(btn.dataset.symbol);
        auth.setDirection(btn.dataset.symbol, current === btn.dataset.dir ? null : btn.dataset.dir);
        render();
      });
    });
  }

  function render(){
    const list = market.getWatchlistStocks();
    renderHead(list);
    renderBody(list);
  }

  function initPremiumPage(){
    const table = document.getElementById("premiumTableBody");
    if(!table) return;

    if(!window.SwingAI.auth.hasPremiumAccess()){
      document.getElementById("paywall").hidden = false;
      return;
    }

    document.getElementById("tableWrap").hidden = false;
    render();
  }

  document.addEventListener("DOMContentLoaded", initPremiumPage);
})();
