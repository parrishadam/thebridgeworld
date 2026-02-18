import { createClient } from "next-sanity";
import imageUrlBuilder  from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";

// ── Client config ──────────────────────────────────────────────────────────

export const config = {
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset:   process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2024-01-01", // pin to a stable API date
  useCdn:    process.env.NODE_ENV === "production",
};

/**
 * Standard read client — used for all data fetching in Server Components.
 * In production it hits the CDN; in development it hits the live API.
 */
export const client = createClient(config);

/**
 * Preview/draft client — pass a `perspective: "previewDrafts"` option when
 * you need live-preview data in draft mode.
 */
export const previewClient = createClient({
  ...config,
  useCdn: false,
  token:  process.env.SANITY_API_READ_TOKEN,
  perspective: "previewDrafts",
});

// ── Image URL builder ──────────────────────────────────────────────────────

const builder = imageUrlBuilder(client);

/**
 * Convenience wrapper around Sanity's image URL builder.
 *
 * @example
 *   <img src={urlFor(article.featuredImage).width(800).url()} />
 */
export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
