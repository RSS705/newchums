import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("NewChums API is live"));
app.get("/health", (c) => c.json({ ok: true }));

export default app;
