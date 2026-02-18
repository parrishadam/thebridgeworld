import { defineField, defineType } from "sanity";
import { UserIcon } from "@sanity/icons";

export const author = defineType({
  name: "author",
  title: "Author",
  type: "document",
  icon: UserIcon,
  fields: [
    defineField({
      name: "name",
      title: "Full name",
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
      name: "photo",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({ name: "alt", type: "string", title: "Alt text" }),
      ],
    }),
    defineField({
      name: "bio",
      title: "Biography",
      type: "text",
      rows: 4,
    }),
    defineField({
      name: "email",
      title: "Email address",
      type: "string",
      validation: (Rule) => Rule.email(),
    }),
    defineField({
      name: "socialLinks",
      title: "Social links",
      type: "object",
      fields: [
        defineField({ name: "twitter", type: "url", title: "X / Twitter" }),
        defineField({ name: "website", type: "url", title: "Personal website" }),
      ],
    }),
  ],
  preview: {
    select: { title: "name", media: "photo" },
  },
});
