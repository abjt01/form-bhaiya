// Talks to any OpenAI-compatible chat API: Groq by default, Ollama or vLLM with LLM_BASE_URL.
const GROQ = "https://api.groq.com/openai/v1";

export class LLMError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Groq's free tier allows about 8,000 tokens a minute per model, and it counts max_tokens up front.
// Requests to the same model wait their turn here instead of bouncing off 429s.
const PER_MINUTE = Number(process.env.LLM_TOKENS_PER_MINUTE || 8000);
const spent = (globalThis.__fbSpent ||= new Map());

async function waitForBudget(model, tokens) {
  if (process.env.LLM_BASE_URL && !process.env.LLM_TOKENS_PER_MINUTE) return;
  const log = spent.get(model) || [];
  spent.set(model, log);
  const need = Math.min(tokens, PER_MINUTE);
  for (;;) {
    const now = Date.now();
    while (log.length && now - log[0].at > 60_000) log.shift();
    const used = log.reduce((a, e) => a + e.tokens, 0);
    if (used + need <= PER_MINUTE) {
      log.push({ at: now, tokens: need });
      return;
    }
    await sleep(Math.max(500, 60_000 - (now - log[0].at)));
  }
}

export const estimateTokens = (text) => Math.ceil(String(text).length / 3.2);

export function parseJSON(text) {
  const cleaned = String(text)
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function chatJSON({
  model,
  system,
  user,
  temperature = 0.4,
  maxTokens = 3000,
  attempts = 3,
  maxWait = 15_000,
  effort = "low",
}) {
  const base = process.env.LLM_BASE_URL || GROQ;
  const key = process.env.GROQ_API_KEY || process.env.LLM_API_KEY || "";
  let jsonMode = true;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const body = {
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    // gpt-oss thinks before answering; low effort keeps it fast and inside the free tier's tokens-per-minute
    if (/gpt-oss/i.test(model)) body.reasoning_effort = effort;
    // Qwen 3 thinks out loud unless told not to, and its output allowance per minute is small
    else if (/qwen3/i.test(model) && effort === "none") body.reasoning_effort = "none";
    await waitForBudget(model, estimateTokens(system + user) + maxTokens);

    let res;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key && { Authorization: `Bearer ${key}` }) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      lastError = new LLMError(`${model}: ${err.message}`);
      await sleep(1000 * (attempt + 1));
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      try {
        return parseJSON(data.choices?.[0]?.message?.content ?? "");
      } catch {
        lastError = new LLMError(`${model} didn't reply with JSON`);
        continue;
      }
    }

    const detail = await res.text();
    if (res.status === 400 && jsonMode && /json|response_format/i.test(detail)) {
      // some models reject JSON mode or fail its validation; ask again without it
      jsonMode = false;
      lastError = new LLMError(`${model}: ${detail.slice(0, 200)}`, 400);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new LLMError(`${model}: ${res.status} ${detail.slice(0, 200)}`, res.status);
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      if (attempt < attempts - 1) await sleep(Math.min(retryAfter || 2000 * 2 ** attempt, maxWait));
      continue;
    }
    throw new LLMError(`${model}: ${res.status} ${detail.slice(0, 300)}`, res.status);
  }
  throw lastError;
}
