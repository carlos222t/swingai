/* Upload Trade page: take a screenshot, preview it, then run it through
   tradeAnalysis.js and render the bull/bear breakdown. */
(function(){
  "use strict";

  let currentFile = null;

  function showStage(stage){
    document.getElementById("uploadStage").hidden = stage !== "upload";
    document.getElementById("previewStage").hidden = stage !== "preview";
    document.getElementById("reportStage").hidden = stage !== "report";
  }

  function onFileChosen(file){
    if(!file || !file.type.startsWith("image/")) return;
    currentFile = file;
    const url = URL.createObjectURL(file);
    const img = document.getElementById("previewImage");
    img.src = url;
    showStage("preview");
  }

  function fmtPct(n){ const s = n > 0 ? "+" : ""; return `${s}${n.toFixed(1)}%`; }

  function renderReport(result){
    const { stock, bull, bear, news, score, verdict } = result;

    document.getElementById("reportSymbol").textContent = stock.symbol;
    document.getElementById("reportName").textContent = stock.name;
    document.getElementById("reportPrice").textContent = "$" + stock.price.toFixed(2);

    const scoreEl = document.getElementById("reportScore");
    scoreEl.textContent = score + "%";
    scoreEl.className = "report-score " + verdict.cls;
    document.getElementById("reportVerdict").textContent = verdict.label;
    document.getElementById("reportVerdict").className = "report-verdict " + verdict.cls;
    document.getElementById("reportBar").style.width = score + "%";
    document.getElementById("reportBar").className = "report-bar-fill " + verdict.cls;

    document.getElementById("bullList").innerHTML = bull.length
      ? bull.map(t => `<li>${t}</li>`).join("")
      : `<li class="sign-empty">Nothing clearly bullish showed up in this read.</li>`;
    document.getElementById("bearList").innerHTML = bear.length
      ? bear.map(t => `<li>${t}</li>`).join("")
      : `<li class="sign-empty">No red flags showed up in this read.</li>`;

    document.getElementById("newsList").innerHTML = news.map(n => `
      <div class="news-row">
        <span class="news-tag ${n.tag.toLowerCase()}">${n.tag}</span>
        <span class="news-text">${n.text}</span>
      </div>`).join("");

    document.getElementById("reportStats").innerHTML = `
      <div class="stat-row"><span>Week</span><b class="${stock.weeklyChangePct > 0 ? "up" : stock.weeklyChangePct < 0 ? "down" : ""}">${fmtPct(stock.weeklyChangePct)}</b></div>
      <div class="stat-row"><span>Month</span><b class="${stock.monthlyChangePct > 0 ? "up" : stock.monthlyChangePct < 0 ? "down" : ""}">${fmtPct(stock.monthlyChangePct)}</b></div>
      <div class="stat-row"><span>Rel. volume</span><b>${stock.relVol.toFixed(2)}&times;</b></div>
      <div class="stat-row"><span>Dist. from 21 EMA</span><b class="${stock.dist20 > 0 ? "up" : "down"}">${fmtPct(stock.dist20)}</b></div>
    `;

    showStage("report");
  }

  function initUploadPage(){
    const fileInput = document.getElementById("fileInput");
    const dropzone = document.getElementById("dropzone");
    if(!fileInput) return;

    fileInput.addEventListener("change", () => onFileChosen(fileInput.files[0]));

    ["dragover", "dragenter"].forEach(evt => {
      dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("drag"); });
    });
    dropzone.addEventListener("drop", e => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if(file) onFileChosen(file);
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
      currentFile = null;
      fileInput.value = "";
      showStage("upload");
    });

    document.getElementById("analyzeBtn").addEventListener("click", async () => {
      if(!currentFile) return;
      const btn = document.getElementById("analyzeBtn");
      btn.disabled = true;
      btn.textContent = "Reading the chart...";

      await window.SwingAI.market.ready;
      const marketStatus = window.SwingAI.market.getStatus();

      setTimeout(() => {
        if(marketStatus.error){
          document.getElementById("uploadError").hidden = false;
          document.getElementById("uploadError").textContent =
            "Couldn't load real market data: " + marketStatus.error;
          btn.disabled = false;
          btn.textContent = "Analyze this trade";
          return;
        }
        const seed = currentFile.name + "|" + currentFile.size + "|" + currentFile.lastModified;
        const result = window.SwingAI.tradeAnalysis.analyze(seed);
        renderReport(result);
        btn.disabled = false;
        btn.textContent = "Analyze this trade";
      }, 550);
    });

    document.getElementById("newTradeBtn").addEventListener("click", () => {
      currentFile = null;
      fileInput.value = "";
      showStage("upload");
    });
  }

  document.addEventListener("DOMContentLoaded", initUploadPage);
})();
