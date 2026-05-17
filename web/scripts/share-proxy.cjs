/* eslint-disable @typescript-eslint/no-require-imports */

const http = require("http");
const net = require("net");

const PROXY_PORT = 8080;
const FRONTEND_PORT = 3000;
const BACKEND_PORT = 4000;

function proxyHttp(req, res, targetPort, rewritePath = (path) => path) {
  const targetPath = rewritePath(req.url || "/");
  const options = {
    hostname: "127.0.0.1",
    port: targetPort,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${targetPort}`,
    },
  };

  const upstream = http.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on("error", (error) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Proxy error: ${error.message}`);
  });

  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head, targetPort) {
  const upstream = net.connect(targetPort, "127.0.0.1", () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);

    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        value.forEach((item) => upstream.write(`${name}: ${item}\r\n`));
      } else if (value !== undefined) {
        upstream.write(`${name}: ${value}\r\n`);
      }
    }

    upstream.write("\r\n");

    if (head.length > 0) {
      upstream.write(head);
    }

    socket.pipe(upstream).pipe(socket);
  });

  upstream.on("error", () => socket.destroy());
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    proxyHttp(req, res, BACKEND_PORT, (path) => path.replace(/^\/api/, ""));
    return;
  }

  proxyHttp(req, res, FRONTEND_PORT);
});

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/ws")) {
    proxyUpgrade(req, socket, head, BACKEND_PORT);
    return;
  }

  proxyUpgrade(req, socket, head, FRONTEND_PORT);
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`Share proxy listening on http://localhost:${PROXY_PORT}`);
});
