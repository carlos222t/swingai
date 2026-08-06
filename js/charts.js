/* SVG gauges + charts, no external chart library. Palette follows the
   status/sequential roles: risk gauges recolor by severity band (good/warning/
   critical), swing gauges stay a single sequential blue (fill vs. a lighter
   same-hue track), and price deltas use the good/critical status pair. */
(function(){
  "use strict";

  const STATUS = { good:"#0ca30c", goodText:"#3ddc3d", warning:"#fab219", critical:"#d03b3b", criticalText:"#ff6b6b" };

  // Each band gives a soft-to-solid gradient pair (light tint -> base hue) for
  // the fill stroke, plus a faint same-hue track: "blue-on-blue" / "hue-on-hue"
  // per the meter spec, richer than a flat fill without introducing a new hue.
  function meterColors(score, kind){
    if(kind === "risk"){
      if(score < 34) return { from:"#7ce8a0", to:STATUS.goodText, track:"rgba(12,163,12,.14)" };
      if(score < 67) return { from:"#ffd27a", to:STATUS.warning, track:"rgba(250,178,25,.14)" };
      return { from:"#ff9d9d", to:STATUS.criticalText, track:"rgba(208,59,59,.14)" };
    }
    return { from:"#8fc4f7", to:"#3987e5", track:"rgba(57,135,229,.14)" };
  }

  function hexToRgb(hex){
    const v = hex.replace("#","");
    return { r: parseInt(v.slice(0,2),16), g: parseInt(v.slice(2,4),16), b: parseInt(v.slice(4,6),16) };
  }
  function lerpColor(hexA, hexB, t){
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const r = Math.round(a.r + (b.r-a.r)*t);
    const g = Math.round(a.g + (b.g-a.g)*t);
    const bl = Math.round(a.b + (b.b-a.b)*t);
    return `rgb(${r},${g},${bl})`;
  }

  // Shared color for anything keyed to the swing score: a single sequential-blue
  // ramp, so the icon and any label beside it always agree on hue.
  function swingColor(score){
    return lerpColor("#8fc4f7", "#3987e5", Math.max(0, Math.min(100, score))/100);
  }

  // A little price-swing wave: a flat line at 0, rippling into a fuller S-curve
  // as the score climbs, with an end dot riding the crest like a chart marker.
  function renderSwingIcon(el, score){
    score = Math.max(0, Math.min(100, score));
    const t = score/100;
    const size = 26, midY = 13, x0 = 2.5, x1 = size-2.5;
    const amp = 1.5 + t*8;
    const color = swingColor(score);
    const w = x1 - x0;
    const c1x = x0 + w*0.32, c2x = x0 + w*0.68;
    const path = `M ${x0} ${midY} C ${c1x} ${(midY-amp).toFixed(1)}, ${c2x} ${(midY+amp).toFixed(1)}, ${x1} ${midY}`;

    el.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}">
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${x0}" cy="${midY}" r="1.4" fill="${color}" opacity="0.55"/>
        <circle cx="${x1}" cy="${midY}" r="1.8" fill="${color}"/>
      </svg>`;
  }

  // Renders an animated full-circle ring meter (0-100) into `el`, with the
  // score and a short qualitative word centered inside the ring.
  function renderGauge(el, score, kind, qualitative){
    score = Math.max(0, Math.min(100, score));
    const size = 132, cx = size/2, cy = size/2, r = 54, strokeW = 12;
    const { from, to, track } = meterColors(score, kind);
    const circumference = 2 * Math.PI * r;
    const target = circumference * (1 - score/100);
    const uid = Math.random().toString(36).slice(2,8);
    const gradId = "gaugeGrad" + uid;

    el.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${from}"/>
            <stop offset="100%" stop-color="${to}"/>
          </linearGradient>
        </defs>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="${strokeW}"/>
        <circle class="gauge-fill" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${gradId})"
                stroke-width="${strokeW}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
                stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"
                style="transition:stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1);"/>
      </svg>
      <div class="gauge-center">
        <div class="gauge-num">${score}</div>
        <div class="gauge-qual" style="color:${to}">${qualitative || ""}</div>
      </div>`;

    const fillCircle = el.querySelector(".gauge-fill");
    // Force a synchronous reflow so the browser commits the full-offset (empty)
    // state before we change it, otherwise the two style writes coalesce into
    // one and the transition never has a "from" state to animate out of.
    void fillCircle.getBoundingClientRect();
    fillCircle.style.strokeDashoffset = String(target);
  }

  // Small inline chart for list rows and grid tiles: a soft area fill under
  // the line plus an end-dot on the latest price, colored by net direction,
  // so it reads as an actual mini price chart rather than a bare squiggle.
  function renderSparkline(el, history){
    if(!history || history.length < 2){ el.innerHTML = ""; return; }
    const w = 130, h = 44, pad = 3;
    const closes = history.map(d=>d.close);
    const min = Math.min(...closes), max = Math.max(...closes);
    const range = (max - min) || 1;
    const stepX = (w - pad*2) / (closes.length - 1);
    const up = closes[closes.length-1] >= closes[0];
    const color = up ? STATUS.goodText : STATUS.criticalText;

    const points = closes.map((c,i)=>{
      const x = pad + i*stepX;
      const y = pad + (1 - (c - min)/range) * (h - pad*2);
      return [x,y];
    });
    const linePath = "M " + points.map(p=>p.join(",")).join(" L ");
    const last = points[points.length-1];
    const areaPath = linePath + ` L ${last[0]},${h-pad} L ${points[0][0]},${h-pad} Z`;
    const gradId = "sparkGrad" + Math.random().toString(36).slice(2,8);

    el.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${last[0]}" cy="${last[1]}" r="3.4" fill="${color}" stroke="var(--surface-2, #191c22)" stroke-width="1.5"/>
      </svg>`;
  }

  const MONO = "IBM Plex Mono, monospace";
  const axisDateFmt = new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric" });

  // TradingView-style candlestick chart: OHLC candles, a volume histogram,
  // price/date gridlines with axis labels, a top-left ticker + OHLC legend
  // that tracks the crosshair, and axis-edge price/date tags on hover.
  function renderPriceChart(container, history, symbol, callbacks){
    callbacks = callbacks || {};
    container.innerHTML = "";
    if(!history || history.length < 2) return;

    const w = 680, padLeft = 2, padRight = 50;
    const priceTop = 26, priceH = 168, gapH = 6, volH = 46, axisH = 16;
    const priceBottom = priceTop + priceH;
    const volTop = priceBottom + gapH;
    const volBottom = volTop + volH;
    const h = volBottom + axisH;
    const plotW = w - padLeft - padRight;
    const n = history.length;

    const highs = history.map(d=>d.high), lows = history.map(d=>d.low);
    const maxPrice = Math.max(...highs), minPrice = Math.min(...lows);
    const priceRange = (maxPrice - minPrice) || 1;
    const yPad = priceRange * 0.08;
    const yMin = minPrice - yPad, yMax = maxPrice + yPad;
    const yRange = yMax - yMin;
    const maxVol = Math.max(...history.map(d=>d.volume)) || 1;

    const slot = plotW / n;
    const bodyW = Math.max(1, Math.min(slot*0.62, 9));

    const xFor = (i) => padLeft + i*slot + slot/2;
    const yForPrice = (p) => priceTop + (1 - (p - yMin)/yRange) * priceH;
    const priceForY = (y) => yMin + (1 - (Math.max(priceTop,Math.min(priceBottom,y)) - priceTop)/priceH) * yRange;
    const yForVol = (v) => volBottom - (v/maxVol) * volH;
    const fmtPx = (p) => "$" + p.toFixed(p < 10 ? 3 : 2);

    let gridSvg = "";
    const gridLevels = 4;
    for(let g=0; g<=gridLevels; g++){
      const price = yMin + (yRange*g/gridLevels);
      const y = yForPrice(price);
      gridSvg += `<line x1="${padLeft}" y1="${y}" x2="${w-padRight}" y2="${y}" stroke="#20232b" stroke-width="1" shape-rendering="crispEdges"/>`;
      gridSvg += `<text x="${w-padRight+7}" y="${y+3}" font-size="9" fill="#7c7b76" font-family="${MONO}">${fmtPx(price)}</text>`;
    }
    let dateSvg = "";
    const dateCols = 4;
    for(let c=0; c<=dateCols; c++){
      const idx = Math.round((n-1) * c/dateCols);
      const x = xFor(idx);
      dateSvg += `<line x1="${x}" y1="${priceTop}" x2="${x}" y2="${volBottom}" stroke="#20232b" stroke-width="1" shape-rendering="crispEdges"/>`;
      dateSvg += `<text x="${x}" y="${volBottom+12}" font-size="9" fill="#7c7b76" font-family="${MONO}" text-anchor="middle">${axisDateFmt.format(new Date(history[idx].date))}</text>`;
    }

    let candleSvg = "";
    for(let i=0;i<n;i++){
      const d = history[i];
      const up = d.close >= d.open;
      const color = up ? STATUS.goodText : STATUS.criticalText;
      const x = xFor(i);
      const yHigh = yForPrice(d.high), yLow = yForPrice(d.low);
      const yOpen = yForPrice(d.open), yClose = yForPrice(d.close);
      const bodyTop = Math.min(yOpen,yClose), bodyH = Math.max(1, Math.abs(yClose-yOpen));
      const volY = yForVol(d.volume);
      candleSvg += `<line x1="${x}" y1="${yHigh}" x2="${x}" y2="${yLow}" stroke="${color}" stroke-width="1"/>`;
      candleSvg += `<rect x="${(x-bodyW/2).toFixed(2)}" y="${bodyTop.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" fill="${color}"/>`;
      candleSvg += `<rect x="${(x-bodyW/2).toFixed(2)}" y="${volY.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${(volBottom-volY).toFixed(2)}" fill="${color}" opacity="0.32"/>`;
    }

    function ohlcTspans(d){
      const color = d.close >= d.open ? STATUS.goodText : STATUS.criticalText;
      return `<tspan fill="#7c7b76">O</tspan> <tspan fill="#e8eaf2">${d.open.toFixed(2)}</tspan>`+
        ` <tspan fill="#7c7b76">H</tspan> <tspan fill="#e8eaf2">${d.high.toFixed(2)}</tspan>`+
        ` <tspan fill="#7c7b76">L</tspan> <tspan fill="#e8eaf2">${d.low.toFixed(2)}</tspan>`+
        ` <tspan fill="#7c7b76">C</tspan> <tspan fill="${color}">${d.close.toFixed(2)}</tspan>`;
    }

    const last = history[n-1];
    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${gridSvg}
        ${dateSvg}
        <line x1="${padLeft}" y1="${priceBottom}" x2="${w-padRight}" y2="${priceBottom}" stroke="#383835" stroke-width="1" shape-rendering="crispEdges"/>
        ${candleSvg}
        <text class="tv-legend-sym" x="${padLeft+4}" y="14" font-size="12" font-weight="700" fill="#ffffff" font-family="${MONO}">${symbol}</text>
        <text class="tv-legend-ohlc" x="${padLeft+4}" y="27" font-size="9.5" font-family="${MONO}">${ohlcTspans(last)}</text>
        <g class="crosshair" opacity="0">
          <line class="cx-vline" x1="0" y1="${priceTop}" x2="0" y2="${volBottom}" stroke="rgba(255,255,255,.22)" stroke-width="1" shape-rendering="crispEdges"/>
          <line class="cx-hline" x1="${padLeft}" y1="0" x2="${w-padRight}" y2="0" stroke="rgba(255,255,255,.22)" stroke-width="1" shape-rendering="crispEdges"/>
          <rect class="cx-price-bg" x="${w-padRight}" y="0" width="${padRight}" height="15" fill="#262a35"/>
          <text class="cx-price-txt" x="${w-padRight+5}" y="0" font-size="9" fill="#ffffff" font-family="${MONO}"></text>
          <rect class="cx-date-bg" x="0" y="${volBottom+2}" width="52" height="14" rx="3" fill="#262a35"/>
          <text class="cx-date-txt" x="0" y="${volBottom+12}" font-size="9" fill="#ffffff" font-family="${MONO}" text-anchor="middle"></text>
        </g>
      </svg>`;

    const legendOhlc = container.querySelector(".tv-legend-ohlc");
    const crosshair = container.querySelector(".crosshair");
    const cxV = container.querySelector(".cx-vline");
    const cxH = container.querySelector(".cx-hline");
    const priceBg = container.querySelector(".cx-price-bg");
    const priceTxt = container.querySelector(".cx-price-txt");
    const dateBg = container.querySelector(".cx-date-bg");
    const dateTxt = container.querySelector(".cx-date-txt");

    function handleMove(clientX, clientY){
      const rect = container.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const idx = Math.max(0, Math.min(n-1, Math.round((relX/rect.width) * (n-1))));
      const x = xFor(idx);
      const yInViewBox = (relY/rect.height) * h;
      const yClamped = Math.max(priceTop, Math.min(priceBottom, yInViewBox));
      const hoveredPrice = priceForY(yClamped);

      cxV.setAttribute("x1", x); cxV.setAttribute("x2", x);
      cxH.setAttribute("y1", yClamped); cxH.setAttribute("y2", yClamped);
      priceBg.setAttribute("y", yClamped-7.5);
      priceTxt.setAttribute("y", yClamped+3);
      priceTxt.textContent = fmtPx(hoveredPrice);
      const dateX = Math.max(padLeft+26, Math.min(w-padRight-26, x));
      dateBg.setAttribute("x", dateX-26);
      dateTxt.setAttribute("x", dateX);
      dateTxt.textContent = axisDateFmt.format(new Date(history[idx].date));
      crosshair.setAttribute("opacity", "1");
      legendOhlc.innerHTML = ohlcTspans(history[idx]);

      if(callbacks.onScrub) callbacks.onScrub(history[idx], idx);
    }
    function handleLeave(){
      crosshair.setAttribute("opacity", "0");
      legendOhlc.innerHTML = ohlcTspans(last);
      if(callbacks.onLeave) callbacks.onLeave();
    }

    container.addEventListener("mousemove", (e) => handleMove(e.clientX, e.clientY));
    container.addEventListener("mouseleave", handleLeave);
    container.addEventListener("touchstart", (e) => { if(e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive:true });
    container.addEventListener("touchmove", (e) => { if(e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive:true });
    container.addEventListener("touchend", handleLeave);
  }

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.charts = { renderGauge, renderSparkline, renderSwingIcon, swingColor, renderPriceChart };
})();
