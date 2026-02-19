"use client";

import { useState, useRef, useEffect } from "react";
import type {
  ContentBlock,
  BridgeHandBlock,
  BiddingTableBlock,
  ImageBlock,
  VideoBlock,
} from "@/types";
import BridgeHandModal from "./BridgeHandModal";
import BiddingTableModal from "./BiddingTableModal";
import ImageVideoModal from "./ImageVideoModal";

interface BlockListProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}

type ModalState =
  | { type: "bridgeHand"; blockId: string | null }
  | { type: "biddingTable"; blockId: string | null }
  | { type: "image"; blockId: string | null }
  | { type: "video"; blockId: string | null }
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
    case "biddingTable":
      return (
        <div className="text-xs font-sans text-stone-500">
          Bidding ({block.data.bids.length} bids) — Dealer: {block.data.dealer}
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
    default:
      return null;
  }
}

export default function BlockList({ blocks, onChange }: BlockListProps) {
  const [modal, setModal] = useState<ModalState>(null);

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
  function handleModalSave(data: unknown) {
    if (!modal) return;
    const id = newId();
    if (modal.blockId !== null) {
      // Editing existing block
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
      } else if (modal.type === "biddingTable") {
        newBlock = { id, type: "biddingTable", data: data as BiddingTableBlock["data"] };
      } else if (modal.type === "image") {
        newBlock = { id, type: "image", data: data as ImageBlock["data"] };
      } else {
        newBlock = { id, type: "video", data: data as VideoBlock["data"] };
      }
      onChange([...blocks, newBlock]);
    }
    setModal(null);
  }

  function openEditModal(block: ContentBlock) {
    if (block.type === "text") return; // text blocks are inline edited
    setModal({ type: block.type as Exclude<ContentBlock["type"], "text">, blockId: block.id });
  }

  // Get initial data for modal when editing
  const editingBlock = modal?.blockId
    ? blocks.find((b) => b.id === modal.blockId)
    : null;

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          className="group relative border border-stone-200 rounded-sm bg-white"
        >
          {/* Controls */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-stone-100 bg-stone-50">
            <span className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-400 flex-1">
              {block.type === "bridgeHand"
                ? "Bridge Hand"
                : block.type === "biddingTable"
                ? "Bidding Table"
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
            {block.type !== "text" && (
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
    </div>
  );
}
