import { createServer } from "node:http";
import { webServerConfig } from "@linkhub/config/web-server";
import next from "next";
import { sourceAttribution } from "./server/source";

const config = webServerConfig();
const dev = process.argv.includes("--dev");
const port = Number(process.env.WEB_PORT ?? 3000);
const hostname = process.env.WEB_HOST ?? "127.0.0.1";
const attribute = sourceAttribution(config.sourceSecret, config.trustedProxies);
const formAttribute = sourceAttribution(config.sourceSecret, config.trustedProxies, "form");
const app = next({ dev, hostname, port, ...(dev ? { webpack: true } : {}) });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer((request, response) => {
  // Always overwrite client-supplied attribution, before Next handles forms
  // or rendering. This header is server-only and carries no session authority.
  request.headers["x-web-read-source"] = attribute(request);
  request.headers["x-web-form-source"] = formAttribute(request);
  void handle(request, response).catch(() => {
    response.statusCode = 500;
    response.end("Unavailable");
  });
});
server.listen(port, hostname, () => {
  if (dev) console.log(`[web] Ready at ${config.publicOrigin} (listening on ${hostname}:${port})`);
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 3000);
  server.close();
  await app.close();
  server.closeAllConnections();
  clearTimeout(deadline);
  process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
