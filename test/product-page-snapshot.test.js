const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  extractProductPageSnapshot,
  fetchProductPageSnapshot,
} = require("../src/lib/product-page/snapshot");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

test("extracts visible product page fields from static HTML", () => {
  const snapshot = extractProductPageSnapshot(
    fixture("product-rich.html"),
    "https://shop.example/products/relaxed-overshirt?color=blue",
    new Date("2026-06-02T12:00:00.000Z")
  );

  assert.equal(snapshot.sourceUrl, "https://shop.example/products/relaxed-overshirt?color=blue");
  assert.equal(snapshot.extractionTimestamp, "2026-06-02T12:00:00.000Z");
  assert.equal(snapshot.extractionStatus, "success");
  assert.equal(snapshot.pageTitle, "Relaxed Organic Cotton Overshirt | Northline Studio");
  assert.equal(snapshot.canonicalUrl, "https://shop.example/products/relaxed-overshirt");
  assert.equal(snapshot.likelyProductName, "Relaxed Organic Cotton Overshirt");
  assert.equal(snapshot.likelyBrand, "Northline Studio");
  assert.match(snapshot.productDescriptionText[0], /everyday layering|organic cotton/);
  assert.match(snapshot.materialCompositionText[0], /78% organic cotton/);
  assert.match(snapshot.careText[0], /machine wash at 30°C/);
  assert(snapshot.sustainabilityClaimSnippets.some((snippet) => /responsible style/.test(snippet)));
  assert(snapshot.originText.some((snippet) => /Portugal/.test(snippet)));
  assert(snapshot.certificationText.some((snippet) => /GOTS certified/.test(snippet)));
  assert(snapshot.durabilityClaimSnippets.some((snippet) => /repair guarantee/.test(snippet)));
  assert(snapshot.extractionNotes.some((note) => note.includes("likely brand: found")));
});

test("marks absent product page fields as not_found or empty", () => {
  const snapshot = extractProductPageSnapshot(
    fixture("product-partial.html"),
    "https://shop.example/products/black-top",
    new Date("2026-06-02T12:00:00.000Z")
  );

  assert.equal(snapshot.extractionStatus, "partial");
  assert.equal(snapshot.pageTitle, "Black Everyday Top");
  assert.equal(snapshot.canonicalUrl, "not_found");
  assert.equal(snapshot.likelyBrand, "not_found");
  assert.deepEqual(snapshot.productDescriptionText, []);
  assert.deepEqual(snapshot.materialCompositionText, []);
  assert.deepEqual(snapshot.careText, []);
  assert.deepEqual(snapshot.sustainabilityClaimSnippets, []);
  assert.deepEqual(snapshot.originText, []);
  assert.deepEqual(snapshot.certificationText, []);
  assert.deepEqual(snapshot.durabilityClaimSnippets, []);
  assert(snapshot.extractionNotes.some((note) => note.includes("material/composition text: not_found")));
});

test("does not treat country-of-origin prose as supplier table data", () => {
  const snapshot = extractProductPageSnapshot(
    `<!doctype html><html><head><title>Repairable overshirt</title></head><body>
      <h1>Repairable overshirt</h1>
      <p>Country of origin: made in Portugal.</p>
      <p>Durability: reinforced seams and a two-year repair guarantee.</p>
    </body></html>`,
    "https://shop.example/products/repairable-overshirt",
    new Date("2026-06-19T12:00:00.000Z")
  );

  assert.deepEqual(snapshot.supplierDetailText, []);
  assert(snapshot.originText.some((value) => /Country of origin: made in Portugal/i.test(value)));
  assert(!snapshot.originText.some((value) => /Durability:/i.test(value)));
});

test("normalizes material composition from noisy product information text", () => {
  const snapshot = extractProductPageSnapshot(
    `<!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Huge Backprint Tee | Black Bananas</title>
        <meta name="brand" content="Black Bananas" />
      </head>
      <body>
        <h1>Huge Backprint Tee</h1>
        <p>Quantity must be 1 or more Product information 100% cotton Oversized fit Huge backprint Shipping THE NETHERLANDS: €5,95 Free Shipping over €150 Delivery time: 1-2 business days.</p>
      </body>
    </html>`,
    "https://shop.example/products/huge-backprint-tee",
    new Date("2026-06-02T12:00:00.000Z")
  );

  assert.deepEqual(snapshot.materialCompositionText, ["100% cotton"]);
});

