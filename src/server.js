import http from "node:http";
import { main as runReservationMain } from "./index.js";

const port = Number(process.env.PORT ?? 8080);
let activeRun = null;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && request.url === "/run") {
    if (activeRun) {
      sendJson(response, 409, {
        ok: false,
        message: "Reservation bot is already running."
      });
      return;
    }

    activeRun = runReservationMain();

    try {
      const result = await activeRun;
      sendJson(response, 200, {
        ok: true,
        result
      });
    } catch (error) {
      console.error(error);
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      activeRun = null;
    }
    return;
  }

  sendJson(response, 404, {
    ok: false,
    message: "Not found"
  });
});

server.listen(port, () => {
  console.log(`Reservation service listening on port ${port}`);
});
