const express = require("express");
const { chromium } = require("playwright");
const admin = require("firebase-admin");


// ================= FIREBASE =================


const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);


if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}


const db = admin.firestore();


// ================= SERVER =================


const app = express();


app.get("/", (req, res) => {
  res.send("Traffic Bot Running ✅");
});


const PORT = process.env.PORT || 10000;


app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});


// ================= SCRAPER =================


async function getTrafficFine(plateNumber, plateCode, plateSource) {


  let browser;


  try {


    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled"
      ]
    });


    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile Safari/604.1"
    });


    const page = await context.newPage();


    console.log("Checking:", plateNumber);


    await page.goto(
      "https://www.dubaipolice.gov.ae/app/services/fine-payment/search",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );


    // إدخال رقم اللوحة
    await page.waitForSelector('input[placeholder="رقم اللوحة"]', { timeout: 30000 });


    await page.fill('input[placeholder="رقم اللوحة"]', plateNumber);


    // جهة الإصدار
    await page.click("text=جهة إصدار اللوحة");
    await page.waitForTimeout(500);
    await page.click(`text=${plateSource || "دبي"}`);


    // رمز اللوحة
    await page.click("text=رمز اللوحة");
    await page.waitForTimeout(500);
    await page.click(`text=${plateCode}`);


    // زر البحث
    await page.click('button:has-text("التحقق من المخالفات")');


    try {


      await page.waitForSelector(".amount", { timeout: 20000 });


      const amount = await page.$eval(".amount", el => el.innerText);


      const clean = amount.replace(/[^\d]/g, "");


      return clean || "0";


    } catch {


      return "0";


    }


  } catch (err) {


    console.log("Scraper error:", err.message);


    return "error";


  } finally {


    if (browser) await browser.close();


  }
}


// ================= WATCH ORDERS =================


console.log("Watching orders...");


db.collection("orders")
.where("status","==","pending")
.onSnapshot(snapshot => {


// temp edit
