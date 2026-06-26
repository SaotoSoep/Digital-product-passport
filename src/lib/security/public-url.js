const dns = require("dns").promises;
const net = require("net");

const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

const blockedIps = new net.BlockList();

[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].forEach(([address, prefix]) => blockedIps.addSubnet(address, prefix, "ipv4"));

[
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
].forEach(([address, prefix]) => blockedIps.addSubnet(address, prefix, "ipv6"));

class PublicUrlError extends Error {
  constructor(reason, message, statusCode = 400) {
    super(message || publicUrlMessage(reason));
    this.name = "PublicUrlError";
    this.reason = reason;
    this.statusCode = statusCode;
    this.public = true;
  }
}

function publicUrlMessage(reason) {
  const messages = {
    invalid_url: "Product URL is required",
    unsupported_protocol: "Product URL must start with http:// or https://",
    private_url_blocked: "Product URL must be a public web page",
    dns_lookup_failed: "Product URL could not be resolved",
    redirect_target_blocked: "Product URL redirected to a blocked location",
    too_many_redirects: "Product URL redirected too many times",
    missing_redirect_location: "Product URL returned an invalid redirect",
    request_timeout: "Product page request timed out",
    response_body_too_large: "Product page response is too large",
  };

  return messages[reason] || "Product URL could not be fetched safely";
}

function isPublicUrlError(error) {
  return Boolean(error && error.name === "PublicUrlError");
}

function normalizeHostname(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
}

function isPrivateOrReservedIp(address) {
  const normalized = normalizeHostname(address);
  const ipv4Mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (ipv4Mapped) {
    return isPrivateOrReservedIp(ipv4Mapped[1]);
  }

  const family = net.isIP(normalized);
  if (!family) {
    return false;
  }

  return blockedIps.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

function isBlockedHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  );
}

function shouldSkipDnsLookup(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "skipDnsLookup")) {
    return Boolean(options.skipDnsLookup);
  }

  return process.env.NODE_ENV === "test" && !options.lookup;
}

async function validatePublicUrl(rawUrl, options = {}) {
  if (typeof options === "function") {
    options = { lookup: options };
  }

  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    return { ok: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "unsupported_protocol" };
  }

  if (options.allowPrivate || process.env.ALLOW_PRIVATE_URLS === "1") {
    return { ok: true, url: parsed.toString() };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (isBlockedHostname(hostname) || isPrivateOrReservedIp(hostname)) {
    return { ok: false, reason: "private_url_blocked" };
  }

  if (!net.isIP(hostname) && !shouldSkipDnsLookup(options)) {
    const lookup = options.lookup || dns.lookup;
    let addresses;

    try {
      addresses = await lookup(hostname, { all: true, verbatim: false });
    } catch (error) {
      return { ok: false, reason: "dns_lookup_failed" };
    }

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return { ok: false, reason: "dns_lookup_failed" };
    }

    if (addresses.some((item) => isPrivateOrReservedIp(item && item.address))) {
      return { ok: false, reason: "private_url_blocked" };
    }
  }

  return { ok: true, url: parsed.toString() };
}

async function validatePublicUrlOrThrow(rawUrl, options = {}) {
  const result = await validatePublicUrl(rawUrl, options);

  if (!result.ok) {
    throw new PublicUrlError(result.reason);
  }

  return result;
}

function redirectLocation(response) {
  if (!response || !response.headers || typeof response.headers.get !== "function") {
    return "";
  }

  return response.headers.get("location") || "";
}

function responseHeader(response, name) {
  if (!response || !response.headers || typeof response.headers.get !== "function") {
    return "";
  }

  return response.headers.get(name) || "";
}

async function readResponseTextWithLimit(response, maxBytes = DEFAULT_MAX_RESPONSE_BYTES) {
  const contentLength = Number(responseHeader(response, "content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PublicUrlError("response_body_too_large", undefined, 413);
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new PublicUrlError("response_body_too_large", undefined, 413);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = Buffer.from(value);
    totalBytes += chunk.byteLength;

    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PublicUrlError("response_body_too_large", undefined, 413);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function fetchPublicText(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
  const maxBytes = Number(options.maxBytes || DEFAULT_MAX_RESPONSE_BYTES);
  const maxRedirects = Number(options.maxRedirects || DEFAULT_MAX_REDIRECTS);
  const headers = options.headers || {};

  let current = (await validatePublicUrlOrThrow(rawUrl, options)).url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      let response;

      try {
        response = await fetchImpl(current, {
          headers,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (error && error.name === "AbortError") {
          throw new PublicUrlError("request_timeout", undefined, 408);
        }
        throw error;
      }

      if ([301, 302, 303, 307, 308].includes(Number(response.status))) {
        if (redirectCount >= maxRedirects) {
          throw new PublicUrlError("too_many_redirects");
        }

        const location = redirectLocation(response);
        if (!location) {
          throw new PublicUrlError("missing_redirect_location");
        }

        const nextUrl = new URL(location, current).toString();
        const validation = await validatePublicUrl(nextUrl, options);
        if (!validation.ok) {
          throw new PublicUrlError(
            validation.reason === "private_url_blocked" ? "redirect_target_blocked" : validation.reason
          );
        }
        current = validation.url;
        continue;
      }

      const text = await readResponseTextWithLimit(response, maxBytes);
      return {
        response,
        text,
        finalUrl: response.url || current,
      };
    }
  } finally {
    clearTimeout(timeout);
  }

  throw new PublicUrlError("too_many_redirects");
}

module.exports = {
  PublicUrlError,
  fetchPublicText,
  isBlockedHostname,
  isPrivateOrReservedIp,
  isPublicUrlError,
  publicUrlMessage,
  readResponseTextWithLimit,
  validatePublicUrl,
  validatePublicUrlOrThrow,
};
