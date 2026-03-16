const express = require("express");
const { chromium } = require("playwright");
const admin = require("firebase-admin");

// ============================
// FIREBASE INIT
// ============================

admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT || "jusour-qatar",
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
console.log("Connected to Firestore Successfully");

// ============================
// EXPRESS SERVER
// ============================

const app = express();
app.get("/", (req, res) => {
  res.send("Bot is running and watching Firebase... 🚀");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

// ============================
// PLAYWRIGHT FUNCTION
// ============================

async function getTrafficFine(plateNumber, plateCode, plateSource) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`[البوت] فحص اللوحة: ${plateNumber}`);
    // الرابط الصحيح لشرطة دبي
    await page.goto("https://www.dubaipolice.gov.ae/wps/portal/home/services/individualservicescontent/trafficfines", { waitUntil: "networkidle" });
    
    await page.fill("#plateNumber", plateNumber);
    await page.selectOption("#plateCode", plateCode);
    await page.selectOption("#plateSource", plateSource);
    await page.click("#searchBtn");
    
    await page.waitForSelector(".fines-table", { timeout: 15000 });
    
    const totalAmount = await page.evaluate(() => {
        let total = 0;
        document.querySelectorAll(".fines-table tbody tr").forEach(row => {
            const fineText = row.querySelectorAll("td")[2]?.innerText.replace(/[^\d]/g, '') || "0";
            total += parseInt(fineText);
        });
        return total;
    });

    await browser.close();
    return totalAmount + " AED";
  } catch (err) {
    await browser.close();
    console.error("خطأ في جلب البيانات:", err.message);
    return "0 AED";
  }
}

// ============================
// WATCH ORDERS COLLECTION
// ============================

console.log("Listening for new pending orders...");

db.collection("orders")
  .where("status", "==", "pending")
  .onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const data = change.doc.data();
            const docId = change.doc.id;
            console.log(`[!] طلب جديد: ${data.plate_number}`);

            try {
                const amount = await getTrafficFine(
                    data.plate_number, 
                    data.plate_code, 
                    data.plate_source
                );

                await db.collection("orders").doc(docId).update({
                    status: "completed",
                    total_fines: amount,
                    processedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`[✓] تم التحديث للوحة ${data.plate_number}: ${amount}`);
            } catch (error) {
                console.error("Processing error:", error);
            }
        }
    });
  }, (error) => {
    console.error("Firestore listener error:", error);
  });
