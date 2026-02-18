import { article }      from "./article";
import { author }       from "./author";
import { blockContent } from "./blockContent";
import { category }     from "./category";

export const schemaTypes = [
  // Reusable types first (referenced by documents)
  blockContent,
  // Documents
  article,
  author,
  category,
];
