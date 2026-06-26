const dns = require("dns").promises;
const net = require("net");

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

module.exports = {
  isBlockedHostname,
  isPrivateOrReservedIp,
  validatePublicUrl,
};
