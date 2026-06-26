const { isPublicUrlError } = require("../lib/security/public-url");
const {
  RequestBodyError,
  analysisCacheKey,
  createConcurrencyLimiter,
  createDuplicateSuppressor,
  createRateLimiter,
  numberFromEnv,
} = require("../lib/security/request-controls");

function errorStatus(error) {
  if (error && Number.isInteger(error.statusCode)) {
    return error.statusCode;
  }

  if (/^(Product URL|User-provided evidence|An HTML file name)/.test(error && error.message || "")) {
    return 400;
  }

  return 500;
}

function publicErrorCode(error) {
  if (isPublicUrlError(error)) {
    return error.reason;
  }

  if (error && error.reason) {
    return error.reason;
  }

  return "analysis_failed";
}

function errorPayload(error) {
  const status = errorStatus(error);

  if (status >= 500) {
    return {
      error: "Unexpected error",
      code: "analysis_failed",
    };
  }

  return {
    error: error.message || "Invalid request",
    code: publicErrorCode(error),
  };
}

function createAnalyzeGateway({
  analyzer,
  rateLimiter,
  concurrencyLimiter,
  duplicateSuppressor,
  rateLimitWindowMs = numberFromEnv("ANALYZE_RATE_LIMIT_WINDOW_MS", 60000, 1000),
  rateLimitMax = numberFromEnv("ANALYZE_RATE_LIMIT_MAX", 20, 1),
  concurrencyMax = numberFromEnv("ANALYZE_CONCURRENCY_MAX", 3, 1),
  duplicateTtlMs = numberFromEnv("ANALYZE_DUPLICATE_TTL_MS", 30000, 0),
} = {}) {
  if (typeof analyzer !== "function") {
    throw new Error("Analyzer function is required");
  }

  const limiter = rateLimiter || createRateLimiter({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
  });
  const concurrency = concurrencyLimiter || createConcurrencyLimiter({
    max: concurrencyMax,
  });
  const duplicate = duplicateSuppressor || createDuplicateSuppressor({
    ttlMs: duplicateTtlMs,
  });

  async function runAnalysis(body) {
    return concurrency.run(() => analyzer(body.productUrl, {
      userProvidedEvidence: body.userProvidedEvidence,
    }));
  }

  return {
    async handle({ body, clientKey = "unknown" }) {
      const rate = limiter.check(clientKey);
      if (!rate.allowed) {
        return {
          statusCode: 429,
          payload: {
            error: "Too many analysis requests. Please retry shortly.",
            code: "rate_limited",
            retryAfterMs: rate.retryAfterMs,
          },
        };
      }

      try {
        const cacheKey = analysisCacheKey(body);
        const report = cacheKey
          ? await duplicate.getOrCreate(cacheKey, () => runAnalysis(body)).promise
          : await runAnalysis(body);

        return {
          statusCode: 200,
          payload: report,
        };
      } catch (error) {
        return {
          statusCode: errorStatus(error),
          payload: errorPayload(error),
        };
      }
    },
    reset() {
      if (typeof limiter.reset === "function") limiter.reset();
      if (typeof duplicate.reset === "function") duplicate.reset();
    },
  };
}

function errorResponseFromBodyError(error) {
  if (error instanceof RequestBodyError) {
    return {
      statusCode: error.statusCode,
      payload: {
        error: error.message,
        code: error.reason,
      },
    };
  }

  return {
    statusCode: 400,
    payload: {
      error: error.message || "Invalid JSON body",
      code: "invalid_json",
    },
  };
}

module.exports = {
  createAnalyzeGateway,
  errorPayload,
  errorResponseFromBodyError,
  errorStatus,
};
