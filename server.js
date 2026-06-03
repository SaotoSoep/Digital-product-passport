const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const { analyzeProductUrl } = require("./src/analyzer");
const { safeHandlePassportApi } = require("./src/http/passport-api");
const { SqlitePassportStore } = require("./src/lib/storage/sqlite");

const publicDir = path.join(__dirname, "public");
const port = process.env.PORT || 3000;
const passportStore = new SqlitePassportStore();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendApiResponse(response, apiResponse) {
  response.writeHead(apiResponse.statusCode, apiResponse.headers);
  response.end(apiResponse.body);
}

function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });
    response.end(content);
  });
}

function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;

      if (rawBody.length > 1e6) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const method = request.method || "GET";
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);

  if (method === "POST" && requestUrl.pathname === "/api/analyze") {
    try {
      const body = await collectRequestBody(request);
      const report = await analyzeProductUrl(body.productUrl);
      sendJson(response, 200, report);
    } catch (error) {
      const statusCode = error.message === "Product URL is required" ? 400 : 500;
      sendJson(response, statusCode, {
        error: error.message || "Unexpected error",
      });
    }
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    let body = {};

    if (method === "POST" || method === "PATCH") {
      try {
        body = await collectRequestBody(request);
      } catch (error) {
        sendJson(response, 400, { error: error.message || "Invalid request body" });
        return;
      }
    }

    const passportApiResponse = await safeHandlePassportApi({
      method,
      pathname: requestUrl.pathname,
      body,
      searchParams: requestUrl.searchParams,
      store: passportStore,
    });

    if (passportApiResponse) {
      sendApiResponse(response, passportApiResponse);
      return;
    }
  }

  if (method === "GET") {
    serveStaticFile(requestUrl.pathname, response);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(port, () => {
  console.log(`Product Passport Agent running at http://localhost:${port}`);
});
