"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  ContentBlock,
  BridgeHandBlock,
  PlayHandBlock,
  BiddingTableBlock,
  ImageBlock,
  VideoBlock,
  SolutionBlock,
} from "@/types";
import BridgeHandModal from "./BridgeHandModal";
import BiddingTableModal from "./BiddingTableModal";
import ImageVideoModal from "./ImageVideoModal";
import ParseTextModal from "./ParseTextModal";

interface BlockListProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  /** When true, hide selection checkboxes and wrap/unwrap (used for nested solution editing) */
  nested?: boolean;
}

type ModalState =
  | { type: "bridgeHand"; blockId: string | null }
  | { type: "playHand"; blockId: string | null }
  | { type: "biddingTable"; blockId: string | null }
  | { type: "image"; blockId: string | null }
  | { type: "video"; blockId: string | null }
  | { type: "parseText" }
  | null;

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function TextBlockEditor({
  block,
  onChange,
}: {
  block: Extract<ContentBlock, { type: "text" }>;
  onChange: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [block.data.text]);

  return (
    <textarea
      ref={ref}
      value={block.data.text}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write text here... Use **bold** and *italic* for formatting."
      className="w-full resize-none border-0 outline-none font-sans text-sm text-stone-700 leading-relaxed bg-transparent placeholder:text-stone-300 min-h-[80px] p-0"
      style={{ overflow: "hidden" }}
    />
  );
}

function BlockSummary({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "bridgeHand":
      return (
        <div className="text-xs font-sans text-stone-500">
          <span className="font-semibold text-stone-700">{block.data.title || "Bridge Hand"}</span>
          {" — "}
          Dealer: {block.data.dealer}, Vul: {block.data.vulnerability}
        </div>
      );
    case "playHand":
      return (
        <div className="text-xs font-sans text-stone-500">
          <span className="font-semibold text-stone-700">{block.data.title || "Play Hand"}</span>
          {" — "}
          {block.data.contract && `${block.data.contract} by ${block.data.declarer}`}
          {block.data.dealer && `, Dealer: ${block.data.dealer}`}
        </div>
      );
    case "biddingTable":
      return (
        <div className="text-xs font-sans text-stone-500">
          Bidding ({block.data.bids.length} bids) — Dealer: {block.data.dealer}
          {block.data.label && ` — ${block.data.label}`}
          {block.data.seats && ` (${block.data.seats.join("/")})`}
        </div>
      );
    case "image":
      return (
        <div className="text-xs font-sans text-stone-500 truncate">
          Image: {block.data.url || "(no URL)"}
        </div>
      );
    case "video":
      return (
        <div className="text-xs font-sans text-stone-500 truncate">
          Video: {block.data.url || "(no URL)"}
        </div>
      );
    case "mscResults":
      return (
        <div className="text-xs font-sans text-stone-500">
          MSC Results ({block.data.results.length} entries)
        </div>
      );
    default:
      return null;
  }
}

// ── Solution block editor ─────────────────────────────────────────────────

