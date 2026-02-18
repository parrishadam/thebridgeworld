import { defineField, defineType } from "sanity";
import { DocumentTextIcon } from "@sanity/icons";

export const article = defineType({
  name: "article",
  title: "Article",
  type: "document",
  icon: DocumentTextIcon,
  groups: [
    { name: "content",  title: "Content",  default: true },
    { name: "meta",     title: "Metadata" },
    { name: "seo",      title: "SEO" },
  ],
  fields: [
    // ── Content ────────────────────────────────────────────────────
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      group: "content",
      validation: (Rule) => Rule.required().max(120),
    }),
    defineField({
      name: "subtitle",
      title: "Subtitle / Deck",
      type: "string",
      group: "content",
      description: "The short sentence that runs below the headline.",
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      group: "content",
      options: { source: "title", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "excerpt",
      title: "Excerpt",
      type: "text",
      rows: 3,
      group: "content",
      description: "Shown in article cards and social previews. Max 300 characters.",
      validation: (Rule) => Rule.required().max(300),
    }),
    defineField({
      name: "content",
      title: "Body content",
      type: "blockContent",
      group: "content",
    }),

    // ── Media ──────────────────────────────────────────────────────
    defineField({
      name: "featuredImage",
      title: "Featured image",
      type: "image",
      group: "content",
      options: { hotspot: true },
      fields: [
        defineField({ name: "alt",     type: "string", title: "Alt text" }),
        defineField({ name: "caption", type: "string", title: "Caption" }),
        defineField({ name: "credit",  type: "string", title: "Photo credit" }),
      ],
    }),

    // ── Metadata ───────────────────────────────────────────────────
    defineField({
      name: "author",
      title: "Author",
      type: "reference",
      to: [{ type: "author" }],
      group: "meta",
    }),
    defineField({
      name: "category",
      title: "Primary category",
      type: "reference",
      to: [{ type: "category" }],
      group: "meta",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      group: "meta",
      of: [
        {
          type: "reference",
          to: [{ type: "category" }],
        },
      ],
    }),
    defineField({
      name: "publishedAt",
      title: "Published at",
      type: "datetime",
      group: "meta",
      options: { dateFormat: "YYYY-MM-DD", timeFormat: "HH:mm" },
    }),
    defineField({
      name: "featured",
      title: "Feature on homepage",
      type: "boolean",
      group: "meta",
      initialValue: false,
    }),
    defineField({
      name: "access_tier",
      title: "Access tier",
      type: "string",
      group: "meta",
      description: "Who can read this article.",
      options: {
        list: [
          { title: "🔓 Free — anyone can read",            value: "free" },
          { title: "🔒 Paid — requires paid or premium",   value: "paid" },
          { title: "⭐ Premium — requires premium only",   value: "premium" },
        ],
        layout: "radio",
      },
      initialValue: "free",
      validation: (Rule) => Rule.required(),
    }),

    // ── SEO ────────────────────────────────────────────────────────
    defineField({
      name: "seoTitle",
      title: "SEO title",
      type: "string",
      group: "seo",
      description: "Overrides the article title in <title> and OG tags.",
      validation: (Rule) => Rule.max(70),
    }),
    defineField({
      name: "seoDescription",
      title: "SEO description",
      type: "text",
      rows: 2,
      group: "seo",
      validation: (Rule) => Rule.max(160),
    }),
  ],
  orderings: [
    {
      title: "Published date, newest",
      name: "publishedAtDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: {
      title:    "title",
      author:   "author.name",
      media:    "featuredImage",
      category: "category.name",
    },
    prepare({ title, author, media, category }) {
      return {
        title,
        subtitle: [category, author].filter(Boolean).join(" · "),
        media,
      };
    },
  },
});
