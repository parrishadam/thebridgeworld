/**
 * Portable Text schema for rich article content.
 *
 * Includes standard editorial marks and blocks, plus a custom
 * `bridgeHand` block type as a placeholder for interactive
 * bridge hand diagrams.
 */
import { defineArrayMember, defineField, defineType } from "sanity";

export const blockContent = defineType({
  name: "blockContent",
  title: "Block Content",
  type: "array",
  of: [
    // ── Standard Portable Text block ────────────────────────────────
    defineArrayMember({
      type: "block",
      styles: [
        { title: "Normal",     value: "normal" },
        { title: "Heading 2",  value: "h2" },
        { title: "Heading 3",  value: "h3" },
        { title: "Heading 4",  value: "h4" },
        { title: "Quote",      value: "blockquote" },
      ],
      lists: [
        { title: "Bullet",   value: "bullet" },
        { title: "Numbered", value: "number" },
      ],
      marks: {
        decorators: [
          { title: "Bold",          value: "strong" },
          { title: "Italic",        value: "em" },
          { title: "Underline",     value: "underline" },
          { title: "Strike",        value: "strike-through" },
          { title: "Code",          value: "code" },
        ],
        annotations: [
          // External / internal links
          defineArrayMember({
            name: "link",
            type: "object",
            title: "Link",
            fields: [
              defineField({ name: "href", type: "url", title: "URL" }),
              defineField({
                name: "blank",
                type: "boolean",
                title: "Open in new tab",
                initialValue: false,
              }),
            ],
          }),
          // Card-suit inline annotation (e.g. highlight a suit symbol)
          defineArrayMember({
            name: "suit",
            type: "object",
            title: "Card Suit",
            fields: [
              defineField({
                name: "suit",
                type: "string",
                title: "Suit",
                options: {
                  list: [
                    { title: "♠ Spades",   value: "spades" },
                    { title: "♥ Hearts",   value: "hearts" },
                    { title: "♦ Diamonds", value: "diamonds" },
                    { title: "♣ Clubs",    value: "clubs" },
                  ],
                },
              }),
            ],
          }),
        ],
      },
    }),

    // ── Inline image ────────────────────────────────────────────────
    defineArrayMember({
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({ name: "alt",     type: "string", title: "Alt text" }),
        defineField({ name: "caption", type: "string", title: "Caption" }),
      ],
    }),

    // ── Bridge Hand diagram ──────────────────────────────────────────
    // Placeholder for a custom interactive diagram component.
    // Stores the raw hand data; rendering is handled by a React
    // component in the Next.js app.
    defineArrayMember({
      name: "bridgeHand",
      type: "object",
      title: "Bridge Hand",
      fields: [
        defineField({ name: "title",  type: "string", title: "Diagram title / caption" }),
        defineField({
          name: "dealer",
          type: "string",
          title: "Dealer",
          options: { list: ["North", "East", "South", "West"] },
        }),
        defineField({
          name: "vulnerability",
          type: "string",
          title: "Vulnerability",
          options: {
            list: [
              { title: "None",       value: "none" },
              { title: "N/S",        value: "ns" },
              { title: "E/W",        value: "ew" },
              { title: "All",        value: "all" },
            ],
          },
        }),
        // Each seat stores cards as a plain string, e.g. "S: AKJ4 H: T93 D: QJ C: 852"
        defineField({
          name: "north",
          type: "string",
          title: "North hand",
          description: "e.g. S: AKJ4 H: T93 D: QJ C: 852",
        }),
        defineField({ name: "east",  type: "string", title: "East hand" }),
        defineField({ name: "south", type: "string", title: "South hand" }),
        defineField({ name: "west",  type: "string", title: "West hand" }),
        defineField({
          name: "auction",
          type: "array",
          title: "Auction",
          description: "Ordered list of calls: 1NT, 2H, Pass, X, XX…",
          of: [defineArrayMember({ type: "string" })],
        }),
        defineField({
          name: "contract",
          type: "string",
          title: "Final contract",
          description: "e.g. 3NT by South",
        }),
        defineField({
          name: "lead",
          type: "string",
          title: "Opening lead",
          description: "e.g. ♠4",
        }),
        defineField({
          name: "notes",
          type: "text",
          title: "Analysis / notes",
          rows: 4,
        }),
      ],
      preview: {
        select: { title: "title", subtitle: "contract" },
        prepare({ title, subtitle }) {
          return {
            title: title ?? "Bridge Hand",
            subtitle: subtitle ?? "No contract specified",
          };
        },
      },
    }),

    // ── Bid table ───────────────────────────────────────────────────
    // A simple table showing the auction sequence alone (without full hand).
    defineArrayMember({
      name: "bidTable",
      type: "object",
      title: "Bid Table",
      fields: [
        defineField({ name: "title", type: "string", title: "Caption" }),
        defineField({
          name: "bids",
          type: "array",
          title: "Bids (West → North → East → South, repeat)",
          of: [defineArrayMember({ type: "string" })],
        }),
        defineField({
          name: "notes",
          type: "text",
          title: "Notes",
          rows: 3,
        }),
      ],
    }),
  ],
});
