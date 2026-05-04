const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// 🔑 API Key ของพี่หมี (เช็คแล้วว่าตรงกับ Dashboard เป๊ะ)
const API_KEY = "SFtbTv6ztA9vxVnSxXvaHdMLDCWhxxn5";

let alertedStocks = {};
setInterval(() => { alertedStocks = {}; }, 1000 * 60 * 60 * 24);

async function analyzeNewsSentiment(news) {
    if (!news || news.length === 0) return "Neutral";
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

    console.log(`🚀 กำลังเริ่มดึงข้อมูลสำหรับหุ้น: ${symbols.join(", ")}`);

    for (const symbol of symbols) {
        const key = symbol.trim().toUpperCase();
        try {
            // 1. ดึงข้อมูล Quote
            const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${key}?apikey=${API_KEY}`;
            const quoteRes = await fetch(quoteUrl);
            const quoteData = await quoteRes.json();

            // 🔍 ตรวจสอบว่า FMP ด่าอะไรกลับมาไหม
            if (quoteData["Error Message"]) {
                console.error(`❌ FMP ปฏิเสธหุ้น ${key}: ${quoteData["Error Message"]}`);
                results.push({ symbol: key, error: true, reason: quoteData["Error Message"] });
                continue;
            }

            if (!Array.isArray(quoteData) || quoteData.length === 0) {
                console.warn(`⚠️ FMP ไม่มีข้อมูลสำหรับหุ้น: ${key} (กุญแจอาจจะยังไม่ Active หรือชื่อหุ้นผิด)`);
                results.push({ symbol: key, error: true });
                continue;
            }

            const data = quoteData[0];

            // 2. ดึงข้อมูลข่าวเพื่อทำ Sentiment
            const newsRes = await fetch(`https://financialmodelingprep.com/api/v3/stock_news?tickers=${key}&limit=5&apikey=${API_KEY}`);
            const newsData = await newsRes.json();
            const sentiment = await analyzeNewsSentiment(newsData);

            // 3. คำนวณ Lynch Score แบบพื้นฐาน
            const peg = data.pe / 15; // สมมติ Growth 15%
            const isLynchFit = data.pe < 20 && peg < 1.2;

            results.push({
                symbol: key,
                name: data.name,
                price: data.price,
                changesPercentage: data.changesPercentage,
                pe: data.pe,
                eps: data.eps,
                marketCap: data.marketCap,
                sentiment: sentiment,
                lynchStatus: isLynchFit ? "⭐ Lynch Fit" : "Watchlist",
                timestamp: new Date().toLocaleTimeString()
            });

            console.log(`✅ ดึงข้อมูล ${key} สำเร็จ!`);

        } catch (error) {
            console.error(`💥 เกิดข้อผิดพลาดร้ายแรงกับหุ้น ${key}:`, error.message);
            results.push({ symbol: key, error: true });
        }
    }

    res.json(results);
});

module.exports = app;
