const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();

// Allow requests from React frontend
app.use(cors({ origin: "http://localhost:3000" }));

app.use(express.json());

//redisss

const Redis = require("ioredis");

// Default connection (localhost:6379)
const redis = new Redis();

// Optional: log connection status
redis.on("connect", () => console.log("✅ Connected to Redis"));
redis.on("error", (err) => console.error("❌ Redis error:", err));



// In-memory store for now (we'll swap to Redis later)
const sessions = {};

// --- Routes ---

// Create new session
app.post("/session", async (req, res) => {
    const sessionId = uuidv4();

    try {
        // Save empty array for chat history
        await redis.set(sessionId, JSON.stringify([]));
        res.json({ sessionId });
    } catch (err) {
        console.error("Error creating session:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});




// Chat endpoint
app.post("/chat", async (req, res) => {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
        return res.status(400).json({ error: "sessionId and message are required" });
    }

    // Get chat history
    let history = await redis.get(sessionId);
    history = history ? JSON.parse(history) : [];

    // Add user message
    history.push({ role: "user", content: message });

    // Mock bot response
    const botResponse = `You said: "${message}". (This is a mocked response for now 🚀)`;
    history.push({ role: "bot", content: botResponse });

    // Save updated history back to Redis
    await redis.set(sessionId, JSON.stringify(history));

    res.json({ response: botResponse, history });
});


// Get session history
app.get("/session/:id/history", (req, res) => {
    const { id } = req.params;
    if (!sessions[id]) {
        return res.status(404).json({ error: "Session not found" });
    }
    res.json({ history: sessions[id] });
});

// Clear session
// Delete session
app.delete("/session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;

    try {
        // THIS ACTUALLY REMOVES THE KEY
        const deletedCount = await redis.del(sessionId);

        if (deletedCount === 0) {
            return res.status(404).json({ error: "Session not found" });
        }

        res.json({ message: `Session ${sessionId} deleted successfully 🚀` });
    } catch (err) {
        console.error("Error deleting session:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});



// Fetch session history
app.get("/history/:sessionId", async (req, res) => {
    const { sessionId } = req.params;

    try {
        const history = await redis.get(sessionId);  // <- use 'redis', not redisClient
        if (!history) {
            return res.status(404).json({ error: "Session not found" });
        }

        res.json(JSON.parse(history));
    } catch (err) {
        console.error("Error fetching history:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});



// Start server
app.listen(3001, () => {
    console.log("Backend server running on http://localhost:3001");
});
