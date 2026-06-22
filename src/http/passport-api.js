const {
  createPassport,
  getPassport,
  getPublishedPassport,
  listPassports,
  publishPassport,
  toAnalysisShape,
  toApiPassport,
  updatePassport,
} = require("../passports");

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  };
}

function errorResponse(statusCode, message) {
  return jsonResponse(statusCode, { error: message });
}

function linksForPassport(passport) {
  const links = {
    self: `/api/passports/${passport.id}`,
    publish: `/api/passports/${passport.id}/publish`,
  };

  if (passport.publicId) {
    links.public = `/api/public/passports/${passport.publicId}`;
  }

  return links;
}

function passportPayload(passport) {
  return {
    passport: toApiPassport(passport),
    analysis: toAnalysisShape(passport),
    links: linksForPassport(passport),
  };
}

function splitPath(pathname) {
  return pathname.split("/").filter(Boolean);
}

function normalizedProductUrl(value) {
  try {
    return new URL(value).toString();
  } catch (error) {
    return "";
  }
}

function findExistingDraft(store, productUrl) {
  const normalized = normalizedProductUrl(productUrl);
  if (!normalized) return null;

  return store.listPassports({ status: "draft", limit: 100 })
    .find((passport) => normalizedProductUrl(passport.productUrl) === normalized) || null;
}

async function handlePassportApi({ method, pathname, body = {}, searchParams, store }) {
  const parts = splitPath(pathname);

  if (method === "GET" && pathname === "/api/health") {
    store.listPassports({ limit: 1 });

    return jsonResponse(200, {
      status: "ok",
      storage: "available",
      service: "product-passport-backend",
    });
  }

  if (method === "GET" && pathname === "/api/passports") {
    const passports = listPassports({
      store,
      status: searchParams && searchParams.get("status"),
      limit: searchParams && searchParams.get("limit"),
    });

    return jsonResponse(200, {
      passports: passports.map(toApiPassport),
    });
  }

  if (method === "POST" && pathname === "/api/passports") {
    const existingDraft = findExistingDraft(store, body.productUrl);
    if (existingDraft && body.allowDuplicate !== true) {
      return jsonResponse(409, {
        error: "A draft already exists for this product URL. Choose analysis-only or explicitly save another draft.",
        code: "duplicate_draft",
        existingDraft: toApiPassport(existingDraft),
        links: linksForPassport(existingDraft),
      });
    }

    const passport = await createPassport({
      productUrl: body.productUrl,
      store,
    });

    return jsonResponse(201, passportPayload(passport));
  }

  if (
    method === "GET" &&
    parts.length === 3 &&
    parts[0] === "api" &&
    parts[1] === "passports"
  ) {
    const passport = getPassport({ store, id: parts[2] });

    if (!passport) {
      return errorResponse(404, "Passport not found");
    }

    return jsonResponse(200, passportPayload(passport));
  }

  if (
    method === "PATCH" &&
    parts.length === 3 &&
    parts[0] === "api" &&
    parts[1] === "passports"
  ) {
    const passport = updatePassport({
      store,
      id: parts[2],
      patch: body,
    });

    if (!passport) {
      return errorResponse(404, "Passport not found");
    }

    return jsonResponse(200, passportPayload(passport));
  }

  if (
    method === "POST" &&
    parts.length === 4 &&
    parts[0] === "api" &&
    parts[1] === "passports" &&
    parts[3] === "publish"
  ) {
    const passport = publishPassport({ store, id: parts[2] });

    if (!passport) {
      return errorResponse(404, "Passport not found");
    }

    return jsonResponse(200, passportPayload(passport));
  }

  if (
    method === "GET" &&
    parts.length === 4 &&
    parts[0] === "api" &&
    parts[1] === "public" &&
    parts[2] === "passports"
  ) {
    const passport = getPublishedPassport({ store, publicId: parts[3] });

    if (!passport) {
      return errorResponse(404, "Published passport not found");
    }

    return jsonResponse(200, passportPayload(passport));
  }

  return null;
}

async function safeHandlePassportApi(options) {
  try {
    return await handlePassportApi(options);
  } catch (error) {
    const badRequestMessages = new Set([
      "Product URL is required",
      "Product URL must start with http:// or https://",
      "Unsupported passport status",
      "Use the publish endpoint to publish a passport",
    ]);

    return errorResponse(
      badRequestMessages.has(error.message) ? 400 : 500,
      error.message || "Unexpected error"
    );
  }
}

module.exports = {
  findExistingDraft,
  handlePassportApi,
  jsonResponse,
  safeHandlePassportApi,
};
