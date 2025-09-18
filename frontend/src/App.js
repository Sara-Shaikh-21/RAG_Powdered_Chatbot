// App.js
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const messagesEndRef = useRef(null);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // 1️⃣ Create a new session on load
  useEffect(() => {
    const createSession = async () => {
      try {
        const res = await axios.post("http://localhost:3001/session");
        setSessionId(res.data.sessionId);
        setChatHistory([]);
      } catch (err) {
        console.error("Error creating session:", err);
      }
    };
    createSession();
  }, []);

  // 2️⃣ Send message to backend
  const sendMessage = async () => {
    if (!message.trim() || !sessionId) return;

    try {
      const res = await axios.post("http://localhost:3001/chat", {
        message,
        sessionId,
      });

      const newEntry = {
        user: message,
        bot: res.data.reply,
        timestamp: new Date().toLocaleTimeString(),
      };
      setChatHistory((prev) => [...prev, newEntry]);
      setMessage("");
    } catch (err) {
      console.error("Send message error:", err);
      alert("Failed to send message. Make sure backend is running.");
    }
  };

  // 3️⃣ Fetch full session history (optional manual refresh)
  const fetchHistory = async () => {
    if (!sessionId) return;
    try {
      const res = await axios.get(`http://localhost:3001/history/${sessionId}`);
      // Convert history format to match newEntry shape
      const formattedHistory = res.data.map((entry) => ({
        user: entry.role === "user" ? entry.content : null,
        bot: entry.role === "bot" ? entry.content : null,
        timestamp: "", // no timestamp from backend, can add if you store it
      })).filter(e => e.user || e.bot);

      // Combine user and bot messages into pairs
      const combined = [];
      for (let i = 0; i < formattedHistory.length; i += 2) {
        combined.push({
          user: formattedHistory[i]?.user || "",
          bot: formattedHistory[i + 1]?.bot || "",
          timestamp: "",
        });
      }
      setChatHistory(combined);
    } catch (err) {
      console.error("Fetch history error:", err);
    }
  };

  // 4️⃣ Reset chat
  const resetChat = async () => {
    if (!sessionId) return;
    try {
      await axios.delete(`http://localhost:3001/session/${sessionId}`);
      setChatHistory([]);
      const res = await axios.post("http://localhost:3001/session");
      setSessionId(res.data.sessionId);
    } catch (err) {
      console.error("Reset chat error:", err);
    }
  };

  return (
    <div
      style={{
        maxWidth: 700,
        margin: "30px auto",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "90vh",
        border: "1px solid #ddd",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        backgroundColor: "#fafafa",
      }}
    >
      <header
        style={{
          padding: "15px 20px",
          borderBottom: "1px solid #ddd",
          backgroundColor: "#4a90e2",
          color: "white",
          fontSize: 24,
          fontWeight: "bold",
          textAlign: "center",
          userSelect: "none",
        }}
      >
        Gemini Chat
      </header>

      <main
        style={{
          flexGrow: 1,
          padding: "20px",
          overflowY: "auto",
          backgroundColor: "#fff",
        }}
      >
        {chatHistory.length === 0 && (
          <p style={{ color: "#888", textAlign: "center", marginTop: 50 }}>
            Start the conversation by typing a message below.
          </p>
        )}

        {chatHistory.map((entry, idx) => (
          <div key={idx} style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  backgroundColor: "#4a90e2",
                  color: "white",
                  padding: "10px 15px",
                  borderRadius: "15px 15px 0 15px",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                  fontSize: 15,
                }}
              >
                {entry.user}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  backgroundColor: "#e1e1e1",
                  color: "#333",
                  padding: "10px 15px",
                  borderRadius: "15px 15px 15px 0",
                  whiteSpace: "pre-wrap",
                  fontSize: 15,
                  fontFamily: "'Courier New', Courier, monospace",
                }}
              >
                {entry.bot}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer
        style={{
          padding: "15px 20px",
          borderTop: "1px solid #ddd",
          backgroundColor: "#f5f5f5",
          display: "flex",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type your message..."
          style={{
            flexGrow: 1,
            padding: "10px 15px",
            fontSize: 16,
            borderRadius: 20,
            border: "1px solid #ccc",
            outline: "none",
            marginRight: 10,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!message.trim()}
          style={{
            backgroundColor: message.trim() ? "#4a90e2" : "#a0c4f7",
            color: "white",
            border: "none",
            borderRadius: 20,
            padding: "10px 20px",
            fontSize: 16,
            cursor: message.trim() ? "pointer" : "not-allowed",
            transition: "background-color 0.3s",
          }}
          aria-label="Send message"
        >
          Send
        </button>
        <button
          onClick={resetChat}
          style={{
            marginLeft: 10,
            backgroundColor: "#f44336",
            color: "white",
            border: "none",
            borderRadius: 20,
            padding: "10px 20px",
            fontSize: 16,
            cursor: "pointer",
          }}
          aria-label="Reset chat"
        >
          Reset
        </button>
        <button
          onClick={fetchHistory}
          style={{
            marginLeft: 10,
            backgroundColor: "#777",
            color: "white",
            border: "none",
            borderRadius: 20,
            padding: "10px 20px",
            fontSize: 16,
            cursor: "pointer",
          }}
          aria-label="Refresh chat history"
        >
          Refresh
        </button>
      </footer>
    </div>
  );
}

export default App;