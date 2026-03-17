const express = require("express");
const { chromium } = require("playwright");
const admin = require("firebase-admin");
const fs = require("fs");

function getChromiumExecutablePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    "/opt/render/.cache/ms-playwright/chromium-1187/chrome-linux/chrome",
    "/opt/render/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell",
    "/opt/render/project/.cache/ms-playwright/chromium-1187/chrome-linux/chrome",
    "/opt/render/project/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell"
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate);
      return candidate;
    } catch (_) {}
  }

  return undefined;
}

const REQUIRED_ENV = ["FIREBASE_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const app = express();

app.get("/", (req, res) => {
  res.send("Traffic Bot Running ✅");
});

const PORT = process.env.PORT || 10000;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 7000);
const CONCURRENCY = Math.max(
  1,
  Number(process.env.WEB_CONCURRENCY || process.env.CONCURRENCY || 1)
);

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
  console.log(
    "Chromium executable path:",
    getChromiumExecutablePath() || "default playwright resolution"
  );
});

function nowTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function buildOrderPayload(data) {
  return {
    plate_source: String(data.plateSource || data.plate_source || "").trim(),
    plate_number: String(data.plateNumber || data.plate_number || "").trim(),
    plate_code: String(data.plateCode || data.plate_code || "").trim()
  };
}

async function reservePendingOrder() {
  const snapshot = await db
    .collection("orders")
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const ref = doc.ref;
  let reserved = false;

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return;

    const currentStatus = fresh.get("status");
    if (currentStatus !== "pending") return;

    tx.update(ref, {
      status: "processing",
      processingStartedAt: nowTimestamp(),
      worker: process.env.RENDER_SERVICE_NAME || "render-worker",
      last_error: admin.firestore.FieldValue.delete(),
      error_message: admin.firestore.FieldValue.delete()
    });

    reserved = true;
  });

  if (!reserved) return null;

  return {
    id: doc.id,
    ref,
    data: doc.data()
  };
}

let activeJobs = 0;

setInterval(async () => {
  try {
    while (activeJobs < CONCURRENCY) {
      const reservedOrder = await reservePendingOrder();
      if (!reservedOrder) break;

      activeJobs += 1;
      processOrder(reservedOrder)
        .catch((error) => {
          console.error(
            "Unhandled processing error",
            reservedOrder.id,
            error.message
          );
        })
        .finally(() => {
          activeJobs -= 1;
        });
    }
  } catch (error) {
    console.error("Polling loop error:", error.message);
  }
}, POLL_INTERVAL_MS);

async function processOrder(orderDoc) {
  const { id, ref, data } = orderDoc;
  const payload = buildOrderPayload(data);

  if (!payload.plate_source || !payload.plate_number || !payload.plate_code) {
    await ref.update({
      status: "error",
      error_message: "Missing required plate fields",
      processedAt: nowTimestamp()
    });
    return;
  }

  console.log(`Processing order ${id}`, payload);

  const result = await getTrafficFine(payload);

  if (result.ok) {
    await ref.update({
      status: "completed",
      total_fines: result.totalFines,
      result_currency: result.currency || "AED",
      result_text: result.resultText || "",
      result_status: result.resultStatus,
      result_details: result.details || null,
      processedAt: nowTimestamp(),
      last_error: admin.firestore.FieldValue.delete()
    });

    console.log(`Order completed ${id} => ${result.totalFines}`);
  } else {
    await ref.update({
      status: "error",
      error_message: result.error || "Unknown scraper error",
      last_error: result.error || "Unknown scraper error",
      processedAt: nowTimestamp()
    });

    console.error(`Order failed ${id}:`, result.error || "Unknown scraper error");
  }
}

async function getTrafficFine(payload) {
  let browser;
  let context;
  let page;

  try {
    const executablePath = getChromiumExecutablePath();

    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile Safari/604.1"
    });

    page = await context.newPage();

    console.log(
      "Checking:",
      payload.plate_number,
      payload.plate_code,
      payload.plate_source
    );

    await page.goto(
      "https://www.dubaipolice.gov.ae/app/services/fine-payment/search",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    await page.waitForSelector('input[placeholder="رقم اللوحة"]', {
      timeout: 30000
    });

    await page.fill('input[placeholder="رقم اللوحة"]', payload.plate_number);

    await page.click("text=جهة إصدار اللوحة");
    await page.waitForTimeout(700);
    await page.click(`text=${payload.plate_source}`);

    await page.click("text=رمز اللوحة");
    await page.waitForTimeout(700);
    await page.click(`text=${payload.plate_code}`);

    await page.click('button:has-text("التحقق من المخالفات")');
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    const pageText = await page.locator("body").innerText();
    const compactText = pageText.replace(/\s+/g, " ").trim();

    const amountMatches = [...compactText.matchAll(/(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:AED|درهم)/gi)].map(
      (m) => m[1]
    );

    const numericValues = amountMatches
      .map((value) => Number(String(value).replace(/,/g, "")))
      .filter((n) => !Number.isNaN(n));

    if (/no fines|لا توجد مخالفات|لا يوجد مخالفات/i.test(compactText)) {
      return {
        ok: true,
        totalFines: 0,
        currency: "AED",
        resultStatus: "no_fines",
        resultText: compactText.slice(0, 1500),
        details: { matchedAmounts: numericValues }
      };
    }

    if (numericValues.length) {
      const total = Math.max(...numericValues);
      return {
        ok: true,
        totalFines: total,
        currency: "AED",
        resultStatus: "has_fines",
        resultText: compactText.slice(0, 1500),
        details: { matchedAmounts: numericValues }
      };
    }

    if (/invalid|error|unable|try again|required/i.test(compactText)) {
      return {
        ok: false,
        error: compactText.slice(0, 1000)
      };
    }

    return {
      ok: false,
      error: "Could not determine fines result from Dubai Police page"
    };
  } catch (error) {
    console.error("Scraper fatal error:", error);
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  } finally {
    try {
      if (page) await page.close();
    } catch (_) {}

    try {
      if (context) await context.close();
    } catch (_) {}

    try {
      if (browser) await browser.close();
    } catch (_) {}
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
