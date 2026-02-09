const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ ok: true, service: "api", hint: "Try /health" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "newchums-api" });
});

app.listen(3001, () => {
  console.log("API listening on http://localhost:3001");
});
