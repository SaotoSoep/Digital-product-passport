import analyzerModule from "../../src/analyzer.js";

const { analyzeProductUrl } = analyzerModule;

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  }

  try {
    const report = await analyzeProductUrl(body.productUrl, {
      userProvidedEvidence: body.userProvidedEvidence,
    });
    return new Response(JSON.stringify(report), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    const status = /^(Product URL|User-provided evidence|An HTML file name)/.test(error.message || "") ? 400 : 500;
    return new Response(
      JSON.stringify({ error: error.message || "Unexpected error" }),
      {
        status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  }
};

export const config = {
  path: "/api/analyze",
  preferStatic: true,
};
