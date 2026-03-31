import { DurableObject } from "cloudflare:workers";

type WebSocketAttachment = {
  userId: string;
  userName: string;
};

/**
 * Per-plan chat room Durable Object.
 *
 * Uses the WebSocket Hibernation API so idle connections don't consume CPU.
 * This DO is a stateless broadcast relay; the database is the source of truth
 * for message history. It only holds open WebSocket connections and forwards
 * new messages to all connected participants in real time.
 */
export class ChatRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast" && request.method === "POST") {
      return this.handleBroadcast(request);
    }

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleWebSocketUpgrade(request: Request): Response {
    const userId = request.headers.get("X-User-Id") ?? "unknown";
    const userName = request.headers.get("X-User-Name") ?? "Someone";

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, userName } satisfies WebSocketAttachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    let message: unknown;
    try {
      message = await request.json();
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    const payload = JSON.stringify({ type: "chat_message", message });
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch { /* socket already closed */ }
    }
    return new Response("OK", { status: 200 });
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Messages are sent via REST, not through the WebSocket.
    // Reserved for future client-side events (typing indicators, etc.).
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    // Connection removed automatically by the runtime.
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // Connection removed automatically by the runtime.
  }
}
