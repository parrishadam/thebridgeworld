"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface TagSuggestion {
  id:   string;
  name: string;
}

interface TagPickerProps {
  selectedTags: string[];
  onChange:     (tags: string[]) => void;
}

export default function TagPicker({ selectedTags, onChange }: TagPickerProps) {
  const [input,       setInput]       = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [isOpen,      setIsOpen]      = useState(false);
  const containerRef  = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch suggestions ────────────────────────────────────────────────────

  const fetchSuggestions = useCallback(
    async (q: string) => {
      try {
        const url = q.trim()
          ? `/api/tags?q=${encodeURIComponent(q.trim())}`
          : "/api/tags";
        const res = await fetch(url);
        if (!res.ok) return;
        const data: TagSuggestion[] = await res.json();
        // Exclude already-selected tags
        setSuggestions(data.filter((t) => !selectedTags.includes(t.name)));
      } catch {
        setSuggestions([]);
      }
    },
    [selectedTags]
  );

  // Debounce the search as the user types
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(input), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, isOpen, fetchSuggestions]);

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Tag management ───────────────────────────────────────────────────────

  function addTag(name: string) {
    const normalized = name.toLowerCase().trim();
    if (!normalized || selectedTags.includes(normalized)) {
      setInput("");
      return;
    }
    onChange([...selectedTags, normalized]);
    setInput("");
    setSuggestions((prev) => prev.filter((t) => t.name !== normalized));
  }

  async function createAndAdd(name: string) {
    const normalized = name.toLowerCase().trim();
    if (!normalized) return;
    // Optimistically add; fire-and-forget the API call to persist
    addTag(normalized);
    try {
      await fetch("/api/tags", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: normalized }),
      });
    } catch {
      // tag was added locally; API failure is non-fatal
    }
  }

  function removeTag(name: string) {
    onChange(selectedTags.filter((t) => t !== name));
  }

  // ── Keyboard handling ────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = input.trim();
      if (!val) return;
      const exact = suggestions.find(
        (s) => s.name.toLowerCase() === val.toLowerCase()
      );
      if (exact) {
        addTag(exact.name);
      } else {
        createAndAdd(val);
      }
    } else if (e.key === "Backspace" && !input && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  // "Create" option visible when input doesn't exactly match any suggestion
  const showCreate =
    input.trim() !== "" &&
    !suggestions.some(
      (s) => s.name.toLowerCase() === input.trim().toLowerCase()
    );

  const showDropdown = isOpen && (suggestions.length > 0 || showCreate);

  return (
    <div ref={containerRef} className="relative">
      {/* Chip container + text input */}
      <div
        className="min-h-[34px] w-full border border-stone-200 rounded px-2 py-1.5 flex flex-wrap gap-1 cursor-text focus-within:ring-1 focus-within:ring-stone-400"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs font-sans bg-stone-100 text-stone-700 rounded px-2 py-0.5"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-stone-400 hover:text-stone-700 leading-none transition-colors"
              aria-label={`Remove tag ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            // Strip commas from value — commas are handled as a submit key
            setInput(e.target.value.replace(",", ""));
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            fetchSuggestions(input);
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? "Add tags…" : ""}
          className="flex-1 min-w-[80px] text-xs font-sans text-stone-700 border-0 outline-none bg-transparent placeholder:text-stone-300"
        />
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs font-sans text-stone-700 hover:bg-stone-50 transition-colors"
              // mousedown fires before blur so we prevent the default blur
              onMouseDown={(e) => { e.preventDefault(); addTag(tag.name); }}
            >
              {tag.name}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs font-sans text-stone-400 hover:bg-stone-50 transition-colors border-t border-stone-100 italic"
              onMouseDown={(e) => { e.preventDefault(); createAndAdd(input.trim()); }}
            >
              Create &ldquo;{input.trim().toLowerCase()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
