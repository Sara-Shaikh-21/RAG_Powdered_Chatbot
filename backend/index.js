require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("redis");

const app = express();
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// ---------------- Redis ----------------
const redis = createClient();
redis.on("error", (err) => console.error("❌ Redis error:", err));
redis.connect().then(() => console.log("✅ Connected to Redis"));

// ---------------- Load Xenova Transformers dynamically ----------------
let embedder, generator;
(async () => {
    const { pipeline } = await import("@xenova/transformers");
    console.log("✅ Transformers pipeline loading...");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    generator = await pipeline("text-generation", "Xenova/gpt2");
    console.log("✅ Pipelines ready: all-MiniLM-L6-v2 & GPT-2");
})();

// ---------------- Load news articles ----------------
const articlesPath = path.join(__dirname, "news_articles.json");
const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));

// ---------------- Helper: Cosine Similarity ----------------
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// ---------------- Helper: Top-K Article Retrieval ----------------
async function getTopKArticles(query, k = 3) {
    if (!embedder) throw new Error("Embedder pipeline not loaded yet!");

    // 1️⃣ Embed the query
    const queryEmbedding = (await embedder(query, { pooling: "mean", normalize: true })).data;

    // 2️⃣ Embed all articles
    const articleEmbeddings = [];
    for (const article of articles) {
        const embRes = await embedder(article.content, { pooling: "mean", normalize: true });
        articleEmbeddings.push({ article, embedding: embRes.data });
    }

    // 3️⃣ Compute cosine similarity
    const similarities = articleEmbeddings.map(({ article, embedding }) => ({
        article,
        score: cosineSimilarity(queryEmbedding, embedding),
    }));

    // 4️⃣ Return top K
    similarities.sort((a, b) => b.score - a.score);
    return similarities.slice(0, k).map(s => s.article);
}

// ---------------- 1️⃣ Create session ----------------
app.post("/session", async (req, res) => {
    const sessionId = uuidv4();
    try {
        // No need to initialize Redis key here; will create list on first push
        res.json({ sessionId });
    } catch (err) {
        console.error("Error creating session:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------- 2️⃣ Chat endpoint ----------------
app.post("/chat", async (req, res) => {
    try {
        const { sessionId, message } = req.body;
        if (!sessionId || !message) {
            return res.status(400).json({ error: "sessionId and message required" });
        }
        if (!generator) {
            return res.status(503).json({ error: "Model is still loading, try again in a few seconds." });
        }

        // 1️⃣ Retrieve top 3 relevant articles
        const topArticles = await getTopKArticles(message, 2);
        console.log(topArticles);

        // 2️⃣ Clean and prepare article snippets (first 2 sentences max)
        let context = topArticles
            .map(a => {
                const snippet = a.content.split(". ").slice(0, 2).join(". ");
                return `${a.title}\n${snippet}.`;
            })
            .join("\n\n");

        // 3️⃣ Construct clear instruction prompt
        const prompt = `
  
  ${context}
  
  
  `;

        // 4️⃣ Generate answer using GPT-2
        const output = await generator(prompt, { max_new_tokens: 150 });
        let botReply = output[0]?.generated_text || "";

        // 5️⃣ Post-process repeated lines
        const lines = botReply.split("\n").filter((line, index, arr) => arr.indexOf(line) === index);
        botReply = lines.join("\n").trim();

        // 6️⃣ Save user message and bot reply to Redis
        const key = `session:${sessionId}`;
        const type = await redis.type(key);
        if (type !== "none" && type !== "list") await redis.del(key);

        await redis.rPush(key, JSON.stringify({ role: "user", content: message }));
        await redis.rPush(key, JSON.stringify({ role: "bot", content: botReply }));
        await redis.expire(key, 3600);

        // 7️⃣ Return full chat history
        const historyData = await redis.lRange(key, 0, -1);
        const history = historyData.map(JSON.parse);

        res.json({ reply: botReply, history });
    } catch (err) {
        console.error("RAG Pipeline Error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});



// ---------------- 3️⃣ Get session history ----------------
app.get("/history/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    try {
        const historyData = await redis.lRange(`session:${sessionId}`, 0, -1);
        if (!historyData || historyData.length === 0) return res.json([]); // Return empty array if no history
        const history = historyData.map(JSON.parse);
        res.json(history);
    } catch (err) {
        console.error("History fetch error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------- 4️⃣ Reset / delete session ----------------
app.delete("/session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    try {
        const deletedCount = await redis.del(`session:${sessionId}`);
        if (deletedCount === 0) return res.status(404).json({ error: "Session not found" });
        res.json({ message: `Session ${sessionId} deleted successfully 🚀` });
    } catch (err) {
        console.error("Error deleting session:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------- Start server ----------------
const PORT = 3001;
app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));
