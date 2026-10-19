import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
test("login wrapper visibly distinguishes keyboard focus", async () => {
 const browser = await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
 try {
 const page=await browser.newPage();
 await page.setContent(`<style>${readFileSync("src/app/globals.css","utf8")}</style><div class="login-input"><input id="username"></div><button>Next</button>`);
 const before=await page.locator(".login-input").evaluate(e=>getComputedStyle(e).boxShadow);
 await page.keyboard.press("Tab"); await page.waitForTimeout(400);
 const after=await page.locator(".login-input").evaluate(e=>getComputedStyle(e).boxShadow);
 assert.notEqual(after,before); assert.notEqual(after,"none");
 } finally {await browser.close()}
});
