/* eslint-disable no-console */

// [provider, env override, Bright Data public dataset ID] — keep the defaults in
// sync with lib/server/brightdata-scraper.ts.
const providerEnv = [
  ["chatgpt", "BRIGHT_DATA_DATASET_CHATGPT", "gd_m7aof0k82r803d5bjm"],
  ["perplexity", "BRIGHT_DATA_DATASET_PERPLEXITY", "gd_m7dhdot1vw9a7gc1n"],
  ["copilot", "BRIGHT_DATA_DATASET_COPILOT", "gd_m7di5jy6s9geokz8w"],
  ["gemini", "BRIGHT_DATA_DATASET_GEMINI", "gd_mbz66arm2mf9cu856y"],
  ["google_ai", "BRIGHT_DATA_DATASET_GOOGLE_AI", "gd_mcswdt6z2elth3zqr2"],
];

const providerBaseUrl = {
  chatgpt: "https://chatgpt.com/",
  perplexity: "https://www.perplexity.ai/",
  copilot: "https://copilot.microsoft.com/",
  gemini: "https://gemini.google.com/",
  google_ai: "https://www.google.com/",
};

// Prefer an engine with an explicit override; otherwise test ChatGPT on its
// public dataset, the same fallback the app uses.
function chooseProvider() {
  for (const [provider, envName] of providerEnv) {
    if (process.env[envName]) {
      return { provider, datasetId: process.env[envName] };
    }
  }
  const [provider, , datasetId] = providerEnv[0];
  return { provider, datasetId };
}

async function run() {
  const apiKey = process.env.BRIGHT_DATA_KEY;
  const selected = chooseProvider();

  if (!apiKey) {
    const mock = {
      mode: "mock",
      message:
        "No BRIGHT_DATA_KEY found. Set it in .env to run the live scraper test.",
      sample: {
        answer: "Mock response: GEO/AEO Tracker scraper pipeline is wired.",
        sources: ["https://docs.brightdata.com/datasets/scrapers/scrapers-library/ai-scrapers"],
      },
    };
    console.log(JSON.stringify(mock, null, 2));
    return;
  }

  const query = {
    input: [
      {
        url: providerBaseUrl[selected.provider],
        prompt:
          "What are the top 3 ranking factors for AI answer engine visibility in 2026? Include sources.",
        index: 1,
      },
    ],
  };

  const scrapeRes = await fetch(
    `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${selected.datasetId}&notify=false&include_errors=true&format=json`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(query),
    },
  );

  if (!scrapeRes.ok) {
    const text = await scrapeRes.text();
    throw new Error(`Scrape request failed (${scrapeRes.status}): ${text}`);
  }

  const data = await scrapeRes.json();
  console.log(
    JSON.stringify(
      {
        mode: "live",
        provider: selected.provider,
        records: Array.isArray(data) ? data.length : 1,
        preview: Array.isArray(data) ? data[0] : data,
      },
      null,
      2,
    ),
  );
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
