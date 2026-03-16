const express = require("express");
const { chromium } = require("playwright");
const admin = require("firebase-admin");

// ============================
// FIREBASE INIT (بدون service account)
// ============================

admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT || "jusour-qatar",
});

const db = admin.firestore();

// ============================
// EXPRESS SERVER
// ============================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// ============================
// PLAYWRIGHT FUNCTION
// ============================

async function getTrafficFine(plateNumber, code) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    await page.goto(
      "https://traffic.dubaipolice.gov.ae/trafficservices/fines"
    );

    await page.waitForTimeout(3000);

    await page.fill("#plateNumber", plateNumber);
    await page.fill("#code", code);

    await page.click("#searchButton");

    await page.waitForTimeout(5000);

    const result = await page.evaluate(() => {
      const el = document.querySelector(".fine-result");
      return el ? el.innerText : "No fines found";
    });

    await browser.close();

    return result;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

// ============================
// WATCH ORDERS COLLECTION
// ============================

console.log("Listening for new orders...");

db.collection("orders")
  .where("status", "==", "pending")
  .onSnapshot(async (snapshot) => {
    for (const doc of snapshot.docs) {
      const data = doc.data();

      console.log("New order detected:", doc.id);

      try {
        const result = await getTrafficFine(
          data.plateNumber,
          data.code
        );

        await db.collection("orders").doc(doc.id).update({
          status: "done",
          result: result,
          processedAt: new Date(),
        });

        console.log("Order processed:", doc.id);
      } catch (error) {
        console.error("Error processing order:", error);

        await db.collection("orders").doc(doc.id).update({
          status: "error",
          error: error.message,
        });
      }
    }
  });
