import Fixer from "@/components/Fixer";
import { readSpec } from "@/lib/imagespec";

export const metadata = { title: "Photo and signature · Form Bhaiya" };

export default async function FixPage({ searchParams }) {
  const spec = readSpec(await searchParams);
  return (
    <main className="wrap">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Photo and signature</p>
        <h1>Right size, first time.</h1>
        <p className="lede">
          Crop, clean and squeeze a photo or signature into exactly the pixels and KB a notice asks for. It all happens in this
          browser, so a candidate&apos;s picture never leaves the café.
        </p>
      </section>
      <Fixer initial={spec} />
    </main>
  );
}
