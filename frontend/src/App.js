import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = "http://localhost:3001";

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  // Create new session on mount
  useEffect(() => {
    if (!sessionId) {
      const createSession = async () => {
        const res = await axios.post(`${API_BASE}/session`);
        setSessionId(res.data.sessionId);
      };
      createSession();
    }
  }, [sessionId]);


  const sendMessage = async () => {
    if (!input.trim() || !sessionId) return;

    try {
      const res = await axios.post(`${API_BASE}/chat`, {
        sessionId,
        message: input,
      });

      setMessages(res.data.history); // use full history from backend
      setInput("");
    } catch (err) {
      console.error(err);
      alert("Failed to send message. Make sure backend is running.");
    }
  };

  const resetSession = async () => {
    if (!sessionId) return;

    try {
      await axios.delete(`${API_BASE}/session/${sessionId}`);
      const res = await axios.post(`${API_BASE}/session`);
      setSessionId(res.data.sessionId);
      setMessages([]);
    } catch (err) {
      console.error(err);
    }
  };



  return (
    <div className="chat-container">
      <h2>📰 News RAG Chatbot</h2>
      <div className="chat-box">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === "user" ? "message user" : "message bot"}
          >
            <strong>{msg.role === "user" ? "You" : "Bot"}:</strong>{" "}
            {msg.content}
          </div>
        ))}
      </div>
      <div className="input-box">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
        <button onClick={resetSession}>Reset</button>
      </div>
    </div>
  );
}

export default App;
