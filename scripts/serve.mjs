import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preferredPort = Number.parseInt(process.env.PORT ?? "5173", 10);
const host = "127.0.0.1";
const maxPortAttempts = 20;

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"]
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = requestUrl.pathname === "/" ? "/src/client/index.html" : decodeURIComponent(requestUrl.pathname);
    const absolutePath = path.resolve(root, pathname.slice(1));

    if (!absolutePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Length": fileStat.size,
      "Content-Type": mimeTypes.get(path.extname(absolutePath)) ?? "application/octet-stream"
    });
    createReadStream(absolutePath).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(500);
    response.end("Internal server error");
  }
});

listenOn(preferredPort, 0);

function listenOn(port, attempt) {
  server.once("error", (error) => {
    if (error?.code === "EADDRINUSE" && attempt < maxPortAttempts) {
      listenOn(port + 1, attempt + 1);
      return;
    }

    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`dev server: http://${host}:${port}`);
  });
}
