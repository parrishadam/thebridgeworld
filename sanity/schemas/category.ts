import { defineField, defineType } from "sanity";
import { TagIcon } from "@sanity/icons";

/**
 * Used for both top-level categories (Bidding, Play, Defence…)
 * and freeform tags. Articles reference this type for both fields.
 */
export const category = defineType({
  name: "category",
  title: "Category / Tag",
  type: "document",
  icon: TagIcon,
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "color",
      title: "Color",
      type: "string",
      description: "Used for category badges in the UI.",
      options: {
        list: [
          { title: "Blue (Bidding)",       value: "blue" },
          { title: "Emerald (Play)",        value: "emerald" },
          { title: "Violet (Defence)",      value: "violet" },
          { title: "Amber (Conventions)",   value: "amber" },
          { title: "Rose (Tournaments)",    value: "rose" },
          { title: "Sky (News)",            value: "sky" },
          { title: "Stone (Columns)",       value: "stone" },
        ],
      },
    }),
  ],
  preview: {
    select: { title: "name", subtitle: "color" },
  },
});
