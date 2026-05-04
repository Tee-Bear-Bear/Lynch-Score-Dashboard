const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// 🔑 API Key ของพี่หมี
const API_KEY = "SFtbTv6ztA9vxVnSxXvaHdMLDCWhxxn5";

async function analyzeNewsSentiment(news) {
    if (!news || !Array.isArray(news) || news.length === 0) return "Neutral";
    const text = news.map(n => n.title).join(" ");
    const positiveWords = ["upgrade", "buy", "growth", "positive", "bullish", "strong", "beat", "surge"];
    const negativeWords = ["downgrade", "sell", "decline", "negative", "bearish", "weak", "miss", "drop"];
    let score = 0;
    positiveWords.forEach(word => { if (text.toLowerCase().includes(word)) score++; });
    negativeWords.forEach(word => { if (text.toLowerCase().includes(word)) score--; });
    return score > 0 ? "Positive" : score < 0 ? "Negative" : "Neutral";
}

app.get("/api/stocks", async (req, res) => {
    const symbols = req.query.symbols ? req.query.symbols.split(",") : ["AAP", "LRCX", "CROX"];
    const results = [];

    for (const symbol of symbols) {
        const key = symbol.trim().toUpperCase();
        try {
            // 🚀 ใช้ท่อ Profile (ฟรี) เพื่อเอา ราคา และ ชื่อบริษัท
            const profileRes = await fetch(`https://financialmodelingprep.com/api/v3/profile/${key}?apikey=${API_KEY}`);
            const profileData = await profileRes.json();

            // 🚀 ใช้ท่อ Key Metrics (ฟรี) เพื่อเอาค่า PE และ EPS
            const metricsRes = await fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${key}?limit=1&apikey=${API_KEY}`);
            const metricsData = await metricsRes.json();

            if (!profileData[0]) {
                console.warn(`⚠️ ไม่พบหุ้น: ${key}`);
                results.push({ symbol: key, error: true });
                continue;
            }

            const p = profileData[0];
            const m = metricsData[0] || {};

            // ดึงข่าว (ท่อนี้ยังฟรีอยู่)
            const newsRes = await fetch(`https://financialmodelingprep.com/api/v3/stock_news?tickers=${key}&limit=3&apikey=${API_KEY}`);
            const newsData = await newsRes.json();
            const sentiment = await analyzeNewsSentiment(newsData);

            results.push({
                symbol: key,
                name: p.companyName,
                price: p.price,
                changesPercentage: p.changes,
                pe: m.peRatioTTM ? m.peRatioTTM.toFixed(2) : "N/A",
                eps: m.netIncomePerShareTTM ? m.netIncomePerShareTTM.toFixed(2) : "N/A",
                marketCap: p.mktCap,
                sentiment: sentiment,
                lynchStatus: (m.peRatioTTM < 20) ? "⭐ Lynch Fit" : "Watchlist",
                timestamp: new Date().toLocaleTimeString()
            });

            console.log(`✅ ดึงข้อมูล ${key} ผ่านท่อ Profile สำเร็จ!`);

        } catch (error) {
            console.error(`💥 พังที่หุ้น ${key}:`, error.message);
            results.push({ symbol: key, error: true });
        }
    }
    res.json(results);
});

module.exports = app;
