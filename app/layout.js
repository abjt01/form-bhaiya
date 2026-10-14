import { IBM_Plex_Mono, IBM_Plex_Sans, Noto_Sans_Devanagari, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { modelInfo } from "@/lib/notices";
import "./globals.css";

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-serif" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-mono" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "600", "700"], variable: "--font-deva" });

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Form Bhaiya",
  description:
    "For cyber cafés that fill government exam forms: reads the notice once, shows the line behind every answer, checks each candidate's age and fee, and fixes photos and signatures to size in the browser.",
};

export const viewport = { themeColor: "#1f4e8c" };

const pretty = (m) => m.replace(/^.*\//, "").replace("gpt-oss-", "GPT-OSS ").replace("qwen3.8-27b", "Qwen 3.8 27B").replace(/(\d+)b$/, "$1B");

export default function RootLayout({ children }) {
  const info = modelInfo();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} ${deva.variable}`}>
      <body>
        <header className="top no-print">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              OK
            </span>
            Form Bhaiya
          </Link>
          <nav>
            <Link href="/#notices">Notices</Link>
            <Link href="/fix">Photo &amp; signature</Link>
          </nav>
        </header>
        {children}
        <footer className="foot no-print">
          {info.mock ? (
            <p>Running without an AI key, so only the demo notice can be read. Everything else works.</p>
          ) : (
            <p>
              Notices are read by open-weight models ({pretty(info.big)}, {pretty(info.small)} and {pretty(info.side)}), served free on
              Groq. Dates, ages, fees and image sizes are worked out in plain code, and nothing about a candidate is sent anywhere.
            </p>
          )}
          <p>Always confirm on the official notice. Every answer here shows the line it came from.</p>
        </footer>
      </body>
    </html>
  );
}
