// Real-browser tests: every screen at phone-to-desktop widths in both themes, then the flows a café
// goes through, clicked for real. Needs `npm run build` and Chrome (set CHROME_PATH if it isn't in a usual place).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import puppeteer from "puppeteer-core";
import { EDGE_NOTICES } from "./fixtures/edge-notices.js";
import { fixture, startServer, tempDataDir } from "./helpers/server.js";

const CHROME =
  process.env.CHROME_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p) => fs.existsSync(p));
if (!CHROME && process.env.CI) throw new Error("Chrome not found; set CHROME_PATH");

const RESULTS = path.resolve("test-results");
const WIDTHS = [320, 390, 768, 1280];
const THEMES = ["light", "dark"];

let browser;
before(async () => {
  if (!CHROME) return;
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
  });
});
after(() => browser?.close());

// Runs in the page: anything wider than the viewport or spilling out of its box.
function layoutProblems() {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const desc = (el) => {
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls} "${(el.innerText || "").trim().slice(0, 30).replace(/\s+/g, " ")}"`;
  };
  if (document.documentElement.scrollWidth > vw) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px > ${vw}px)`);
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if ((cs.opacity === "0" && cs.position === "absolute") || el.closest("[aria-hidden=true]")) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) out.push(`off screen: ${desc(el)}`);
    if (!["INPUT", "TEXTAREA", "SELECT", "CANVAS"].includes(el.tagName) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
      out.push(`content wider than its box: ${desc(el)}`);
    const p = el.parentElement;
    if (p && p !== document.body && !getComputedStyle(p).display.startsWith("inline")) {
      const spill = r.right - p.getBoundingClientRect().right;
      if (spill > 1) out.push(`spills ${Math.round(spill)}px out of ${desc(p)}: ${desc(el)}`);
    }
  }
  return [...new Set(out)];
}

async function newPage(width, theme = "light", errors = []) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) errors.push(m.text());
  });
  page.on("dialog", (d) => d.dismiss());
  await page.setViewport({ width, height: 900, isMobile: width < 600, hasTouch: width < 600 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
  return page;
}

// Pictures a café would get: a phone photo of a signature on grey, unevenly lit paper,
// and a "passport photo" (shapes, not a person). Drawn in the browser and saved for the file input.
async function makePicture(page, kind) {
  const b64 = await page.evaluate((kind) => {
    const c = document.createElement("canvas");
    c.width = kind === "signature" ? 1600 : 900;
    c.height = kind === "signature" ? 1200 : 1200;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, kind === "signature" ? "#cfc9bc" : "#dfe7ef");
    grad.addColorStop(1, kind === "signature" ? "#a29d93" : "#b8c6d6");
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    if (kind === "signature") {
      g.strokeStyle = "#1c2a6b";
      g.lineWidth = 9;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(300, 700);
      for (let x = 0; x < 700; x += 10) g.lineTo(300 + x, 700 - 80 * Math.sin(x / 40) - x / 8);
      g.stroke();
    } else {
      g.fillStyle = "#6b4f3a";
      g.beginPath();
      g.ellipse(450, 520, 210, 260, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#2b3a55";
      g.fillRect(150, 850, 600, 350);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
        g.fillRect(Math.random() * 900, Math.random() * 1200, 3, 3);
      }
    }
    return c.toDataURL("image/png").split(",")[1];
  }, kind);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fb-pic-")), `${kind}.png`);
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  return file;
}

async function clickText(page, label, tag = "button") {
  const [el] = await page.$$(`xpath/.//${tag}[contains(normalize-space(), "${label}")]`);
  assert.ok(el, `no ${tag} "${label}" on ${page.url()}`);
  await el.click();
}

async function makeFile(page, kind) {
  const input = await page.$('input[type="file"][aria-label="Picture"]');
  await input.uploadFile(await makePicture(page, kind));
  await page.waitForFunction(() => document.body.innerText.includes("Using "));
  await new Promise((r) => setTimeout(r, 300));
  await clickText(page, "Make the file");
  await page.waitForSelector("[data-testid=kb]", { timeout: 15000 });
}

