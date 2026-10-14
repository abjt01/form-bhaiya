import fs from "node:fs/promises";
import path from "node:path";

// Notices live in MongoDB when MONGODB_URI is set, otherwise in a JSON file.
// Page text is kept apart from the notice itself: it's only needed while reading.
export async function createStore() {
  if (process.env.MONGODB_URI) {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "form_bhaiya");
    const notices = db.collection("notices");
    const texts = db.collection("texts");
    await notices.createIndex({ id: 1 }, { unique: true });
    await notices.createIndex({ sha: 1 });
    await texts.createIndex({ id: 1 }, { unique: true });
    return {
      kind: "MongoDB",
      get: (id) => notices.findOne({ id }, { projection: { _id: 0 } }),
      bySha: (sha) => notices.findOne({ sha }, { projection: { _id: 0 } }),
      put: (n) => notices.replaceOne({ id: n.id }, n, { upsert: true }),
      list: () => notices.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(200).toArray(),
      pages: async (id) => (await texts.findOne({ id }))?.pages || null,
      putPages: (id, pages) => texts.replaceOne({ id }, { id, pages }, { upsert: true }),
    };
  }

  const dir = process.env.DATA_DIR
    ? path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
  const file = path.join(dir, "notices.json");
  const textDir = path.join(dir, "text");
  let notices = {};
  try {
    notices = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}

  let writing = Promise.resolve();
  const flush = () =>
    (writing = writing
      .then(async () => {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(`${file}.tmp`, JSON.stringify(notices));
        await fs.rename(`${file}.tmp`, file);
      })
      .catch((err) => console.error("could not save notices:", err.message)));

  return {
    kind: "file",
    get: async (id) => (notices[id] ? structuredClone(notices[id]) : null),
    bySha: async (sha) => {
      const n = Object.values(notices).find((x) => x.sha === sha);
      return n ? structuredClone(n) : null;
    },
    put: async (n) => {
      notices[n.id] = structuredClone(n);
      await flush();
    },
    list: async () => Object.values(notices).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 200).map((n) => structuredClone(n)),
    pages: async (id) => {
      try {
        return JSON.parse(await fs.readFile(path.join(textDir, `${id}.json`), "utf8"));
      } catch {
        return null;
      }
    },
    putPages: async (id, pages) => {
      await fs.mkdir(textDir, { recursive: true });
      await fs.writeFile(path.join(textDir, `${id}.json`), JSON.stringify(pages));
    },
  };
}
