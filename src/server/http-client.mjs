import { execFileSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import process from "node:process";

const DEFAULT_TIMEOUT_MS = 15000;

export function resolveProxyUrl({
  env = process.env,
  platform = process.platform,
  execFileSyncImpl = execFileSync
} = {}) {
  const envProxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  if (envProxy) {
    return normalizeProxyUrl(envProxy);
  }

  if (platform !== "win32") {
    return null;
  }

  const internetSettings = readWindowsInternetSettings(execFileSyncImpl);
  if (internetSettings.proxyEnable !== true || !internetSettings.proxyServer) {
    return null;
  }

  return normalizeProxyUrl(selectWindowsProxyServer(internetSettings.proxyServer));
}

export function normalizeProxyUrl(proxyValue) {
  if (typeof proxyValue !== "string" || proxyValue.trim().length === 0) {
    return null;
  }

  const trimmedValue = proxyValue.trim();
  return /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `http://${trimmedValue}`;
}

export function selectWindowsProxyServer(proxyServer) {
  if (typeof proxyServer !== "string") {
    return null;
  }

  if (!proxyServer.includes(";")) {
    return proxyServer;
  }

  const entries = new Map();
  for (const entry of proxyServer.split(";")) {
    const [name, ...valueParts] = entry.split("=");
    const value = valueParts.join("=");
    if (name && value) {
      entries.set(name.trim().toLowerCase(), value.trim());
    }
  }

  return entries.get("https") ?? entries.get("http") ?? entries.values().next().value ?? null;
}

export function createHttpFetch({ proxyUrl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return async function httpFetch(url, options = {}) {
    const targetUrl = url instanceof URL ? url : new URL(url);
    const response = proxyUrl && targetUrl.protocol === "https:"
      ? await requestHttpsViaProxy(targetUrl, options, proxyUrl, timeoutMs)
      : await requestDirect(targetUrl, options, timeoutMs);

    if (isRedirect(response.status) && response.headers.location && options.redirect !== "manual") {
      const redirectUrl = new URL(response.headers.location, targetUrl);
      return httpFetch(redirectUrl, {
        ...options,
        method: "GET",
        body: undefined
      });
    }

    return createFetchLikeResponse(response);
  };
}

function readWindowsInternetSettings(execFileSyncImpl) {
  try {
    const output = execFileSyncImpl("reg", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      "/v",
      "ProxyEnable"
    ], { encoding: "utf8" });
    const proxyEnable = /\bProxyEnable\s+REG_DWORD\s+0x1\b/i.test(output);

    const serverOutput = execFileSyncImpl("reg", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      "/v",
      "ProxyServer"
    ], { encoding: "utf8" });
    const proxyServer = serverOutput.match(/\bProxyServer\s+REG_SZ\s+(.+)$/im)?.[1]?.trim() ?? null;

    return {
      proxyEnable,
      proxyServer
    };
  } catch {
    return {
      proxyEnable: false,
      proxyServer: null
    };
  }
}

function requestDirect(targetUrl, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = normalizeBody(options.body);
    const headers = buildHeaders(targetUrl, options.headers, body);
    const transport = targetUrl.protocol === "https:" ? https : http;
    const request = transport.request(targetUrl, {
      method: options.method ?? "GET",
      headers,
      timeout: timeoutMs
    }, (response) => {
      collectNodeResponse(response).then(resolve, reject);
    });

    request.on("timeout", () => {
      request.destroy(new Error("steam_request_timeout"));
    });
    request.on("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function requestHttpsViaProxy(targetUrl, options, proxyUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl);
    const proxyPort = Number.parseInt(proxy.port || "80", 10);
    const body = normalizeBody(options.body);
    const headers = buildHeaders(targetUrl, options.headers, body);
    const connectRequest = http.request({
      host: proxy.hostname,
      port: proxyPort,
      method: "CONNECT",
      path: `${targetUrl.hostname}:443`,
      headers: {
        Host: `${targetUrl.hostname}:443`
      },
      timeout: timeoutMs
    });

    connectRequest.on("connect", (connectResponse, socket) => {
      if (connectResponse.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`proxy_connect_failed:${connectResponse.statusCode}`));
        return;
      }

      const tlsSocket = tls.connect({
        socket,
        servername: targetUrl.hostname
      });
      tlsSocket.setTimeout(timeoutMs);
      tlsSocket.on("secureConnect", () => {
        tlsSocket.write(serializeHttpRequest(targetUrl, options.method ?? "GET", headers, body));
      });
      tlsSocket.on("timeout", () => {
        tlsSocket.destroy(new Error("steam_request_timeout"));
      });
      tlsSocket.on("error", reject);
      collectRawHttpResponse(tlsSocket).then(resolve, reject);
    });

    connectRequest.on("timeout", () => {
      connectRequest.destroy(new Error("proxy_connect_timeout"));
    });
    connectRequest.on("error", reject);
    connectRequest.end();
  });
}

