/* Premium Stocks: a personal, unscreened watchlist. Whatever the user adds
   here is just shown with real Twelve Data numbers — no trend filtering,
   no scoring. Symbols and their data persist across reloads (marketData.js
   owns the actual fetching/caching; this file is just the page controller). */
(function(){
  "use strict";
  const market = window.SwingAI.market;

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

  function renderHead(){
    const row = document.getElementById("premiumTableHead");
    const symHead = `
      <th class="col-sym">
        <span class="col-sym-text">
          <span class="col-sym-label">Symbol</span>
          <span class="col-sym-count mono">Watching ${market.getWatchlistSymbols().length}</span>
        </span>
      </th>`;
    const cells = [symHead].concat(COLUMNS.map(col => {
      const active = state.sortKey === col.key;
      const arrow = active ? `<span class="sort-arrow">${state.sortDir === -1 ? "↓" : "↑"}</span>` : "";
      const subLabel = col.sub ? `<small>${col.sub}</small>` : "";
      return `<th class="${active ? "active" : ""}" data-col="${col.key}">${arrow}<span>${col.label}</span>${subLabel}</th>`;
    })).concat(['<th class="col-remove"></th>']);
    row.innerHTML = cells.join("");
    row.querySelectorAll("th[data-col]").forEach(th => {
      th.addEventListener("click", () => sortBy(th.dataset.col));
    });
  }

  function sortedList(list){
    const loaded = list.filter(r => !r.loading && !r.error);
    const pending = list.filter(r => r.loading || r.error);
    if(!state.sortKey) return loaded.concat(pending);
    const col = COLUMNS.find(c => c.key === state.sortKey);
    loaded.sort((a, b) => {
      const av = col.get(a), bv = col.get(b);
      if(av == null && bv == null) return 0;
      if(av == null) return 1;
      if(bv == null) return -1;
      if(typeof av === "string") return av.localeCompare(bv) * state.sortDir * -1;
      return (av - bv) * state.sortDir;
    });
    return loaded.concat(pending);
  }

  function avatarHue(symbol){
    let h = 0;
    for(let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 360;
    return h;
  }

  function renderBody(list){
    const body = document.getElementById("premiumTableBody");
    if(!list.length){
      body.innerHTML = `<tr><td colspan="${COLUMNS.length + 2}"><div class="empty-state">No stocks yet. Add a ticker above to start tracking it.</div></td></tr>`;
      return;
    }
    body.innerHTML = sortedList(list).map((r, i) => {
      const hue = avatarHue(r.symbol);
      const idCell = `
        <td class="col-sym">
          <span class="list-avatar" style="background:hsl(${hue} 38% 40%)">${r.symbol.charAt(0)}</span>
          <span class="list-sym-badge mono">${r.symbol}</span>
          ${r.loading ? '<span class="list-name">Loading&hellip;</span>' : ""}
          ${r.error ? `<span class="list-name down">${r.error}</span>` : ""}
        </td>`;
      const removeCell = `<td class="col-remove"><button type="button" class="remove-btn" data-symbol="${r.symbol}" aria-label="Remove ${r.symbol}">&times;</button></td>`;
      if(r.loading || r.error){
        return `<tr style="--i:${i}" data-symbol="${r.symbol}">${idCell}<td colspan="${COLUMNS.length}"></td>${removeCell}</tr>`;
      }
      const cells = COLUMNS.map(col => renderValue(col, col.get(r))).join("");
      return `<tr style="--i:${i}" data-symbol="${r.symbol}" title="Open ${r.symbol} chart on TradingView">${idCell}${cells}${removeCell}</tr>`;
    }).join("");

    body.querySelectorAll(".remove-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        market.removeWatchlistSymbol(btn.dataset.symbol);
        render();
      });
    });
    body.querySelectorAll("tr[data-symbol]").forEach(tr => {
      tr.addEventListener("click", () => {
        window.open(`https://www.tradingview.com/chart/?symbol=${tr.dataset.symbol}`, "_blank", "noopener");
      });
    });
  }

  function setBanner(text, isError){
    const el = document.getElementById("statusBanner");
    if(!text){ el.hidden = true; return; }
    el.hidden = false;
    el.textContent = text;
    el.className = "status-banner" + (isError ? " error" : "");
  }

  function render(){
    renderHead();
    renderBody(market.getWatchlistStocks());
  }

  function showAddError(msg){
    const el = document.getElementById("addTickerError");
    if(!msg){ el.hidden = true; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  async function initPremiumPage(){
    const table = document.getElementById("premiumTableBody");
    if(!table) return;

    setBanner("Loading real market data from Twelve Data...", false);
    await market.ready;

    const status = market.getStatus();
    if(status.error){
      setBanner("Couldn't load real market data: " + status.error, true);
      return;
    }

    setBanner(null);
    document.getElementById("tableWrap").hidden = false;
    render();
    market.onUpdate(() => render());

    const form = document.getElementById("addTickerForm");
    const input = document.getElementById("addTickerInput");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const value = input.value;
      if(!value.trim()) return;
      showAddError(null);
      const btn = form.querySelector(".add-ticker-btn");
      btn.disabled = true;
      const result = await market.addWatchlistSymbol(value);
      btn.disabled = false;
      if(result.ok){
        input.value = "";
      } else {
        showAddError(result.error || "Couldn't add that symbol.");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", initPremiumPage);
})();
