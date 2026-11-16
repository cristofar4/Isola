"use client";

import { create } from "zustand";

export type Tool = "move" | "restore" | "erase" | "crop";
/** What the visitor came to the editor to do (from the Tools menu), shown as a hint and applied once an image is ready. */
export type EditorIntent = "restore" | "background" | "crop";

// The crop ratio is part of each image's settings (and its undo history), not editor UI state.
export { aspectRatioOf, type AspectPreset } from "@/lib/editor/types";

export type ViewCommand =
  | { type: "fit" }
  | { type: "zoom-to"; scale: number }
  | { type: "zoom-by"; factor: number };

interface EditorUIState {
  projectName: string;
  tool: Tool;
  brushSize: number;
  brushHardness: number;
  compare: boolean;
  comparePosition: number;
  zoom: number;
  command: (ViewCommand & { nonce: number }) | null;
  exportOpen: boolean;
  intent: EditorIntent | null;
  /** Set when the intent still needs applying to a ready image. */
  intentPending: boolean;
  setIntent: (intent: EditorIntent | null) => void;
  clearIntentPending: () => void;
  setProjectName: (name: string) => void;
  setTool: (tool: Tool) => void;
  setBrushSize: (size: number) => void;
  setBrushHardness: (hardness: number) => void;
  setCompare: (compare: boolean) => void;
  setComparePosition: (position: number) => void;
  setZoom: (zoom: number) => void;
  view: (command: ViewCommand) => void;
  setExportOpen: (open: boolean) => void;
}

export const BRUSH_MIN = 4;
export const BRUSH_MAX = 240;

export const useEditorUI = create<EditorUIState>((set) => ({
  projectName: "Untitled project",
  tool: "move",
  brushSize: 40,
  brushHardness: 0.6,
  compare: false,
  comparePosition: 0.5,
  zoom: 1,
  command: null,
  exportOpen: false,
  intent: null,
  intentPending: false,
  setIntent: (intent) => set({ intent, intentPending: intent !== null }),
  clearIntentPending: () => set({ intentPending: false }),
  setProjectName: (projectName) => set({ projectName }),
  setTool: (tool) => set((s) => ({ tool, compare: tool === "crop" ? false : s.compare })),
  setBrushSize: (size) => set({ brushSize: Math.round(Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, size))) }),
  setBrushHardness: (brushHardness) => set({ brushHardness }),
  setCompare: (compare) => set((s) => ({ compare, tool: compare && s.tool === "crop" ? "move" : s.tool })),
  setComparePosition: (comparePosition) => set({ comparePosition: Math.min(1, Math.max(0, comparePosition)) }),
  setZoom: (zoom) => set({ zoom }),
  view: (command) => set({ command: { ...command, nonce: Date.now() + Math.random() } }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
}));
