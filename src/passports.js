const crypto = require("crypto");
const { analyzeProductUrl } = require("./analyzer");

const allowedStatuses = new Set(["draft", "published", "archived"]);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function assertProductUrl(productUrl) {
  if (!productUrl || typeof productUrl !== "string") {
    throw new Error("Product URL is required");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(productUrl);
  } catch (error) {
    throw new Error("Product URL is required");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Product URL must start with http:// or https://");
  }

  return parsedUrl;
}

function valueOrNotFound(value) {
  return value && value !== "not_found" ? value : "not_found";
}

function buildPassportFromAnalysis(productUrl, analysis, generatedAt = nowIso()) {
  const parsedUrl = assertProductUrl(productUrl);
  const metadata = analysis.metadata || {};
  const snapshot = metadata.productPageSnapshot || null;

  return {
    id: createId("pp"),
    publicId: null,
    status: "draft",
    productUrl,
    retailer: metadata.retailer || parsedUrl.hostname.replace(/^www\./, ""),
    productName: valueOrNotFound(snapshot && snapshot.likelyProductName),
    brand: valueOrNotFound(snapshot && snapshot.likelyBrand),
    extractionStatus: snapshot ? snapshot.extractionStatus : "partial",
    report: analysis.report || {},
    snapshot,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    publishedAt: null,
  };
}

function toApiPassport(passport) {
  if (!passport) {
    return null;
  }

  return {
    id: passport.id,
    publicId: passport.publicId,
    status: passport.status,
    productUrl: passport.productUrl,
    retailer: passport.retailer,
    productName: passport.productName,
    brand: passport.brand,
    extractionStatus: passport.extractionStatus,
    report: passport.report,
    snapshot: passport.snapshot,
    createdAt: passport.createdAt,
    updatedAt: passport.updatedAt,
    publishedAt: passport.publishedAt,
  };
}

function toAnalysisShape(passport) {
  return {
    metadata: {
      productUrl: passport.productUrl,
      retailer: passport.retailer,
      productPageSnapshot: passport.snapshot,
    },
    report: passport.report,
  };
}

function eventFor(passportId, eventType, payload = {}, createdAt = nowIso()) {
  return {
    id: createId("evt"),
    passportId,
    eventType,
    payload,
    createdAt,
  };
}

async function createPassport({ productUrl, store, analyzer = analyzeProductUrl, clock = nowIso }) {
  assertProductUrl(productUrl);

  const analysis = await analyzer(productUrl);
  const createdAt = clock();
  const passport = buildPassportFromAnalysis(productUrl, analysis, createdAt);
  const stored = store.createPassport(passport);

  store.recordEvent(eventFor(stored.id, "passport.created", {
    productUrl,
    extractionStatus: stored.extractionStatus,
  }, createdAt));

  return stored;
}

function listPassports({ store, status, limit }) {
  if (status && !allowedStatuses.has(status)) {
    throw new Error("Unsupported passport status");
  }

  return store.listPassports({ status, limit });
}

function getPassport({ store, id }) {
  return store.getPassport(id);
}

function getPublishedPassport({ store, publicId }) {
  return store.getPassportByPublicId(publicId);
}

function updatePassport({ store, id, patch, clock = nowIso }) {
  const existing = store.getPassport(id);

  if (!existing) {
    return null;
  }

  const changes = {
    updatedAt: clock(),
  };

  if (Object.prototype.hasOwnProperty.call(patch, "productName")) {
    changes.productName = String(patch.productName || "").trim() || "not_found";
  }

  if (Object.prototype.hasOwnProperty.call(patch, "brand")) {
    changes.brand = String(patch.brand || "").trim() || "not_found";
  }

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    if (!allowedStatuses.has(patch.status)) {
      throw new Error("Unsupported passport status");
    }

    if (patch.status === "published") {
      throw new Error("Use the publish endpoint to publish a passport");
    }

    changes.status = patch.status;
  }

  const updated = store.updatePassport(id, changes);
  store.recordEvent(eventFor(id, "passport.updated", changes, changes.updatedAt));

  return updated;
}

function publishPassport({ store, id, clock = nowIso }) {
  const existing = store.getPassport(id);

  if (!existing) {
    return null;
  }

  const publishedAt = existing.publishedAt || clock();
  const publicId = existing.publicId || createId("pub");
  const updated = store.updatePassport(id, {
    publicId,
    status: "published",
    updatedAt: publishedAt,
    publishedAt,
  });

  store.recordEvent(eventFor(id, "passport.published", {
    publicId,
  }, publishedAt));

  return updated;
}

module.exports = {
  allowedStatuses,
  assertProductUrl,
  buildPassportFromAnalysis,
  createPassport,
  getPassport,
  getPublishedPassport,
  listPassports,
  publishPassport,
  toAnalysisShape,
  toApiPassport,
  updatePassport,
};