describe("layout", { skip: !CHROME && "Chrome not found" }, () => {
  let server;
  before(async () => (server = await startServer({ dataDir: tempDataDir(EDGE_NOTICES) })));
  after(() => server?.stop());

  const pages = [
    ["home", "/", null],
    ["a long real notice", "/n/ssc-cgl-2026", null],
    ["edge notice with every stamp open and a slip", "/n/edge", "candidate"],
    ["notice still being read", "/n/reading", null],
    ["fixer, empty", "/fix", null],
    ["fixer, signature made", "/fix?kind=signature&min=10&max=20&wcm=6&hcm=2&n=edge&label=Scanned%20signature", "fix"],
    ["missing notice", "/n/nope", null],
    ["404 page", "/no/such/page", null],
  ];

  for (const [name, url, open] of pages) {
    test(name, async () => {
      const failures = [];
      for (const width of WIDTHS) {
        for (const theme of THEMES) {
          const errors = [];
          const page = await newPage(width, theme, errors);
          try {
            await page.goto(server.base + url, { waitUntil: "networkidle2" });
            if (open === "candidate") {
              for (const s of await page.$$("button.stamp")) await s.click();
              await page.type('input[placeholder="DD.MM.YYYY"]', "14.03.1990");
              await page.select("#candidate select", "SC");
              await clickText(page, "Make a slip");
              await page.waitForSelector(".slip");
              await page.type('.slip-wrap input[maxlength="60"]', "Shri Venkatanarasimharajuvaripeta Subrahmanyam");
            } else if (open === "fix") {
              await makeFile(page, "signature");
            }
            await new Promise((r) => setTimeout(r, 120));
            const problems = [...(await page.evaluate(layoutProblems)), ...errors.map((e) => `browser error: ${e}`)];
            if (problems.length) {
              fs.mkdirSync(RESULTS, { recursive: true });
              await page.screenshot({ path: path.join(RESULTS, `${name.replace(/\W+/g, "-")}-${width}-${theme}.png`), fullPage: true });
              failures.push(`${width}px ${theme}:\n    ${problems.slice(0, 8).join("\n    ")}`);
            }
          } catch (err) {
            fs.mkdirSync(RESULTS, { recursive: true });
            await page.screenshot({ path: path.join(RESULTS, `${name.replace(/\W+/g, "-")}-${width}-${theme}-error.png`), fullPage: true });
            failures.push(`${width}px ${theme}: ${err.message}`);
          }
          await page.close();
        }
      }
      assert.equal(failures.length, 0, failures.join("\n"));
    });
  }
});

