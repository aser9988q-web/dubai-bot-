const { chromium } = require("playwright");
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

async function getDubaiFines(plateNumber, plateCode, plateSource) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    const page = await context.newPage();
    try {
        await page.goto("https://www.dubaipolice.gov.ae/wps/portal/home/services/individualservicescontent/trafficfines", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        await page.fill("#plateNumber", plateNumber);
        await page.selectOption("#plateCode", plateCode);
        await page.selectOption("#plateSource", plateSource);
        await page.click("#searchBtn");
        await page.waitForSelector(".fines-table", { timeout: 10000 });
        const fines = await page.evaluate(() => {
            const data = [];
            document.querySelectorAll(".fines-table tbody tr").forEach(row => {
                const cols = row.querySelectorAll("td");
                data.push({ date: cols[0]?.innerText.trim(), location: cols[1]?.innerText.trim(), fine: cols[2]?.innerText.trim(), description: cols[3]?.innerText.trim() });
            });
            return data;
        });
        await browser.close();
        return fines;
    } catch (error) {
        await browser.close();
        return { error: true, message: error.message };
    }
}

app.get("/fine", async (req, res) => {
    const { plate, code, source } = req.query;
    if (!plate || !code || !source) return res.json({ error: "بيانات ناقصة" });
    const fines = await getDubaiFines(plate, code, source);
    res.json({ plate, fines });
});

app.listen(PORT, () => console.log("Server running on port " + PORT));