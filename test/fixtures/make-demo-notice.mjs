// Builds demo-notice.pdf, a made-up notice the tests and the no-key demo read.
// Run: node test/fixtures/make-demo-notice.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const html = `<!doctype html><meta charset="utf-8"><style>
body{font:12pt/1.5 Georgia,serif;margin:0}section{page-break-after:always;padding:24px}h1{font-size:16pt}h2{font-size:13pt}
table{border-collapse:collapse}td{border:1px solid #000;padding:4px 10px}</style>
<section>
<p>Demo Recruitment Board</p>
<h1>NOTICE: Junior Assistant Examination, 2026</h1>
<p>This is a made-up notice for testing. No such board or examination exists.</p>
<p>Applications must be submitted online at https://example.org/apply only. No other mode of application will be accepted.</p>
<h2>Important dates</h2>
<p>Online applications open on 01.10.2026.</p>
<p>Last date for online applications: 20.11.2026 (23:00 hours)</p>
<p>Last date for online fee payment: 21.11.2026 (23:00 hours)</p>
<p>The written examination will be held on 17th January, 2027 at centres across the country.</p>
</section>
<section>
<h2>1. Fee</h2>
<p>Fee payable: Rs. 100/- (Rupees One Hundred only). Women candidates and candidates belonging to SC, ST and PwBD are exempted from payment of fee.</p>
<h2>2. Age limit (as on 01.01.2026)</h2>
<p>Junior Assistant: Candidates must have been born not earlier than 02.01.1999 and not later than 01.01.2008.</p>
<p>Store Keeper: Candidates must have been born not earlier than 02.01.1996 and not later than 01.01.2006.</p>
<p>Relaxation in the upper age limit:</p>
<table><tr><td>SC/ST 5 years</td></tr><tr><td>OBC 3 years</td></tr><tr><td>PwBD (Unreserved) 10 years</td></tr><tr><td>PwBD (OBC) 13 years</td></tr>
<tr><td>Ex-Servicemen: 3 years after deduction of military service rendered</td></tr></table>
<h2>3. Who can apply</h2>
<p>A candidate must be a citizen of India. Candidates must hold a Bachelor's Degree from a recognised University. Candidates appearing in the final year may also apply, provided they pass by 01.01.2027.</p>
</section>
<section>
<h2>4. Uploads</h2>
<p>Candidates must upload a recent colour photograph in JPG format, 20 KB to 50 KB, 200 x 230 pixels, against a light background, without cap or glasses.</p>
<p>Candidates must also upload their signature in JPG format (10 to 20 KB), about 6.0 cm (width) x 2.0 cm (height), signed in black ink.</p>
<p>Candidates must upload their left thumb impression in JPG format, 20 KB to 50 KB.</p>
<h2>5. Documents</h2>
<p>Candidates must bring an original valid photo identity card bearing date of birth to the examination hall.</p>
<p>At document verification: Caste certificate in the prescribed format, and the Matriculation certificate as proof of date of birth.</p>
</section>`;

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({ path: path.join(here, "demo-notice.pdf"), format: "A4" });
await browser.close();
console.log("wrote demo-notice.pdf");
