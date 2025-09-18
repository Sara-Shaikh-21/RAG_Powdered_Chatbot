// index.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const Redis = require("ioredis");
const { OpenAI } = require("openai");
const { QdrantClient } = require("@qdrant/js-client-rest");

const app = express();

// --- Middleware ---
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// --- Redis setup ---
const redis = new Redis();
redis.on("connect", () => console.log("✅ Connected to Redis"));
redis.on("error", (err) => console.error("❌ Redis error:", err));

// --- OpenAI client ---
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// --- Qdrant client ---
const qdrant = new QdrantClient({ url: "http://localhost:6333" });

// --- Routes ---

// 1️⃣ Create new session
app.post("/session", async (req, res) => {
    const sessionId = uuidv4();
    try {
        await redis.set(`session:${sessionId}`, JSON.stringify([]));
        res.json({ sessionId });
    } catch (err) {
        console.error("Error creating session:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 2️⃣ Chat endpoint (RAG)
app.post("/chat", async (req, res) => {
    try {
        const { sessionId, message } = req.body;
        if (!sessionId || !message) return res.status(400).json({ error: "sessionId and message required" });

        // Embed user query
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: message
        });
        const queryVector = embeddingResponse.data[0].embedding;

        // Retrieve top 3 articles from Qdrant
        const searchResults = await qdrant.points.search({
            collection_name: "news_articles",
            vector: queryVector,
            limit: 3
        });

        const context = searchResults.map(r => r.payload.content).join("\n\n");

        // Generate response
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a helpful news assistant. Use the context to answer user questions." },
                { role: "user", content: `Context: ${context}\n\nQuestion: ${message}` }
            ]
        });

        const botResponse = completion.choices[0].message.content;

        // Save conversation to Redis
        const sessionKey = `session:${sessionId}`;
        await redis.rPush(sessionKey, JSON.stringify({ role: "user", content: message }));
        await redis.rPush(sessionKey, JSON.stringify({ role: "bot", content: botResponse }));

        // Return response + full history
        const history = await redis.lRange(sessionKey, 0, -1).then(arr => arr.map(JSON.parse));
        res.json({ response: botResponse, history });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 3️⃣ Fetch session history
app.get("/history/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    try {
        const history = await redis.lRange(`session:${sessionId}`, 0, -1).then(arr => arr.map(JSON.parse));
        if (!history || history.length === 0) return res.status(404).json({ error: "Session not found" });
        res.json(history);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 4️⃣ Reset / delete session
app.delete("/session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    try {
        const deletedCount = await redis.del(`session:${sessionId}`);
        if (deletedCount === 0) return res.status(404).json({ error: "Session not found" });
        res.json({ message: `Session ${sessionId} deleted successfully 🚀` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// --- Start server ---
const PORT = 3001;
app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`));
