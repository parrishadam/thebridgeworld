import type { ArticleLevel } from "@/types";

const LEVEL_STYLES: Record<ArticleLevel, string> = {
  beginner:
    "bg-amber-800/10 text-amber-900 border-amber-700/30",
  intermediate:
    "bg-stone-200/80 text-stone-600 border-stone-400/40",
  advanced:
    "bg-yellow-400/15 text-yellow-900 border-yellow-600/30",
  expert:
    "bg-slate-200/80 text-slate-700 border-slate-400/50",
};

const LEVEL_LABELS: Record<ArticleLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

export default function LevelBadge({ level }: { level?: ArticleLevel | null }) {
  if (!level) return null;
  const styles = LEVEL_STYLES[level];
  if (!styles) return null;

  return (
    <span
      className={`inline-block text-xs font-sans font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${styles}`}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}
