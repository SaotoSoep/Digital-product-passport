import analyzerModule from "../../src/analyzer.js";
import analyzeGatewayModule from "../../src/http/analyze-gateway.js";
import requestControlsModule from "../../src/lib/security/request-controls.js";

const { analyzeProductUrl } = analyzerModule;
const {
  createAnalyzeGateway,
  errorResponseFromBodyError,
} = analyzeGatewayModule;
const {
  DEFAULT_REQUEST_BODY_LIMIT_BYTES,
  clientKeyFromWebRequest,
  numberFromEnv,
  readWebJsonBody,
} = requestControlsModule;

const analyzeGateway = createAnalyzeGateway({ analyzer: analyzeProductUrl });
const maxBodyBytes = numberFromEnv(
  "MAX_API_BODY_BYTES",
  DEFAULT_REQUEST_BODY_LIMIT_BYTES,
  1,
  1024 * 1024
);

function jsonResponse(payload, status) {
  return new Response(
    JSON.stringify(payload),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body;

  try {
    body = await readWebJsonBody(request, maxBodyBytes);
  } catch (error) {
    const apiError = errorResponseFromBodyError(error);
    return jsonResponse(apiError.payload, apiError.statusCode);
  }

  const apiResponse = await analyzeGateway.handle({
    body,
    clientKey: clientKeyFromWebRequest(request),
  });
  return jsonResponse(apiResponse.payload, apiResponse.statusCode);
};

export const config = {
  path: "/api/analyze",
  preferStatic: true,
};
