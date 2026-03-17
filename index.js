const express = require("express");
const { chromium } = require("playwright");
const admin = require("firebase-admin");

// ============================
// FIREBASE INIT
// ============================
const serviceAccount = {
  "type": "service_account",
  "project_id": "jusour-qatar",
  "private_key_id": "e2e1dae77eac305b9a06bbfb0e64de52ae6fcdb8",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC92LhsvYMjdYSW\ntcEWOHSz8NNcI9gl7aPXsX0hOv6oVzCe7RAFA1sYvgokF+5wysjQkkhYrWAO9Mp2\nfr+BWmMKnykx/s7B+b8W/myYTbl872N62twPtToo5L0YQDfWdltXaJFtUGsFZwR/\nlrI9IXkxS3YoxPt8h94rSz0j2xIUqlrj0dQbfRMbJuWaZwHYSpQiavAeITedjYKv\nRVJ0mj6Gh23p3UGzSRqZuKcQWCCmZT/NJxPe41eKW5fXJViE+BWk8Na/1ZY3q2tU\nT5JGL3DbyUEGHGZHEs8sJxggjLO04yTxLIvRTKAcqkGKJ8jcv+qQpzDs+omWJu8p\nvB10kJ0DAgMBAAECggEAOoCDyIKX3D/1FUo6D6JjGCYww7aJ/5odALVBpZFb8z03\ DupnotvXYScC0f+L6zcaLee+IpF+xe0aTOyfD/nuBlJoq+7lAPJ4t9m8ViyxabYN\nVkkGQlLq8roWKVh0vIJpgGSJWAHNkPMfeD/UejEL+yxRY5vcEZJ+3KGJXDjAeBxE\naspZgaESZrICN5QKHKkpUkG8tNlZWnCLG1SIa6YtxOBmOUiokf+v1RU1o79jqxI0\n1dL5xSVJiyMmednftbvpTTAt6yGRgcY1Idds/mqZ87AiwLA06YpbMaBabun8NLdh\n66xMXfqOCh9l60CCZli08V0jRULzJikVIttX0fiyLQKBgQDzuL1JlEgic5FDRLvs\nd2A8ebq7xAmXgzjpc5RslydEZGVfTrt4sOdg/lGxm0AuTr3DMtS5nE8c9gudL0q4\nrBN3s7tSZvjYMIcKs40pyXnxfvQqQBGL+xJBmFv7eIcnW01ASbRr3sNQghuwxFia\naYb4NAwm1QYsP2+gm6twG80t7wKBgQDHaShzla6RF6/JN6rFQb3OIXchgGE1Icqp\nwHCJyJofNDAgUYk8k0KGZGgLz+4XXQluAyLnn09rrL/c+x5qVXDALdhqhAFpmC3h\nHljYAC8m0QOUS2OYxWKPxT+i2s85LFfrBFGe43wIUuZVkS3YNcryPyu0ICc3Q8Mp\nXTL2tkMWLQKBgFuWbOudoY3wyAHzbntqUOvpAtdU0BXz5gs0t+4mz0bQQ5gRSjoM\noKa+a4zGvtOoG3+jNnWZ29ESVUL4ZqgHYjl1fUt2DsWPVvAakU3GvOCXyMGn2fA0\paOo0cgqfv+3O8yQ5hAzYkp62lUPNAyy41malYZyPyOZoyVD2qUCjZRZAoGAdJ8T\ngUWw6jooHE3qGaLxFnSL75PdRe2VUOGy72HagRVMcBo/YKXe6ioej4nzfMZ0lVpQ\nN5X8JMTLELnsd9OwNTSatPCuwsq1SkstOmYhLVpf9YKBpP8LPXnmVaASQSWl5VSJ\nR5tTFqsk+jYF0cTkA/jd3mJPjQqcQLy46YB+i6ECgYEA70VfuTrkyfxjJfAexwal\nke4OjxcbVjUg1jKrLDYuJzu+ojfwVtg8IkozvaP2wN5M2/pxT8EeMTAY0Dga9lA2\n02P4RQXBBXlvU1gppl5Rktkh8gXisjLo2SpSqJY6xJ3cQ5kgDBZo//zZX1h0KDeI\nSN+632cN+C14DYgnTc5FOzQ=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@jusour-qatar.iam.gserviceaccount.com",
};

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ============================
// EXPRESS SERVER
// ============================
const app = express();
app.get("/", (req, res) => res.send("Engineer Hasan Bot is LIVE ✅"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Bot running on " + PORT));

// ============================
// SCRAPER FUNCTION
// ============================
async function getTrafficFine(plateNumber, plateCode, plateSource) {
  const browser = await chromium.launch({ 
      headless: true, 
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] 
  });
  
  const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  });
  
  const page = await context.newPage();

  try {
    console.log(`[Bot] Starting fine search for: ${plateNumber}`);
    
    // التوجه للرابط المحدث
    await page.goto("https://www.dubaipolice.gov.ae/app/services/fine-payment/search", { 
        waitUntil: "networkidle", 
        timeout: 60000 
    });

    // الانتظار حتى تظهر الخانات
    await page.waitForSelector('input[placeholder="رقم اللوحة"]', { state: 'visible', timeout: 30000 });
    
    // إدخال البيانات
    await page.fill('input[placeholder="رقم اللوحة"]', plateNumber);

    await page.click('text=جهة إصدار اللوحة');
    await page.waitForTimeout(500);
    await page.click(`text=${plateSource || 'دبي'}`);

    await page.click('text=رمز اللوحة');
    await page.waitForTimeout(500);
    await page.click(`text=${plateCode}`);

    // الضغط على زر التحقق
    await page.click('button:has-text("التحقق من المخالفات")');

    try {
        // قراءة النتيجة
        await page.waitForSelector('.amount', { timeout: 20000 });
        const amountText = await page.$eval('.amount', el => el.innerText);
        const cleanAmount = amountText.replace(/[^\d]/g, '');
        await browser.close();
        return cleanAmount || "0";
    } catch (e) {
        console.log("[Bot] Search completed. No fines or element missing.");
        await browser.close();
        return "0";
    }

  } catch (err) {
    console.error("[!] Scraper Error:", err.message);
    await browser.close();
    return "error";
  }
}

// ============================
// WATCH ORDERS
// ============================
db.collection("orders").where("status", "==", "pending").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const data = change.doc.data();
            const docId = change.doc.id;
            console.log(`[!] Processing Request: ${docId}`);

            const amount = await getTrafficFine(data.plate_number, data.plate_code, data.plate_source);

            if (amount !== "error") {
                await db.collection("orders").doc(docId).update({
                    status: "completed",
                    total_fines: amount, // التحديث في الحقل المستخدم في موقعك
                    processedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`[✓] Success: Updated ${docId} with ${amount} AED`);
            }
        }
    });
});
