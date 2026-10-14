import { notFound } from "next/navigation";
import NoticeRoom from "@/components/NoticeRoom";
import { getNotice, publicNotice } from "@/lib/notices";

export const dynamic = "force-dynamic";

async function load(id) {
  try {
    return publicNotice(await getNotice(id));
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const n = await load((await params).id);
  return { title: n ? `${n.read?.basics?.exam?.name || n.fileName} · Form Bhaiya` : "Form Bhaiya" };
}

export default async function NoticePage({ params }) {
  const n = await load((await params).id);
  if (!n) notFound();
  return <NoticeRoom initial={n} />;
}
