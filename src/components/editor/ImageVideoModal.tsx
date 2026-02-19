"use client";

import { useState } from "react";
import type { ImageBlock, VideoBlock } from "@/types";

type ModalType = "image" | "video";

interface ImageVideoModalProps {
  type: ModalType;
  initial?: { url: string; caption: string };
  onSave: (data: { url: string; caption: string }) => void;
  onClose: () => void;
}

function getYouTubeEmbedUrl(url: string): string | null {
  const ytMatch =
    url.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return null;
}

export default function ImageVideoModal({
  type,
  initial,
  onSave,
  onClose,
}: ImageVideoModalProps) {
  const [url, setUrl]         = useState(initial?.url ?? "");
  const [caption, setCaption] = useState(initial?.caption ?? "");

  const embedUrl = type === "video" ? getYouTubeEmbedUrl(url) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-stone-800 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider">
            {type === "image" ? "Image Block" : "Video Block"}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
              {type === "image" ? "Image URL" : "Video URL (YouTube or Vimeo)"}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                type === "image"
                  ? "https://example.com/image.jpg"
                  : "https://youtube.com/watch?v=..."
              }
              className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
            />
          </div>

          <div>
            <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Caption
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Optional caption..."
              className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
            />
          </div>

          {/* Preview */}
          {type === "image" && url && (
            <div className="rounded overflow-hidden border border-stone-200 bg-stone-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={caption || "preview"}
                className="w-full max-h-48 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {caption && (
                <p className="text-center text-xs text-stone-400 font-sans py-2">{caption}</p>
              )}
            </div>
          )}

          {type === "video" && url && embedUrl && (
            <div className="aspect-video rounded overflow-hidden border border-stone-200 bg-stone-100">
              <iframe
                src={embedUrl}
                title="preview"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {type === "video" && url && !embedUrl && (
            <p className="text-xs text-amber-600 font-sans">
              Paste a YouTube or Vimeo URL for a preview.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="font-sans text-sm text-stone-600 border border-stone-200 px-4 py-2 hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (url) onSave({ url, caption }); }}
            disabled={!url}
            className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
