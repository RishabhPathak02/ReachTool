require("dotenv").config();
const express = require("express");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");

// Route Imports
const uploadRoutes = require("./routes/upload");
const instagramRoutes = require("./routes/instagram");
const createDownloadRoutes = require("./routes/downloadCsv");
const celebsRoutes = require("./routes/celebs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",  // Optional: Add allowed origins here in production for security
  }
});

// ====== EJS SETUP ======
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ====== MIDDLEWARE ======
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

// ====== SOCKET.IO ======
io.on("connection", socket => {
  console.log("✅ Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// ====== ROUTES ======
app.get("/", (req, res) => res.render("home", { title: "Instagram Reach & Engagement Tool" }));
app.use("/upload", uploadRoutes);
app.use("/feature/celebrities", celebsRoutes);
app.use("/instagram", instagramRoutes);
app.use("/download/csv", createDownloadRoutes(io));

// ====== 404 HANDLER ======
app.use((req, res) => {
  res.status(404).render("Reach/error", { message: "404 - Page Not Found" });
});

// ====== GLOBAL ERROR HANDLER ======
app.use((err, req, res, next) => {
  console.error("🔥 Unhandled Error:", err.stack);
  res.status(500).render("Reach/error", { message: "Something went wrong on the server. Please try again later." });
});

// ====== SERVER LISTEN ======
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running at: http://localhost:${PORT} OR https://reachtool.onrender.com`);
});

// ====== KEEP-ALIVE FOR RENDER FREE HOSTING ======
setInterval(() => {
  axios.get("https://reachtool.onrender.com")
    .then(() => console.log("🟢 Keep-alive ping sent"))
    .catch(err => console.error("🔴 Keep-alive error:", err.message));
}, 5 * 60 * 1000);
