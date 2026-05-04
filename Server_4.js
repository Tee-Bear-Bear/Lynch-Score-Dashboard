const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// 🔑 API Key ของพี่หมีที่ตรวจสอบแล้วว่าถูกต้อง
const API_KEY = "SFtbTv6ztA9vxVnSxXvaHdMLDCWhxxn5";

// ระบบล้างแคชแจ้งเตือนทุก 24 ชั่วโมง
let alertedStocks = {};
setInterval(() => { alertedStocks = {}; }, 1000 * 60 * 60 * 24);

// ฟังก์ชันวิเคราะห์ความรู้สึกจากข่าว
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
    // รับชื่อหุ้นจากเว็บ หรือใช้ค่าเริ่มต้น AAP, LRCX, CROX
    const symbols = req.query.symbols ? req.query.symbols.split(",") : ["AAP", "LRCX", "CROX"];
    const results = [];

    console.log(`🚀 กำลังดึงข้อมูลหุ้นผ่านระบบ Stable สำหรับ: ${symbols.join(", ")}`);

    for (const symbol of symbols) {
        const key = symbol.trim().toUpperCase();
        try {
            // 🌐 ใช้ระบบ Stable Endpoint ตามคำแนะนำใน Error Log
            const quoteUrl = `https://financialmodelingprep.com/stable/quote?symbol=${key}&apikey=${API_KEY}`;
            const quoteRes = await fetch(quoteUrl);
            const quoteData = await quoteRes.json();

            // ตรวจสอบว่ามี Error จาก FMP หรือไม่
            if (quoteData["Error Message"]) {
                console.error(`❌ FMP Error (${key}): ${quoteData["Error Message"]}`);
                results.push({ symbol: key, error: true });
                continue;
            }

            // ระบบ Stable อาจคืนค่าเป็น Object หรือ Array (จัดการให้รองรับทั้งสองแบบ)
            const data = Array.isArray(quoteData) ? quoteData[0] : quoteData;

            if (!data || !data.symbol) {
                console.warn(`⚠️ ไม่พบข้อมูลหุ้น: ${key}`);
                results.push({ symbol: key, error: true });
                continue;
            }

            // ดึงข้อมูลข่าวผ่าน Stable Endpoint
            const newsUrl = `https://financialmodelingprep.com/stable/stock_news?tickers=${key}&limit=5&apikey=${API_KEY}`;
            const newsRes = await fetch(newsUrl);
            const newsData = await newsRes.json();
            const sentiment = await analyzeNewsSentiment(newsData);

            // คำนวณ Lynch Fit เบื้องต้น (PE ต่ำกว่า 20)
            const isLynchFit = data.pe && data.pe < 20;

            results.push({
                symbol: key,
                name: data.name || key,
                price: data.price,
                changesPercentage: data.changesPercentage,
                pe: data.pe || "N/A",
                eps: data.eps || "N/A",
                marketCap: data.marketCap,
                sentiment: sentiment,
                lynchStatus: isLynchFit ? "⭐ Lynch Fit" : "Watchlist",
                timestamp: new Date().toLocaleTimeString()
            });

            console.log(`✅ ดึงข้อมูล ${key} สำเร็จ!`);

        } catch (error) {
            console.error(`💥 พังที่หุ้น ${key}:`, error.message);
            results.push({ symbol: key, error: true });
        }
    }

    res.json(results);
});

module.exports = app;
