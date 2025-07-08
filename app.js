require("dotenv").config();
const express = require("express");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const http = require("http");
const { Server } = require("socket.io");

const uploadRoutes = require("./routes/upload");
const instagramRoutes = require("./routes/instagram");
const createDownloadRoutes = require("./routes/downloadCsv");
const celebsRoutes = require('./routes/celebs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// EJS Setup
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

// Socket.IO
io.on("connection", socket => {
  console.log("Socket connected:", socket.id);
});

// Routes
app.get("/", (req, res) => res.render("home", { title: "Reach Tool" }));
app.use("/upload", uploadRoutes);
app.use("/feature/celebrities", celebsRoutes);
app.use("/instagram", instagramRoutes);
app.use("/download/csv", createDownloadRoutes(io));

// 404 Handler
// app.use((req, res) => {
//   res.status(404).render("404", { title: "Page Not Found" });
// });

// Server Listen
const PORT = process.env.PORT || 1000;
server.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
