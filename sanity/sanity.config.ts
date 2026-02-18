import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool }    from "@sanity/vision";

import { schemaTypes } from "./schemas";

const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? "oprrqquu";
const dataset   = process.env.SANITY_STUDIO_DATASET ?? "production";

export default defineConfig({
  name:    "bridge-world-studio",
  title:   "The Bridge World",

  projectId,
  dataset,

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            S.listItem()
              .title("Articles")
              .child(
                S.documentList()
                  .title("Articles")
                  .filter('_type == "article"')
                  .defaultOrdering([{ field: "publishedAt", direction: "desc" }])
              ),
            S.listItem()
              .title("Authors")
              .child(S.documentTypeList("author")),
            S.listItem()
              .title("Categories & Tags")
              .child(S.documentTypeList("category")),
          ]),
    }),
    visionTool({ defaultApiVersion: "2024-01-01" }),
  ],

  schema: {
    types: schemaTypes,
  },
});