function SolutionEditor({
  block,
  onUpdate,
  onUnwrap,
}: {
  block: SolutionBlock;
  onUpdate: (updated: SolutionBlock) => void;
  onUnwrap: () => void;
}) {
  return (
    <div className="border-2 border-violet-300 rounded-sm bg-violet-50/30">
      {/* Solution header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-violet-100/50 border-b border-violet-200">
        <span className="text-xs font-sans font-semibold uppercase tracking-wider text-violet-500">
          Solution
        </span>
        <input
          type="text"
          value={block.data.label}
          onChange={(e) =>
            onUpdate({
              ...block,
              data: { ...block.data, label: e.target.value },
            })
          }
          placeholder="Solution label (e.g. Solution to Problem A)"
          className="flex-1 text-xs font-sans text-violet-800 bg-white/60 border border-violet-200 rounded px-2 py-1 placeholder:text-violet-300 focus:outline-none focus:border-violet-400"
        />
        <button
          onClick={onUnwrap}
          title="Unwrap: extract inner blocks to top level"
          className="text-xs font-sans text-violet-600 border border-violet-300 px-2 py-1 rounded hover:bg-violet-100 transition-colors"
        >
          Unwrap
        </button>
      </div>
      {/* Nested blocks */}
      <div className="p-3">
        <BlockList
          nested
          blocks={block.data.blocks}
          onChange={(innerBlocks) =>
            onUpdate({
              ...block,
              data: { ...block.data, blocks: innerBlocks },
            })
          }
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function BlockList({ blocks, onChange, nested }: BlockListProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lastClicked, setLastClicked] = useState<number | null>(null);

  // Clear selection when blocks change structurally (length or order)
  const blockIds = blocks.map((b) => b.id).join(",");
  useEffect(() => {
    setSelected(new Set());
    setLastClicked(null);
  }, [blockIds]);

  function toggleSelect(index: number, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClicked !== null) {
        // Range select
        const from = Math.min(lastClicked, index);
        const to = Math.max(lastClicked, index);
        for (let i = from; i <= to; i++) next.add(i);
      } else {
        if (next.has(index)) next.delete(index);
        else next.add(index);
      }
      return next;
    });
    setLastClicked(index);
  }

  // Check if selected indices are consecutive
  const selectedIndices = Array.from(selected).sort((a, b) => a - b);
  const isConsecutive =
    selectedIndices.length > 0 &&
    selectedIndices.every((v, i) => i === 0 || v === selectedIndices[i - 1] + 1);
  // Don't allow wrapping SolutionBlocks
  const selectionHasSolution = selectedIndices.some(
    (i) => blocks[i]?.type === "solution"
  );
  const canWrap = isConsecutive && !selectionHasSolution && selectedIndices.length > 0;

  function wrapInSolution() {
    if (!canWrap) return;
    const first = selectedIndices[0];
    const last = selectedIndices[selectedIndices.length - 1];
    const innerBlocks = blocks.slice(first, last + 1);

    // Try to derive a label from the first text block
    const firstText = innerBlocks.find((b) => b.type === "text");
    const labelMatch =
      firstText?.type === "text"
        ? firstText.data.text.match(/\*\*(.+?)\*\*/)?.[1]
        : null;
    const label = labelMatch || "Solution";

    const solBlock: SolutionBlock = {
      id: newId(),
      type: "solution",
      data: { label, blocks: innerBlocks },
    };

    const newBlocks = [
      ...blocks.slice(0, first),
      solBlock,
      ...blocks.slice(last + 1),
    ];
    onChange(newBlocks);
    setSelected(new Set());
  }

  const unwrapSolution = useCallback(
    (index: number) => {
      const block = blocks[index];
      if (block.type !== "solution") return;
      const innerBlocks = block.data.blocks;
      const newBlocks = [
        ...blocks.slice(0, index),
        ...innerBlocks,
        ...blocks.slice(index + 1),
      ];
      onChange(newBlocks);
    },
    [blocks, onChange],
  );

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...blocks];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index === blocks.length - 1) return;
    const next = [...blocks];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  function deleteBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  function updateBlock(index: number, updated: ContentBlock) {
    onChange(blocks.map((b, i) => (i === index ? updated : b)));
  }

  function addBlock(type: ContentBlock["type"]) {
    const id = newId();
    switch (type) {
      case "text":
        onChange([...blocks, { id, type: "text", data: { text: "" } }]);
        break;
      case "bridgeHand":
        setModal({ type: "bridgeHand", blockId: null });
        break;
      case "playHand":
        setModal({ type: "playHand", blockId: null });
        break;
      case "biddingTable":
        setModal({ type: "biddingTable", blockId: null });
        break;
      case "image":
        setModal({ type: "image", blockId: null });
        break;
      case "video":
        setModal({ type: "video", blockId: null });
        break;
    }
  }

  // When modal saves for a new block, add it
  function handleModalSave(data: unknown, auctionData?: BiddingTableBlock["data"], commentaryText?: string) {
    if (!modal || modal.type === "parseText") return;
    const id = newId();
    if (modal.blockId !== null) {
      // Editing existing block — just update in-place; commentary/auction already handled on creation
      const index = blocks.findIndex((b) => b.id === modal.blockId);
      if (index !== -1) {
        const existing = blocks[index];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateBlock(index, { ...existing, data } as any);
      }
    } else {
      // New block
      let newBlock: ContentBlock;
      if (modal.type === "bridgeHand") {
        newBlock = { id, type: "bridgeHand", data: data as BridgeHandBlock["data"] };
      } else if (modal.type === "playHand") {
        newBlock = { id, type: "playHand", data: data as PlayHandBlock["data"] };
      } else if (modal.type === "biddingTable") {
        newBlock = { id, type: "biddingTable", data: data as BiddingTableBlock["data"] };
      } else if (modal.type === "image") {
        newBlock = { id, type: "image", data: data as ImageBlock["data"] };
      } else {
        newBlock = { id, type: "video", data: data as VideoBlock["data"] };
      }
      // Append companion blocks in order: hand → [auction] → [commentary]
      const extras: ContentBlock[] = [];
      if (auctionData) {
        extras.push({ id: newId(), type: "biddingTable", data: auctionData });
      }
      if (commentaryText) {
        extras.push({ id: newId(), type: "text", data: { text: commentaryText } });
      }
      onChange([...blocks, newBlock, ...extras]);
    }
    setModal(null);
  }

  function handleModalSaveAll(
    deals: Array<{ handData: BridgeHandBlock["data"] | PlayHandBlock["data"]; auctionData?: BiddingTableBlock["data"]; commentary?: string }>,
  ) {
    const isPlayHand = modal?.type === "playHand";
    const newBlocks: ContentBlock[] = [];
    for (const { handData, auctionData, commentary } of deals) {
      if (isPlayHand) {
        newBlocks.push({ id: newId(), type: "playHand", data: handData as PlayHandBlock["data"] });
        // In playHand mode the auction is already embedded; no companion biddingTable
      } else {
        newBlocks.push({ id: newId(), type: "bridgeHand", data: handData as BridgeHandBlock["data"] });
        if (auctionData) {
          newBlocks.push({ id: newId(), type: "biddingTable", data: auctionData });
        }
      }
      if (commentary) {
        newBlocks.push({ id: newId(), type: "text", data: { text: commentary } });
      }
    }
    onChange([...blocks, ...newBlocks]);
    setModal(null);
  }

  function openEditModal(block: ContentBlock) {
    if (block.type === "text" || block.type === "mscResults" || block.type === "solution") return;
    setModal({ type: block.type as Exclude<ContentBlock["type"], "text" | "playHand" | "mscResults" | "solution"> | "playHand", blockId: block.id });
  }

  // Get initial data for modal when editing
  const editingBlock =
    modal && modal.type !== "parseText" && modal.blockId
      ? blocks.find((b) => b.id === modal.blockId)
      : null;

  return (
    <div className="space-y-3">
      {/* Selection toolbar */}
      {!nested && selected.size > 0 && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-sm px-4 py-2">
          <span className="font-sans text-xs text-violet-600">
            {selected.size} block{selected.size !== 1 ? "s" : ""} selected
          </span>
          {canWrap && (
            <button
              onClick={wrapInSolution}
              className="font-sans text-xs font-medium text-violet-700 border border-violet-300 bg-white px-3 py-1 rounded hover:bg-violet-50 transition-colors"
            >
              Wrap in Solution
            </button>
          )}
          {!isConsecutive && selected.size > 1 && (
            <span className="font-sans text-xs text-amber-600">
              Selection must be consecutive
            </span>
          )}
          {selectionHasSolution && (
            <span className="font-sans text-xs text-amber-600">
              Cannot nest solutions
            </span>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto font-sans text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {blocks.map((block, index) => (
        <div key={block.id}>
          {block.type === "solution" ? (
            /* Solution blocks get special rendering */
            <div>
              <div className="flex items-center gap-1 mb-1">
                {!nested && (
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={(e) => toggleSelect(index, e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).shiftKey)}
                    className="w-3.5 h-3.5 accent-violet-600 cursor-pointer mr-1"
                  />
                )}
                <span className="font-mono text-xs text-stone-300 mr-1">#{index + 1}</span>
                <span className="flex-1" />
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  title="Move up"
                  className="text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-30 px-1 text-sm"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === blocks.length - 1}
                  title="Move down"
                  className="text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-30 px-1 text-sm"
                >
                  ↓
                </button>
                <button
                  onClick={() => deleteBlock(index)}
                  title="Delete"
                  className="text-stone-400 hover:text-red-600 transition-colors px-1 text-sm"
                >
                  ×
                </button>
              </div>
              <SolutionEditor
                block={block}
                onUpdate={(updated) => updateBlock(index, updated)}
                onUnwrap={() => unwrapSolution(index)}
              />
            </div>
          ) : (
            /* Normal blocks */
            <div className={`group relative border rounded-sm bg-white ${selected.has(index) ? "border-violet-400 ring-1 ring-violet-200" : "border-stone-200"}`}>
              {/* Controls */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-stone-100 bg-stone-50">
                {!nested && (
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={(e) => toggleSelect(index, e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).shiftKey)}
                    className="w-3.5 h-3.5 accent-violet-600 cursor-pointer mr-1"
                  />
                )}
                <span className="font-mono text-xs text-stone-300 mr-1">#{index + 1}</span>
                <span className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-400 flex-1">
                  {block.type === "bridgeHand"
                    ? "Bridge Hand"
                    : block.type === "playHand"
                    ? "Play Hand"
                    : block.type === "biddingTable"
                    ? "Bidding Table"
                    : block.type === "mscResults"
                    ? "MSC Results"
                    : block.type.charAt(0).toUpperCase() + block.type.slice(1)}
                </span>
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  title="Move up"
                  className="text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-30 px-1 text-sm"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === blocks.length - 1}
                  title="Move down"
                  className="text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-30 px-1 text-sm"
                >
                  ↓
                </button>
                {block.type !== "text" && block.type !== "mscResults" && (
                  <button
                    onClick={() => openEditModal(block)}
                    title="Edit"
                    className="text-stone-400 hover:text-blue-600 transition-colors px-1 text-xs font-sans"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => deleteBlock(index)}
                  title="Delete"
                  className="text-stone-400 hover:text-red-600 transition-colors px-1 text-sm"
                >
                  ×
                </button>
              </div>

              {/* Block content */}
              <div className="p-3">
                {block.type === "text" ? (
                  <TextBlockEditor
                    block={block}
                    onChange={(text) =>
                      updateBlock(index, { ...block, data: { text } })
                    }
                  />
                ) : (
                  <BlockSummary block={block} />
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {blocks.length === 0 && (
        <div className="text-center py-12 text-stone-300 font-sans text-sm italic">
          No content yet. Add a block below.
        </div>
      )}

      {/* Add block toolbar */}
      <div className="flex flex-wrap gap-2 pt-2">
        <span className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-400 self-center mr-2">
          Add:
        </span>
        {(
          [
            { type: "text" as const, label: "Text" },
            { type: "bridgeHand" as const, label: "Bridge Hand" },
            { type: "playHand" as const, label: "Play Hand" },
            { type: "biddingTable" as const, label: "Bidding Table" },
            { type: "image" as const, label: "Image" },
            { type: "video" as const, label: "Video" },
          ] as const
        ).map(({ type, label }) => (
          <button
            key={type}
            onClick={() => addBlock(type)}
            className="font-sans text-xs border border-stone-300 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-400 transition-colors"
          >
            + {label}
          </button>
        ))}
        <button
          onClick={() => setModal({ type: "parseText" })}
          className="font-sans text-xs border border-stone-400 text-stone-700 bg-stone-50 px-3 py-1.5 rounded hover:bg-stone-100 hover:border-stone-500 transition-colors ml-2"
        >
          Parse Text
        </button>
      </div>

      {/* Modals */}
      {modal?.type === "bridgeHand" && (
        <BridgeHandModal
          initial={
            editingBlock?.type === "bridgeHand"
              ? editingBlock.data
              : undefined
          }
          onSave={handleModalSave}
          onSaveAll={modal.blockId === null ? handleModalSaveAll : undefined}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "playHand" && (
        <BridgeHandModal
          mode="playHand"
          initial={
            editingBlock?.type === "playHand"
              ? editingBlock.data
              : undefined
          }
          onSave={handleModalSave}
          onSaveAll={modal.blockId === null ? handleModalSaveAll : undefined}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "biddingTable" && (
        <BiddingTableModal
          initial={
            editingBlock?.type === "biddingTable"
              ? editingBlock.data
              : undefined
          }
          onSave={handleModalSave}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.type === "image" || modal?.type === "video") && (
        <ImageVideoModal
          type={modal.type}
          initial={
            editingBlock?.type === modal.type
              ? editingBlock.data
              : undefined
          }
          onSave={handleModalSave}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "parseText" && (
        <ParseTextModal
          onInsert={(newBlocks) => onChange([...blocks, ...newBlocks])}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
