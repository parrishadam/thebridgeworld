#!/usr/bin/env npx tsx
/**
 * import-to-supabase.ts
 *
 * Reads parsed article JSON files from the output directory and imports them
 * into Supabase as draft articles, linked to an issue record.
 *
 * Usage:
 *   npx tsx scripts/import-to-supabase.ts --issue "April 2025"
 *   npx tsx scripts/import-to-supabase.ts --issue "April 2025" --output ./output
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Supabase client ──────────────────────────────────────────────────────────

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    console.error("Set them in .env.local or export them in your shell.");
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Splits a compound author name into individual author names.
 * "Kit Woolsey and Edgar Kaplan" → ["Kit Woolsey", "Edgar Kaplan"]
 * "Jeff Rubens" → ["Jeff Rubens"]
 */
function splitAuthorNames(authorName: string): string[] {
  return authorName
    .split(/\s+(?:and|&|with)\s+/i)
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Normalize a name for fuzzy matching:
 * - lowercase
 * - remove middle initials (single letters followed by optional period)
 * - collapse whitespace
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b[a-z]\.\s*/g, "")   // remove "B. " style initials
    .replace(/\b[a-z]\b/g, "")       // remove single-letter words
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find a fuzzy match for `name` in the existing name→id map.
 * Returns the matched name key or null.
 */
function findFuzzyAuthorMatch(
  name: string,
  existingNames: Map<string, string>,
): string | null {
  const normInput = normalizeName(name);

  for (const [existingName] of Array.from(existingNames.entries())) {
    const normExisting = normalizeName(existingName);

    // Exact normalized match (catches "Edwin B. Kantar" vs "Edwin Kantar")
    if (normInput === normExisting) return existingName;

    // Levenshtein on original lowercase (catches "Philip" vs "Phillip")
    if (levenshtein(name.toLowerCase(), existingName.toLowerCase()) <= 2) return existingName;

    // Levenshtein on normalized form
    if (levenshtein(normInput, normExisting) <= 2) return existingName;
  }

  return null;
}

function parseIssueName(issueName: string): { month: number; year: number; monthName: string } {
  // Expected format: "April 2025", "January 1990", etc.
  const parts = issueName.trim().split(/\s+/);
  if (parts.length !== 2) {
    console.error(`Invalid issue name "${issueName}". Expected format: "April 2025"`);
    process.exit(1);
  }
  const monthName = parts[0];
  const year = parseInt(parts[1], 10);
  const month = MONTH_NAMES[monthName.toLowerCase()];
  if (!month || isNaN(year)) {
    console.error(`Cannot parse issue name "${issueName}". Month "${monthName}" not recognized.`);
    process.exit(1);
  }
  return { month, year, monthName };
}

// ── CLI Args ─────────────────────────────────────────────────────────────────

