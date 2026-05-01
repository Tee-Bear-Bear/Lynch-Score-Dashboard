const express = require("express");
const cors = require("cors");
const path = require("path");
const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance();
const app = express();
app.use(cors());
app.use(express.json());

// ตั้งค่าให้อ่านไฟล์หน้าเว็บจากโฟลเดอร์ปัจจุบัน
app.use(express.static(path.join(__dirname, "/")));
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "Index_4.html")); });

let alertedStocks = {};
setInterval(() => { alertedStocks = {}; }, 1000 * 60 * 60 * 24);

function analyzeNewsSentiment(news) {
  const pos = ["beat", "growth", "buyback", "positive", "dividend", "profit"];
  const neg = ["miss", "decline", "debt", "lawsuit", "loss", "warning"];
  let score = 0;
  news.forEach(n => {
    const t = n.title.toLowerCase();
    pos.forEach(w => { if (t.includes(w)) score += 0.5; });
    neg.forEach(w => { if (t.includes(w)) score -= 0.5; });
  });
  return Math.max(0, Math.min(2, score + 1)); 
}

function getAnalysis(data, sector, news) {
  const pe = data.trailingPE || 0;
  const growthPct = (data.earningsGrowth || 0) * 100;
  const margin = (data.profitMargins || 0) * 100;
  const debt = data.debtToEquity || 0; 
  let peg = pe > 0 && growthPct > 0 ? pe / growthPct : 0;

  // ตรวจสอบค่า N/A (ค่าเป็น 0 หรือว่าง)
  const isNA = (val) => val === 0 || val === null || val === undefined;

  let isValueTrap = false;
  let trapReason = "";
  if (pe > 0 && pe < 7 && growthPct < 0) { isValueTrap = true; trapReason = "P/E ต่ำแต่กำไรถดถอย"; }
  else if (debt > 250) { isValueTrap = true; trapReason = "หนี้สูงเกินเกณฑ์ปกติ"; }

  let lynchScore = 0;
  if (growthPct > 15) lynchScore += 1.5;
  if (peg > 0 && peg < 1.1) lynchScore += 1.5;
  if (margin > 15) lynchScore += 1.0;
  const isFinance = ["Financial Services", "Real Estate"].includes(sector);
  if ((isFinance && debt < 300) || (!isFinance && debt < 60)) lynchScore += 1.0;

  const sentiment = analyzeNewsSentiment(news);
  const storyScore = Math.min(5, (margin > 20 ? 1.5 : 0) + (debt < 30 ? 1.5 : 0) + sentiment);

  return { 
    type: growthPct > 20 ? "Fast Grower" : (growthPct > 10 ? "Stalwart" : "Cyclical"), 
    lynchScore, storyScore, totalScore: lynchScore + storyScore, isValueTrap, trapReason,
    growth: { 
      val: isNA(growthPct) ? "N/A" : growthPct.toFixed(0) + "%", 
      color: isNA(growthPct) ? "#94a3b8" : (growthPct > 15 ? "#4ade80" : "#fbbf24"), 
      status: isNA(growthPct) ? "ไม่พบข้อมูล" : (growthPct > 25 ? "สูงมาก" : (growthPct > 15 ? "สูง" : "ปกติ")),
      raw: growthPct 
    },
    pegData: { 
      val: isNA(peg) ? "N/A" : peg.toFixed(2), 
      color: isNA(peg) ? "#94a3b8" : (peg < 1 ? "#4ade80" : (peg < 1.5 ? "#fbbf24" : "#f87171")),
      status: isNA(peg) ? "ไม่พบข้อมูล" : (peg < 1 ? "ดีมาก" : (peg < 1.5 ? "ตึงตัว" : "แพง")),
      raw: peg 
    },
    debtData: { 
      val: isNA(debt) ? "N/A" : debt.toFixed(0) + "%", 
      color: isNA(debt) ? "#94a3b8" : (lynchScore >= 4 ? "#4ade80" : "#ef4444"), 
      status: isNA(debt) ? "ไม่พบข้อมูล" : (lynchScore >= 4 ? "ดีมาก" : "สูง"),
      raw: debt 
    },
    profit: { 
      val: isNA(margin) ? "N/A" : margin.toFixed(1) + "%", 
      color: isNA(margin) ? "#94a3b8" : (margin > 15 ? "#4ade80" : "#fbbf24"), 
      status: isNA(margin) ? "ไม่พบข้อมูล" : (margin > 15 ? "สูง" : "กลาง"),
      raw: margin 
    }
  };
}

app.get("/api/stocks", async (req, res) => {
  try {
    if (!req.query.symbols) return res.json([]);
    const symbols = req.query.symbols.split(",");
    let results = [];
    for (const s of symbols) {
      const key = s.toUpperCase().trim();
      try {
        const [sum, news] = await Promise.all([
          yahooFinance.quoteSummary(key, { modules: ["price", "financialData", "summaryDetail", "assetProfile"] }),
          yahooFinance.search(key)
        ]);
        const analysis = getAnalysis({ ...sum.summaryDetail, ...sum.financialData }, sum.assetProfile?.sector, news.news);
        const is10x = analysis.totalScore >= 9;
        let alert = false;
        if (is10x && !alertedStocks[key]) { alert = true; alertedStocks[key] = true; }
        results.push({ symbol: key, name: sum.price?.shortName || "-", price: sum.price?.regularMarketPrice || 0, ...analysis, is10x, alert });
      } catch (err) { results.push({ symbol: key, error: true }); }
    }
    res.json(results);
  } catch (err) { res.json([]); }
});

// ใช้ Port จากระบบ หรือ 3000[cite: 6]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Machine Running on Port ${PORT}`));