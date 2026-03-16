const { chromium } = require("playwright");
const express = require("express");
const admin = require("firebase-admin");
const app = express();
const PORT = process.env.PORT || 10000;

// التعديل الجوهري هنا يا هندسة: نخليه يستخدم إعدادات البيئة تلقائياً
if (!admin.apps.length) {
    admin.initializeApp({
        // هنا سحبنا المشروع من المتغير اللي حطيناه في Render
        credential: admin.credential.applicationDefault(),
        projectId: process.env.GCLOUD_PROJECT || "jusour-qatar"
    });
}
const db = admin.firestore();

async function getDubaiFines(plateNumber, plateCode, plateSource) {
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        console.log(`[البوت] بدأ البحث عن اللوحة: ${plateNumber}`);
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
        return totalAmount;
    } catch (error) {
        await browser.close();
        console.error("خطأ جلب البيانات:", error.message);
        return "0"; 
    }
}

// مراقبة الطلبات الجديدة
db.collection("orders").where("status", "==", "pending").onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const data = change.doc.data();
            const docId = change.doc.id;
            console.log(`[!] اكتشاف طلب جديد للوحة: ${data.plate_number}`);

            const amount = await getDubaiFines(data.plate_number, data.plate_code, data.plate_source);

            await db.collection("orders").doc(docId).update({
                total_fines: amount + " AED",
                status: "completed",
                last_bot_update: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[✓] تم تحديث الطلب ${docId} بنجاح بقيمة ${amount} AED`);
        }
    });
});

app.get("/", (req, res) => res.send("Bot is Running and Monitoring Firebase..."));
app.listen(PORT, () => console.log("Server Active on Port " + PORT));