describe("flows", { skip: !CHROME && "Chrome not found" }, () => {
  let server;
  const errors = [];
  before(async () => (server = await startServer()));
  after(() => server?.stop());

  const open = async (url, width = 1280) => {
    const page = await newPage(width, "light", errors);
    await page.goto(server.base + url, { waitUntil: "networkidle2" });
    return page;
  };
  const text = (page) => page.evaluate(() => document.body.innerText);
  const results = (page) => page.$$eval("#candidate .result", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
  async function dob(page, value) {
    const input = await page.$('input[placeholder="DD.MM.YYYY"]');
    await input.click({ clickCount: 1 });
    await input.evaluate((e) => e.select());
    await input.type(value);
  }

  let noticeUrl;

  test("a café drops in a notice and it gets read", async () => {
    const page = await open("/");
    await page.waitForSelector("[data-ready]");
    const input = await page.$('input[type="file"][aria-label="Notice PDF"]');
    await input.uploadFile(fixture("demo-notice.pdf"));
    await page.waitForFunction(() => location.pathname.startsWith("/n/"), { timeout: 15000 });
    await page.waitForFunction(() => document.body.innerText.includes("answers found word for word"), { timeout: 20000 });
    noticeUrl = new URL(page.url()).pathname;
    const body = await text(page);
    assert.match(body, /Junior Assistant Examination, 2026/);
    assert.match(body, /24 of 25 answers found word for word/);
    assert.match(body, /1 to check by hand/);
    await page.close();
  });

  test("every answer shows the line it came from", async () => {
    const page = await open(noticeUrl);
    const stamps = await page.$$eval("button.stamp", (els) => els.map((e) => [e.className.includes("verified"), e.innerText.trim()]));
    assert.equal(stamps.filter(([ok]) => ok).length, 24);
    assert.equal(stamps.length, 25);
    const [, redText] = stamps.find(([ok]) => !ok);
    assert.match(redText, /\? P\.3/i);

    await page.click("button.stamp.verified");
    await page.waitForSelector("blockquote.quote");
    assert.match(await page.$eval("blockquote.quote", (e) => e.innerText), /Page 1 of the notice/);

    await page.click("button.stamp.check");
    await page.waitForSelector("blockquote.quote.check");
    assert.match(await page.$eval("blockquote.quote.check", (e) => e.innerText), /Check this one by hand: The number 60 isn't on page 3/);
    await page.close();
  });

  test("checking candidates at the counter, to the day", async () => {
    const page = await open(noticeUrl);
    await dob(page, "01.01.2008");
    await page.waitForSelector("#candidate .result");
    let r = await results(page);
    assert.match(r[0], /^Eligible · Junior Assistant/);
    assert.match(r[1], /^Not eligible · Store Keeper Too young/);
    assert.match(await text(page), /Pays ₹100/);

    await dob(page, "02012008");
    await page.$eval('input[placeholder="DD.MM.YYYY"]', (e) => e.blur());
    await page.waitForFunction(() => document.querySelector('input[placeholder="DD.MM.YYYY"]').value === "02.01.2008");
    r = await results(page);
    assert.match(r[0], /Too young: born 1 day after the last allowed date/);

    await dob(page, "01.01.1997");
    await page.select("#candidate select", "OBC");
    await new Promise((res) => setTimeout(res, 100));
    r = await results(page);
    assert.match(r[0], /Eligible only because of the 3-year OBC relaxation/);

    await page.select("#candidate select", "SC");
    await clickText(page, "Female", "label");
    await page.waitForFunction(() => document.body.innerText.includes("No fee"));
    await dob(page, "01.01.1980");
    await clickText(page, "Ex-serviceman", "label");
    await new Promise((res) => setTimeout(res, 100));
    r = await results(page);
    assert.match(r[0], /^Check by hand/);
    assert.match(r[0], /Ex-Servicemen/);
    await page.close();
  });

  test("a slip for the candidate, in Hindi or English", async () => {
    const page = await open(noticeUrl, 390);
    await dob(page, "15.08.2001");
    await clickText(page, "Make a slip");
    await page.waitForSelector(".slip");
    assert.match(await page.$eval(".slip", (e) => e.innerText), /आवेदन|आयु के अनुसार पात्र/);
    await clickText(page, "English", "label");
    await page.type('.slip-wrap input[maxlength="60"]', "Priya Sharma");
    const slip = await page.$eval(".slip", (e) => e.innerText);
    assert.match(slip, /Priya Sharma/);
    assert.match(slip, /Eligible by age for\s+Junior Assistant, Store Keeper/);
    assert.match(slip, /Keep these ready/);
    assert.match(slip, /Caste certificate/);
    const wa = await page.$eval('a[href^="https://wa.me/"]', (a) => decodeURIComponent(a.href));
    assert.match(wa, /Priya Sharma/);
    await page.close();
  });

  test("fixing a signature to the notice's size from the notice page", async () => {
    const page = await open(noticeUrl);
    const links = await page.$$eval('a[href^="/fix"]', (as) => as.map((a) => a.getAttribute("href")));
    const sig = links.find((h) => h.includes("kind=signature"));
    assert.ok(sig, "the signature has a fix link");
    await page.goto(server.base + sig, { waitUntil: "networkidle2" });
    assert.equal(await page.$eval('input[type="number"]', (e) => e.value), "10");
    await makeFile(page, "signature");
    const kb = await page.$eval("[data-testid=kb]", (e) => e.innerText);
    assert.match(kb, /^✓/, kb);
    const size = await page.$eval("img.out-img", (img) => [img.naturalWidth, img.naturalHeight]);
    assert.ok(size[0] / size[1] > 2.9 && size[0] / size[1] < 3.1, `signature is 6×2: ${size}`);
    const bytes = await page.$eval("a[download]", async (a) => (await (await fetch(a.href)).blob()).size);
    assert.ok(bytes >= 10 * 1024 && bytes <= 20 * 1024, `${bytes} bytes`);
    await page.close();
  });

  test("a photo with the name and date printed under it, at exact pixels", async () => {
    const page = await open("/fix?kind=photo&min=20&max=50&wpx=200&hpx=230");
    const input = await page.$('input[type="file"][aria-label="Picture"]');
    await input.uploadFile(await makePicture(page, "photo"));
    await page.waitForFunction(() => document.body.innerText.includes("Using "));
    await clickText(page, "Print name and date", "label");
    await page.waitForSelector('input[maxlength="40"]');
    await page.type('input[maxlength="40"]', "Rahul Kumar");
    await clickText(page, "Make the file");
    await page.waitForSelector("[data-testid=kb]");
    const size = await page.$eval("img.out-img", (img) => [img.naturalWidth, img.naturalHeight]);
    assert.deepEqual(size, [200, 230]);
    const bytes = await page.$eval("a[download]", async (a) => (await (await fetch(a.href)).blob()).size);
    assert.ok(bytes <= 50 * 1024, `${bytes} bytes`);
    assert.match(await page.$eval("a[download]", (a) => a.download), /^photo-200x230-\d+kb\.jpg$/);
    await page.close();
  });

  test("no browser errors along the way", () => {
    assert.deepEqual(errors, []);
  });
});
