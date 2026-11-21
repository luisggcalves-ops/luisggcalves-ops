/**
 * Serve the app and the local Supabase API on ONE port, so the app can be
 * opened from a remote preview / another device where only that port is
 * reachable. Supabase paths go to the local stack (WebSockets included for
 * Realtime); everything else goes to Next.js.
 *
 *   NEXT_PUBLIC_SUPABASE_SAME_ORIGIN=1 npm run build
 *   npx next start -p 3001 & node scripts/preview-proxy.mjs
 */
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.PORT ?? 3000);
const NEXT = { host: "127.0.0.1", port: Number(process.env.NEXT_PORT ?? 3001) };
const SUPABASE = { host: "127.0.0.1", port: Number(process.env.SUPABASE_PORT ?? 54321) };
const isSupabase = (url = "") => /^\/(auth|rest|realtime|storage|functions|graphql)\/v1(\/|\?|$)/.test(url);
const target = (url) => (isSupabase(url) ? SUPABASE : NEXT);

const server = http.createServer((req, res) => {
  const t = target(req.url);
  const upstream = http.request(
    { ...t, method: req.method, path: req.url, headers: { ...req.headers, host: `${t.host}:${t.port}` } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("Upstream unavailable");
  });
  req.pipe(upstream);
});

// WebSocket upgrades (Supabase Realtime, Next dev HMR)
server.on("upgrade", (req, socket, head) => {
  const t = target(req.url);
  const up = net.connect(t.port, t.host, () => {
    const headers = Object.entries({ ...req.headers, host: `${t.host}:${t.port}` })
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    up.write(head);
    up.pipe(socket).pipe(up);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

server.listen(PORT, () => console.log(`preview proxy on :${PORT} → next :${NEXT.port}, supabase :${SUPABASE.port}`));
