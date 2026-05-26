import { createServer } from "node:http";

// Skeleton Cloud Run service. The single endpoint `POST /trigger` is stubbed
// until F-008 wires Firebase JWT verification + Cloud Run Job invocation.
const PORT = Number(process.env.PORT ?? 8080);

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/trigger") {
    res.writeHead(501, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_implemented", since: "F-008" }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT);