test("extracts embedded commerce data from a COS-style product payload", () => {
  const snapshot = extractProductPageSnapshot(
    `<!DOCTYPE html>
    <html lang="en">
      <head>
        <title>KNITTED LINEN HENLEY T-SHIRT - DARK BROWN | COS NL</title>
        <meta name="description" content="Offered in a neutral off-white tone, this Henley T-shirt is made from a linen-blend Milano knit." />
        <script id="__NEXT_DATA__" type="application/json">
          {
            "props": {
              "pageProps": {
                "blocks": [
                  {
                    "product": {
                      "name": "KNITTED LINEN HENLEY T-SHIRT",
                      "variantName": "DARK BROWN",
                      "product": "24146",
                      "sku": "1340205001",
                      "productSku": "1340205",
                      "brandName": "COS",
                      "categoryName": ["men", "menswear", "tshirts", "relaxed-fit"],
                      "price": "€69,00",
                      "var_colour_details_desc": "#4B4543",
                      "var_article_description_desc": "<p>Offered in a rich espresso tone, this Henley T-shirt is made from a linen-blend Milano knit.</p>",
                      "var_material_composition_desc": "[{\\"type\\":\\"Shell\\",\\"materials\\":[{\\"material\\":\\"Linen\\",\\"percentage\\":86},{\\"material\\":\\"Polyamide\\",\\"percentage\\":14}]}]",
                      "var_supplier_info_desc": "[{\\"suppliername\\":\\"SHANGHAI JINGRONG SCIENCE & TECHNOLOGY CO., LTD.\\",\\"factoryName\\":\\"SHANGHAI JINGRONG SCIENCE & TECHNOLOGY CO., LTD.\\",\\"address\\":{\\"addressStreetLine1\\":\\"No.299 & No.349 Yisong Road\\",\\"addressStreetLine2\\":\\"Fengxian District\\",\\"postalCode\\":\\"201401\\",\\"city\\":\\"shanghai\\",\\"countryName\\":\\"Mainland China\\"},\\"noOfWorkers\\":659}]",
                      "var_care_instruction": ["Dry clean", "Line dry", "Machine wash cold. gentle cycle"],
                      "items": [
                        { "name": "XS", "sku": "1340205001001" },
                        { "name": "S", "sku": "1340205001002" }
                      ]
                    }
                  }
                ]
              }
            }
          }
        </script>
      </head>
      <body><h1>KNITTED LINEN HENLEY T-SHIRT</h1></body>
    </html>`,
    "https://www.cos.com/en-nl/men/menswear/tshirts/relaxed-fit/product/knitted-linen-henley-t-shirt-dark-brown-1340205001",
    new Date("2026-06-06T12:00:00.000Z")
  );

  assert.equal(snapshot.likelyBrand, "COS");
  assert.equal(snapshot.likelyProductName, "KNITTED LINEN HENLEY T-SHIRT");
  assert(snapshot.productIdentifiersText.some((value) => /1340205001/.test(value)));
  assert(!snapshot.productIdentifiersText.some((value) => /^Price:/i.test(value)));
  assert(snapshot.colorText.some((value) => /DARK BROWN/.test(value)));
  assert(!snapshot.colorText.some((value) => /^Category:/i.test(value)));
  assert.equal(snapshot.structuredProductData.category, undefined);
  assert.deepEqual(snapshot.materialCompositionText, ["Shell: 86% Linen, 14% Polyamide"]);
  assert(snapshot.supplierDetailText.some((value) => /Supplier: SHANGHAI JINGRONG/.test(value)));
  assert(snapshot.supplierDetailText.some((value) => /Employees: 659/.test(value)));
  assert(snapshot.originText.some((value) => /SHANGHAI JINGRONG/.test(value)));
  assert(snapshot.originText.some((value) => /Country: Mainland China/.test(value)));
  assert(!snapshot.originText.some((value) => /659 workers|Employees:/i.test(value)));
  assert(snapshot.careText.some((value) => /Machine wash cold/.test(value)));
});

test("extracts visible supplier details from labeled materials and suppliers content", () => {
  const snapshot = extractProductPageSnapshot(
    `<!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Cotton Overshirt | COS</title>
        <meta property="product:brand" content="COS" />
      </head>
      <body>
        <h1>Cotton Overshirt</h1>
        <section>
          <h2>Materials and Suppliers</h2>
          <p>To support transparency, we share information about where and how this garment was made.</p>
          <p>Composition Shell: 100% Cotton, Pocket lining: 65% Polyester, 35% Cotton</p>
          <p>Supplier Country Tunisia Factory Nebiha Story Address Farhat Hached Road, El Alia, Bizerte, 7016 Employees 511</p>
        </section>
      </body>
    </html>`,
    "https://www.cos.com/en-nl/product/cotton-overshirt",
    new Date("2026-06-07T12:00:00.000Z")
  );

  assert(snapshot.supplierDetailText.some((value) => value === "Country: Tunisia"));
  assert(snapshot.supplierDetailText.some((value) => value === "Factory: Nebiha Story"));
  assert(snapshot.supplierDetailText.some((value) => /Address: Farhat Hached Road/.test(value)));
  assert(snapshot.supplierDetailText.some((value) => value === "Employees: 511"));
  assert(snapshot.originText.some((value) => /Factory: Nebiha Story/.test(value)));
});

test("returns a failed snapshot when fetch cannot return readable HTML", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 503,
    headers: {
      get: () => "text/html",
    },
    text: async () => "",
  });

  const snapshot = await fetchProductPageSnapshot(
    "https://shop.example/products/unavailable",
    fakeFetch,
    new Date("2026-06-02T12:00:00.000Z")
  );

  assert.equal(snapshot.extractionStatus, "failed");
  assert.equal(snapshot.pageTitle, "not_found");
  assert.equal(snapshot.canonicalUrl, "not_found");
  assert.match(snapshot.extractionNotes[0], /request failed with status 503/);
});
