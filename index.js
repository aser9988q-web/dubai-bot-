const { chromium } = require("playwright");
const express = require("express");
const admin = require("firebase-admin");
const app = express();
const PORT = process.env.PORT || 10000; // رندر بيحب بورت 10000

// إعداد الفايربيس الخاص بمشروع (jusour-qatar)
// تأكد أنك رفعت ملف الخدمة serviceAccountKey.json لو عندك، أو استخدم الإعدادات المباشرة
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: "jusour-qatar",
            // ملاحظة للهندسة: هنا بنحتاج مفتاح الخدمة، لو مش معاك الملف قولي
            // حالياً هخليه يراقب الـ Firestore بشكل مباشر لو الصلاحيات تسمح
        })
    });
}
const db = admin.firestore();

async function getDubaiFines(plateNumber, plateCode, plateSource) {
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // ضروري عشان يشتغل على رندر
    });
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    const page = await context.newPage();
    try {
        await page.goto("https://www.dubaipolice.gov.ae/wps/portal/home/services/individualservicescontent/trafficfines", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        
        // تعبئة البيانات بناءً على مدخلات العميل
        await page.fill("#plateNumber", plateNumber);
        await page.selectOption("#plateCode", plateCode);
        await page.selectOption("#plateSource", plateSource);
        await page.click("#searchBtn");
        
        await page.waitForSelector(".fines-table", { timeout: 15000 });
        
        const totalAmount = await page.evaluate(() => {
            // هنجيب إجمالي المبلغ من الجدول
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
        console.error("Scraping Error:", error.message);
        return 0; // لو مفيش مخالفات أو حصل خطأ
    }
}

// "الصياد": مراقبة جدول الطلبات لحظة بلحظة
db.collection("orders").where("status", "==", "pending").onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const data = change.doc.data();
            const docId = change.doc.id;

            console.log(`[!] طلب جديد مكتشف برقم لوحة: ${data.plate_number}`);

            // تشغيل البوت لجيب المخالفات الحقيقية
            const amount = await getDubaiFines(data.plate_number, data.plate_code, data.plate_source);

            // تحديث الطلب في الفايربيس بالمبلغ الحقيقي وتغيير الحالة
            await db.collection("orders").doc(docId).update({
                total_fines: amount + " AED",
                status: "completed",
                last_bot_update: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`[✓] تم تحديث الطلب ${docId} بمبلغ: ${amount} AED`);
        }
    });
});

app.get("/", (req, res) => res.send("Bot is Running... Waiting for orders."));

app.listen(PORT, () => console.log("Bot Server is active on port " + PORT));
