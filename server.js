const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const { analyzeProductUrl } = require("./src/analyzer");
const {
  createAnalyzeGateway,
  errorResponseFromBodyError,
} = require("./src/http/analyze-gateway");
const { safeHandlePassportApi } = require("./src/http/passport-api");
const { SqlitePassportStore } = require("./src/lib/storage/sqlite");
const {
  DEFAULT_REQUEST_BODY_LIMIT_BYTES,
  clientKeyFromNodeRequest,
  numberFromEnv,
  readNodeJsonBody,
} = require("./src/lib/security/request-controls");

const publicDir = path.join(__dirname, "public");
const port = process.env.PORT || 3000;

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

function collectRequestBody(request, maxBytes = DEFAULT_REQUEST_BODY_LIMIT_BYTES) {
  return readNodeJsonBody(request, maxBytes);
}

function createAppServer({
  analyzer = analyzeProductUrl,
  passportStore = new SqlitePassportStore(),
} = {}) {
  const analyzeGateway = createAnalyzeGateway({ analyzer });
  const maxApiBodyBytes = numberFromEnv(
    "MAX_API_BODY_BYTES",
    DEFAULT_REQUEST_BODY_LIMIT_BYTES,
    1,
    1024 * 1024
  );

  return http.createServer(async (request, response) => {
    const method = request.method || "GET";
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);

    if (method === "POST" && requestUrl.pathname === "/api/analyze") {
      let body;

      try {
        body = await collectRequestBody(request, maxApiBodyBytes);
      } catch (error) {
        const apiError = errorResponseFromBodyError(error);
        sendJson(response, apiError.statusCode, apiError.payload);
        return;
      }

      const apiResponse = await analyzeGateway.handle({
        body,
        clientKey: clientKeyFromNodeRequest(request),
      });
      sendJson(response, apiResponse.statusCode, apiResponse.payload);
      return;
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      let body = {};

      if (method === "POST" || method === "PATCH") {
        try {
          body = await collectRequestBody(request, maxApiBodyBytes);
        } catch (error) {
          const apiError = errorResponseFromBodyError(error);
          sendJson(response, apiError.statusCode, apiError.payload);
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
}

if (require.main === module) {
  const server = createAppServer();
  server.listen(port, () => {
    console.log(`Product Passport Agent running at http://localhost:${port}`);
  });
}

module.exports = {
  collectRequestBody,
  createAppServer,
};
