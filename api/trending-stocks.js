/* Public-deployment counterpart to swingai-server/proxy.js: same Anthropic
   call (web-search-grounded, structured JSON output), but as a Vercel
   serverless function reading ANTHROPIC_API_KEY from an environment
   variable instead of a local .env file. No file-based cache here (a
   serverless instance's disk doesn't persist across invocations) — the
   client already caches this response for an hour in localStorage, which
   is what actually keeps real Anthropic spend down. */
"use strict";
const Anthropic = require("@anthropic-ai/sdk");

let anthropic;

async function fetchTrendingStocks(){
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            stocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  symbol: { type: "string", description: "US exchange ticker symbol" },
                  name: { type: "string", description: "Company name" },
                  sector: { type: "string", description: "One or two word sector label" }
                },
                required: ["symbol", "name", "sector"],
                additionalProperties: false
              }
            }
          },
          required: ["stocks"],
          additionalProperties: false
        }
      }
    },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [{
      role: "user",
      content: "Search the web for US-listed stocks that are currently popular or heavily discussed among retail swing traders today. Return exactly 4 real, liquid, large/mid-cap tickers (not penny stocks). For each, give the ticker symbol, company name, and a short one-or-two-word sector label."
    }]
  });

  if(response.stop_reason === "refusal"){
    throw new Error("Request was declined by Anthropic's safety classifiers.");
  }
  const textBlock = response.content.find(b => b.type === "text");
  if(!textBlock) throw new Error("No text content in response.");
  const parsed = JSON.parse(textBlock.text);
  return Array.isArray(parsed.stocks) ? parsed.stocks : [];
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }

  if(!process.env.ANTHROPIC_API_KEY){
    res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
    return;
  }
  if(!anthropic) anthropic = new Anthropic();

  try{
    const stocks = await fetchTrendingStocks();
    res.status(200).json({ stocks, cached: false });
  } catch(e){
    res.status(500).json({ error: e.message || "Failed to fetch trending stocks" });
  }
};