function buildHeaders(targetUrl, headersInput, body) {
  const headers = {
    Host: targetUrl.host,
    Accept: "*/*",
    "Accept-Encoding": "identity",
    Connection: "close",
    ...normalizeHeaders(headersInput)
  };

  if (body && !hasHeader(headers, "content-length")) {
    headers["Content-Length"] = Buffer.byteLength(body);
  }

  return headers;
}

function normalizeHeaders(headersInput) {
  if (!headersInput) {
    return {};
  }

  if (typeof headersInput.entries === "function") {
    return Object.fromEntries(headersInput.entries());
  }

  if (Array.isArray(headersInput)) {
    return Object.fromEntries(headersInput);
  }

  return { ...headersInput };
}

function normalizeBody(body) {
  if (body == null) {
    return null;
  }

  return Buffer.isBuffer(body) ? body : Buffer.from(String(body));
}

function hasHeader(headers, headerName) {
  const targetName = headerName.toLowerCase();
  return Object.keys(headers).some((name) => name.toLowerCase() === targetName);
}

function serializeHttpRequest(targetUrl, method, headers, body) {
  const headerLines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  const requestLine = `${method} ${targetUrl.pathname}${targetUrl.search} HTTP/1.1`;
  const head = `${requestLine}\r\n${headerLines.join("\r\n")}\r\n\r\n`;
  return body ? Buffer.concat([Buffer.from(head), body]) : Buffer.from(head);
}

async function collectNodeResponse(response) {
  const body = await collectStream(response);
  return {
    status: response.statusCode ?? 0,
    statusText: response.statusMessage ?? "",
    headers: normalizeResponseHeaders(response.headers),
    body
  };
}

function collectRawHttpResponse(socket) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    socket.on("data", (chunk) => {
      chunks.push(chunk);
    });
    socket.on("end", () => {
      try {
        resolve(parseRawHttpResponse(Buffer.concat(chunks)));
      } catch (error) {
        reject(error);
      }
    });
    socket.on("error", reject);
  });
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => {
      chunks.push(chunk);
    });
    stream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    stream.on("error", reject);
  });
}

function parseRawHttpResponse(buffer) {
  const separator = Buffer.from("\r\n\r\n");
  const headerEnd = buffer.indexOf(separator);
  if (headerEnd === -1) {
    throw new Error("invalid_http_response");
  }

  const headerText = buffer.subarray(0, headerEnd).toString("latin1");
  const body = buffer.subarray(headerEnd + separator.length);
  const [statusLine, ...headerLines] = headerText.split("\r\n");
  const statusMatch = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})\s*(.*)$/);
  if (!statusMatch) {
    throw new Error("invalid_http_status_line");
  }

  return {
    status: Number.parseInt(statusMatch[1], 10),
    statusText: statusMatch[2],
    headers: parseHeaderLines(headerLines),
    body: decodeChunkedBodyIfNeeded(body, parseHeaderLines(headerLines))
  };
}

function parseHeaderLines(headerLines) {
  const headers = {};
  for (const line of headerLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return headers;
}

function normalizeResponseHeaders(headers) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers)) {
    normalized[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return normalized;
}

function decodeChunkedBodyIfNeeded(body, headers) {
  if (!/\bchunked\b/i.test(headers["transfer-encoding"] ?? "")) {
    return body;
  }

  const chunks = [];
  let offset = 0;
  while (offset < body.length) {
    const lineEnd = body.indexOf("\r\n", offset);
    if (lineEnd === -1) {
      break;
    }

    const sizeText = body.subarray(offset, lineEnd).toString("ascii").split(";")[0];
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size < 0) {
      throw new Error("invalid_chunked_response");
    }

    offset = lineEnd + 2;
    if (size === 0) {
      break;
    }

    chunks.push(body.subarray(offset, offset + size));
    offset += size + 2;
  }

  return Buffer.concat(chunks);
}

function createFetchLikeResponse(response) {
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    text: async () => response.body.toString("utf8"),
    json: async () => JSON.parse(response.body.toString("utf8"))
  };
}

function isRedirect(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
