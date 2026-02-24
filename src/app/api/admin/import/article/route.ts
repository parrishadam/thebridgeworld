import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateProfile } from "@/lib/subscription";
import { buildArticlePrompt } from "@/lib/importPrompt";
import { validateContentBlocks, autoFixContentBlocks, autoFixAuctions } from "@/lib/validateBlocks";
import type { ContentBlock } from "@/types";

export const maxDuration = 300;

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_WAIT_MS = 60_000;
const MODEL = "claude-haiku-4-5-20251001";

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || { input: 1.0, output: 5.0 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

async function callClaude(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anthropic: any,
  prompt: string,
  maxTokens: number = 16384,
) {
  const t0 = Date.now();

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = message.content.find((b: { type: string }) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude returned no text response");
      }

      const inputTokens: number = message.usage?.input_tokens ?? 0;
      const outputTokens: number = message.usage?.output_tokens ?? 0;

      return {
        text: textBlock.text as string,
        usage: {
          model: MODEL,
          inputTokens,
          outputTokens,
          costUsd: computeCost(MODEL, inputTokens, outputTokens),
          durationMs: Date.now() - t0,
        },
      };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
        const waitMs = RATE_LIMIT_BASE_WAIT_MS * Math.pow(2, attempt);
        console.log(`[import/article] Rate limited. Waiting ${waitMs / 1000}s (retry ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted rate-limit retries");
}

function extractJson<T>(raw: string): T {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json?\s*\n?/m, "").replace(/\n?\s*```\s*$/m, "");
  const jsonStart = cleaned.search(/[{[]/);
  const jsonEndBrace = cleaned.lastIndexOf("}");
  const jsonEndBracket = cleaned.lastIndexOf("]");
  const jsonEnd = Math.max(jsonEndBrace, jsonEndBracket);
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }
  return JSON.parse(cleaned);
}

// ── POST /api/admin/import/article ──────────────────────────────────────────
// Re-parse a single article's content blocks given the article's text.

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getOrCreateProfile(userId);
    if (!profile.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { articleText, title, author_name, source_page, category } = body as {
      articleText: string;
      title: string;
      author_name: string;
      source_page: number;
      category?: string;
    };

    if (!articleText || !title) {
      return NextResponse.json(
        { error: "Missing required fields: articleText, title" },
        { status: 400 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });

    const prompt = buildArticlePrompt(articleText, title, author_name || "", source_page || 0, category);

    console.log(`[import/article] Parsing "${title}" with ${MODEL} (${articleText.length} chars)...`);
    const result = await callClaude(anthropic, prompt, 16384);
    console.log(
      `[import/article] "${title}" done in ${result.usage.durationMs}ms — ` +
      `${result.usage.inputTokens} in / ${result.usage.outputTokens} out — ` +
      `$${result.usage.costUsd.toFixed(4)}`,
    );

    const parsed = extractJson<{ content_blocks: ContentBlock[] }>(result.text);

    if (!Array.isArray(parsed.content_blocks)) {
      return NextResponse.json(
        { error: `Response missing 'content_blocks'. Keys: ${Object.keys(parsed).join(", ")}` },
        { status: 422 },
      );
    }

    // Auto-fix hands
    const { blocks: handFixedBlocks, fixes: handFixes } = autoFixContentBlocks(parsed.content_blocks);
    let contentBlocks = handFixes.length > 0 ? handFixedBlocks : parsed.content_blocks;

    // Auto-fix auctions
    const { blocks: auctionFixedBlocks, fixes: auctionFixes } = autoFixAuctions(contentBlocks);
    if (auctionFixes.length > 0) {
      contentBlocks = auctionFixedBlocks;
    }

    const warnings = validateContentBlocks(contentBlocks);

    return NextResponse.json({
      content_blocks: contentBlocks,
      warnings,
      handFixes: handFixes.length > 0 ? handFixes : undefined,
      auctionFixes: auctionFixes.length > 0 ? auctionFixes : undefined,
      usage: result.usage,
    });
  } catch (err) {
    console.error("[import/article] Error:", err);
    return NextResponse.json(
      { error: `Failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