interface CliArgs {
  issueName: string;
  outputDir: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let issueName = "";
  let outputDir = "./output";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--issue":
        issueName = args[++i] ?? "";
        break;
      case "--output":
        outputDir = args[++i] ?? "./output";
        break;
      case "--help":
        console.log(`Usage: npx tsx scripts/import-to-supabase.ts --issue "April 2025" [--output ./output]`);
        console.log();
        console.log("Options:");
        console.log("  --issue <name>   Issue name, e.g. \"April 2025\" (required)");
        console.log("  --output <dir>   Output directory (default: ./output)");
        process.exit(0);
    }
  }

  if (!issueName) {
    console.error('Missing required --issue argument. Example: --issue "April 2025"');
    process.exit(1);
  }

  return { issueName, outputDir: path.resolve(outputDir) };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { issueName, outputDir } = parseArgs();
  const { month, year } = parseIssueName(issueName);
  const issueSlug = `${year}-${String(month).padStart(2, "0")}`;
  const filePrefix = slugify(issueName); // e.g. "april-2025"

  console.log(`\nImporting issue: ${issueName}`);
  console.log(`  Slug: ${issueSlug}`);
  console.log(`  Output dir: ${outputDir}\n`);

  // Read the issue JSON for volume/number metadata
  const issueJsonPath = path.join(outputDir, `${filePrefix}-issue.json`);
  if (!fs.existsSync(issueJsonPath)) {
    console.error(`Issue file not found: ${issueJsonPath}`);
    process.exit(1);
  }

  const issueJson = JSON.parse(fs.readFileSync(issueJsonPath, "utf-8"));
  const issueMeta = issueJson.issue as {
    month: number;
    year: number;
    volume: number | null;
    number: number | null;
    title: string;
  };

  // Find all article JSON files (everything except the issue file)
  const allFiles = fs.readdirSync(outputDir).filter(
    (f) => f.startsWith(filePrefix + "-") && f.endsWith(".json") && f !== `${filePrefix}-issue.json`
  );

  if (allFiles.length === 0) {
    console.error(`No article files found matching "${filePrefix}-*.json" in ${outputDir}`);
    process.exit(1);
  }

  console.log(`Found ${allFiles.length} article files\n`);

  // Connect to Supabase
  const supabase = getSupabaseAdmin();

  // ── Create or find issue record ──────────────────────────────────────────

  const publishedAt = new Date(year, month - 1, 1).toISOString();

  const { data: existingIssue } = await supabase
    .from("issues")
    .select("id")
    .eq("slug", issueSlug)
    .single();

  let issueId: string;

  if (existingIssue) {
    issueId = existingIssue.id;
    console.log(`Issue "${issueSlug}" already exists (id: ${issueId})`);
  } else {
    const { data: newIssue, error: issueError } = await supabase
      .from("issues")
      .insert({
        title: issueMeta.title || issueName,
        slug: issueSlug,
        month,
        year,
        volume: issueMeta.volume || null,
        number: issueMeta.number || null,
        published_at: publishedAt,
      })
      .select("id")
      .single();

    if (issueError || !newIssue) {
      console.error(`Failed to create issue: ${issueError?.message}`);
      process.exit(1);
    }

    issueId = newIssue.id;
    console.log(`Created issue "${issueSlug}" (id: ${issueId})`);
  }

  console.log();

  // ── Auto-create legacy authors ──────────────────────────────────────────

  // Collect all unique individual author names from article files
  const authorNames = new Set<string>();
  const articleDataList: Array<{
    file: string;
    data: {
      title: string; slug: string; author_name: string; category: string;
      tags: string[]; level?: string; month?: number; year?: number;
      source_page: number; excerpt: string; content_blocks: unknown[];
    };
  }> = [];

  for (const file of allFiles) {
    const filePath = path.join(outputDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    articleDataList.push({ file, data });
    if (data.author_name && data.author_name.trim()) {
      // Split compound names ("Kit Woolsey and Edgar Kaplan") into individuals
      for (const name of splitAuthorNames(data.author_name.trim())) {
        authorNames.add(name);
      }
    }
  }

  // Map author names to user_ids (existing or newly created)
  const authorIdMap = new Map<string, string>();

  if (authorNames.size > 0) {
    console.log(`Resolving ${authorNames.size} author name(s)...\n`);

    // Fetch all existing user profiles with display_name
    const { data: existingProfiles } = await supabase
      .from("user_profiles")
      .select("user_id, display_name, first_name, last_name");

    // Build a case-insensitive lookup
    const profileByName = new Map<string, string>();
    for (const p of existingProfiles ?? []) {
      const displayName = p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
      if (displayName) {
        profileByName.set(displayName.toLowerCase(), p.user_id);
      }
    }

    for (const name of Array.from(authorNames)) {
      const existing = profileByName.get(name.toLowerCase());
      if (existing) {
        authorIdMap.set(name, existing);
        console.log(`  FOUND  "${name}" → ${existing}`);
      } else {
        // Check for fuzzy match before creating a new profile
        const fuzzyMatch = findFuzzyAuthorMatch(name, profileByName);
        if (fuzzyMatch) {
          const matchedId = profileByName.get(fuzzyMatch.toLowerCase())!;
          authorIdMap.set(name, matchedId);
          console.log(`  FUZZY  "${name}" ≈ "${fuzzyMatch}" → ${matchedId}`);
        } else {
          // Create a new legacy author profile
          const legacyId = `legacy_${crypto.randomUUID()}`;
          const nameParts = name.split(/\s+/);
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";

          const { error: createErr } = await supabase
            .from("user_profiles")
            .insert({
              user_id: legacyId,
              display_name: name,
              first_name: firstName,
              last_name: lastName,
              is_legacy: true,
              is_author: true,
              tier: "free",
            });

          if (createErr) {
            console.log(`  FAIL   "${name}": ${createErr.message}`);
          } else {
            authorIdMap.set(name, legacyId);
            // Also add to profileByName so subsequent names can fuzzy-match against it
            profileByName.set(name.toLowerCase(), legacyId);
            console.log(`  CREATE "${name}" → ${legacyId}`);
          }
        }
      }
    }

    console.log();
  }

  // ── Import articles ──────────────────────────────────────────────────────

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const { data: article } of articleDataList) {
    // Build slug: "2025-04-article-name"
    const articleSlug = `${issueSlug}-${article.slug}`;

    // Check for existing article by slug
    const { data: existing } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", articleSlug)
      .single();

    if (existing) {
      console.log(`  SKIP  ${article.title} (slug "${articleSlug}" already exists)`);
      skipped++;
      continue;
    }

    // Resolve author_ids from the mapping (split compound names)
    const individualNames = article.author_name
      ? splitAuthorNames(article.author_name.trim())
      : [];
    const authorIds = individualNames
      .map((name) => authorIdMap.get(name))
      .filter((id): id is string => !!id);
    // Keep author_id as the first/primary author for backward compat
    const primaryAuthorId = authorIds[0] ?? null;

    // Insert article
    const { error: insertError } = await supabase
      .from("articles")
      .insert({
        title: article.title,
        slug: articleSlug,
        author_name: article.author_name || null,
        author_id: primaryAuthorId,
        author_ids: authorIds.length > 0 ? authorIds : null,
        category: article.category || null,
        tags: article.tags || [],
        level: article.level || null,
        month: article.month ?? month,
        year: article.year ?? year,
        access_tier: "paid",
        excerpt: article.excerpt || null,
        status: "draft",
        content_blocks: article.content_blocks || [],
        source_page: article.source_page || 0,
        issue_id: issueId,
        published_at: publishedAt,
      });

    if (insertError) {
      console.log(`  FAIL  ${article.title}: ${insertError.message}`);
      failed++;
      continue;
    }

    console.log(`  OK    ${article.title} → ${articleSlug}`);
    imported++;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
