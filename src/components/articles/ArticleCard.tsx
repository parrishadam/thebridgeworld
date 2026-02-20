import Link from "next/link";
import type { CSSProperties } from "react";
import { SanityArticle } from "@/types";
import { formatDate } from "@/lib/utils";
import ArticleCardImage from "./ArticleCardImage";

const colorClasses: Record<string, string> = {
  blue:    "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  violet:  "bg-violet-100 text-violet-700",
  amber:   "bg-amber-100 text-amber-700",
  rose:    "bg-rose-100 text-rose-700",
  sky:     "bg-sky-100 text-sky-700",
  stone:   "bg-stone-100 text-stone-700",
};

const BASE_BADGE = "inline-block text-xs font-sans font-medium uppercase tracking-wide px-2 py-0.5 rounded";

function categoryBadge(color?: string | null): { className: string; style?: CSSProperties } {
  if (color?.startsWith("#") && color.length === 7) {
    return { className: BASE_BADGE, style: { backgroundColor: color + "26", color } };
  }
  const cls = colorClasses[color ?? ""] ?? "bg-stone-100 text-stone-700";
  return { className: `${BASE_BADGE} ${cls}` };
}

function TierBadge({ tier }: { tier?: string }) {
  if (tier === "premium") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-sans font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-700">
        ⭐ Premium
      </span>
    );
  }
  if (tier === "paid") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-sans font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-stone-800 text-white">
        🔒 Paid
      </span>
    );
  }
  return null;
}

interface ArticleCardProps {
  article: SanityArticle;
  variant?: "default" | "featured" | "compact";
}

export default function ArticleCard({ article, variant = "default" }: ArticleCardProps) {
  const badge = categoryBadge(article.category?.color);
  const categoryName = article.category?.name ?? "";

  if (variant === "compact") {
    return (
      <Link
        href={`/articles/${article.slug}`}
        className="group flex gap-4 py-3 border-b border-stone-100 last:border-0"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className={badge.className} style={badge.style}>
              {categoryName}
            </p>
            <TierBadge tier={article.access_tier} />
          </div>
          <h3 className="font-serif text-base font-semibold text-stone-900 group-hover:text-brand-700 transition-colors leading-snug line-clamp-2">
            {article.title}
          </h3>
          {article.publishedAt && (
            <p className="text-xs text-stone-400 mt-1 font-sans">{formatDate(article.publishedAt)}</p>
          )}
        </div>
      </Link>
    );
  }

  if (variant === "featured") {
    return (
      <Link href={`/articles/${article.slug}`} className="group block">
        <div className="aspect-[16/9] bg-stone-200 rounded-sm mb-4 overflow-hidden">
          {article.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.coverImageUrl}
              alt={article.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <ArticleCardImage
              fill
              variant="featured"
              title={article.title}
              author={article.author?.name}
              authorPhoto={article.author?.avatarUrl}
              category={article.category?.name}
              categoryColor={article.category?.color}
              contract={article.handData?.contract}
              declarer={article.handData?.declarer}
              hand={article.handData}
            />
          )}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <p className={badge.className} style={badge.style}>
            {categoryName}
          </p>
          <TierBadge tier={article.access_tier} />
        </div>
        <h2 className="font-serif text-2xl font-bold text-stone-900 group-hover:text-brand-700 transition-colors leading-snug mb-2">
          {article.title}
        </h2>
        {article.subtitle && (
          <p className="font-serif text-lg text-stone-600 mb-2">{article.subtitle}</p>
        )}
        <p className="font-sans text-sm text-stone-500 leading-relaxed line-clamp-3">
          {article.excerpt}
        </p>
        <p className="font-sans text-xs text-stone-400 mt-3">
          {article.author?.name}
          {article.author?.name && article.publishedAt && " · "}
          {article.publishedAt && formatDate(article.publishedAt)}
        </p>
      </Link>
    );
  }

  // default
  return (
    <Link href={`/articles/${article.slug}`} className="group block">
      <div className="aspect-[3/2] bg-stone-200 rounded-sm mb-3 overflow-hidden">
        {article.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.coverImageUrl}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <ArticleCardImage
            fill
            variant="default"
            title={article.title}
            author={article.author?.name}
            authorPhoto={article.author?.avatarUrl}
            category={article.category?.name}
            categoryColor={article.category?.color}
            contract={article.handData?.contract}
            declarer={article.handData?.declarer}
            hand={article.handData}
          />
        )}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <p className={badge.className} style={badge.style}>
          {categoryName}
        </p>
        <TierBadge tier={article.access_tier} />
      </div>
      <h3 className="font-serif text-lg font-bold text-stone-900 group-hover:text-brand-700 transition-colors leading-snug mb-1">
        {article.title}
      </h3>
      <p className="font-sans text-sm text-stone-500 leading-relaxed line-clamp-2">
        {article.excerpt}
      </p>
      <p className="font-sans text-xs text-stone-400 mt-2">
        {article.author?.name}
        {article.author?.name && article.publishedAt && " · "}
        {article.publishedAt && formatDate(article.publishedAt)}
      </p>
    </Link>
  );
}
