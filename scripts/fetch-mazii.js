import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const SOURCE_JSON = path.join(ROOT, "src/assets/lib/mini-dict.json");
const OUTPUT_JSON = path.join(ROOT, "dict-ver-1.json");

const BASE_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9,ja;q=0.8,vi;q=0.7",
  "content-type": "application/json",
  origin: "https://mazii.net",
  referer: "https://mazii.net/vi-VN/search/kanji",
  "sec-ch-ua":
    '"Microsoft Edge";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Linux"',
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
};

const COOKIES = [
  "language-web=vi-VN",
  "lang-dict=javi",
  "device-id=456e982733fc5884aa6a2bf4839d2c2e",
  'current-location={"code":"VN","lat":21}',
  'setting={"furigana":true,"openSidebar":true,"notification":{"mail_noti":true,"mail_study_noti":true,"mail_sale_noti":true,"mail_job_noti":true,"app_noti":false,"app_study_noti":false,"app_sale_noti":false,"app_job_noti":false},"darkMode":false}',
];

async function loadMiniDict() {
  const raw = await readFile(SOURCE_JSON, "utf8");
  return JSON.parse(raw);
}

async function fetchKanjiData(kanji) {
  const response = await fetch("https://mazii.net/api/search/kanji", {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      cookie: COOKIES.join("; "),
    },
    body: JSON.stringify({
      dict: "javi",
      type: "kanji",
      query: kanji,
      page: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch kanji "${kanji}": ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function main() {
  console.log("Loading mini dictionary...");
  const entries = await loadMiniDict();
  const enriched = [];

  for (const [index, entry] of entries.entries()) {
    const kanji = entry?.w;
    if (!kanji) {
      console.warn(`Skipping entry at index ${index} - missing "w" field`);
      continue;
    }

    try {
      console.log(`[${index + 1}/${entries.length}] Fetching "${kanji}"...`);
      const data = await fetchKanjiData(kanji);
      const firstResult = Array.isArray(data?.results)
        ? data.results[0] ?? null
        : null;
      enriched.push({ ...entry, mazii: firstResult });
    } catch (error) {
      console.error(`Error fetching "${kanji}":`, error);
      enriched.push({ ...entry, mazii: null, error: String(error) });
    }
  }

  console.log(`Writing ${enriched.length} records to ${OUTPUT_JSON}...`);
  await writeFile(OUTPUT_JSON, JSON.stringify(enriched, null, 2), "utf8");
  console.log("Done.");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exitCode = 1;
});
