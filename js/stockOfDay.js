/* Stock of the Day: one hand-picked symbol, featured identically on both
   Trending and Premium via marketData.js's getStockOfDay(). Shared so the
   two pages never drift out of sync with each other. */
(function(){
  "use strict";

  function avatarHue(symbol){
    let h = 0;
    for(let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 360;
    return h;
  }
  function fmtPct(n){ return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`; }

  function tagLabel(tag){
    if(tag === "favorite") return "Favorite pick";
    if(tag === "suggested") return "Suggested";
    if(tag === "lookout") return "On lookout";
    return null;
  }

  // Trend read off the same 21/50 EMA structure the rest of the app uses:
  // price and the 21 below the 50 (both trending down) reads short; price
  // and the 21 above the 50 (both trending up) reads long; anything mixed
  // (e.g. a pullback still above a rising 50) isn't a clean read either way.
  function readTrend(stock){
    const belowBoth = stock.dist20 < 0 && stock.dist50 < 0;
    const aboveBoth = stock.dist20 > 0 && stock.dist50 > 0;
    if(belowBoth && stock.ema21Close < stock.ema50Close) return { cls: "short", label: "Heading short" };
    if(aboveBoth && stock.ema21Close > stock.ema50Close) return { cls: "long", label: "Heading long" };
    return { cls: "mixed", label: "Mixed signals" };
  }

  function render(){
    const mount = document.getElementById("stockOfDay");
    if(!mount) return;
    const market = window.SwingAI.market;
    const auth = window.SwingAI.auth;
    const stock = market.getStockOfDay();
    if(!stock){ mount.hidden = true; return; }

    const hue = avatarHue(stock.symbol);
    const chgCls = stock.dailyChangePct > 0 ? "up" : stock.dailyChangePct < 0 ? "down" : "";
    const weekCls = stock.weeklyChangePct > 0 ? "up" : stock.weeklyChangePct < 0 ? "down" : "";
    const monthCls = stock.monthlyChangePct > 0 ? "up" : stock.monthlyChangePct < 0 ? "down" : "";
    const tag = auth ? tagLabel(auth.getEffectiveTag(stock)) : null;
    const trend = readTrend(stock);

    mount.className = `stock-of-day trend-${trend.cls}`;
    mount.innerHTML = `
      <div class="sod-top">
        <span class="sod-label">Stock of the day</span>
        ${tag ? `<span class="tag-badge tag-suggested">${tag}</span>` : ""}
        <span class="tag-badge tag-${trend.cls} sod-trend">${trend.label}</span>
      </div>
      <div class="sod-main">
        <span class="list-avatar" style="background:hsl(${hue} 38% 40%)">${stock.symbol.charAt(0)}</span>
        <div class="sod-id">
          <span class="sod-symbol mono">${stock.symbol}</span>
          <span class="sod-name">${stock.name}</span>
        </div>
        <div class="sod-price">
          <span class="sod-price-num mono">$${stock.price.toFixed(2)}</span>
          <span class="sod-chg mono ${chgCls}">${fmtPct(stock.dailyChangePct)}</span>
        </div>
      </div>
      <div class="sod-stats">
        <div class="sod-stat"><span>Week</span><b class="mono ${weekCls}">${fmtPct(stock.weeklyChangePct)}</b></div>
        <div class="sod-stat"><span>Month</span><b class="mono ${monthCls}">${fmtPct(stock.monthlyChangePct)}</b></div>
        <div class="sod-stat"><span>Sector</span><b>${stock.sector}</b></div>
      </div>`;
    mount.hidden = false;
    mount.onclick = () => window.open(`https://www.tradingview.com/chart/?symbol=${stock.symbol}`, "_blank", "noopener");
  }

  document.addEventListener("DOMContentLoaded", render);
})();
