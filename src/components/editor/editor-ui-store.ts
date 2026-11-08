"use client";

import { create } from "zustand";

export type Tool = "move" | "restore" | "erase" | "crop";
export type AspectPreset = "free" | "original" | "1:1" | "4:5" | "3:2" | "16:9" | "9:16";

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
  aspect: AspectPreset;
  command: (ViewCommand & { nonce: number }) | null;
  exportOpen: boolean;
  setProjectName: (name: string) => void;
  setTool: (tool: Tool) => void;
  setBrushSize: (size: number) => void;
  setBrushHardness: (hardness: number) => void;
  setCompare: (compare: boolean) => void;
  setComparePosition: (position: number) => void;
  setZoom: (zoom: number) => void;
  setAspect: (aspect: AspectPreset) => void;
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
  aspect: "free",
  command: null,
  exportOpen: false,
  setProjectName: (projectName) => set({ projectName }),
  setTool: (tool) => set((s) => ({ tool, compare: tool === "crop" ? false : s.compare })),
  setBrushSize: (size) => set({ brushSize: Math.round(Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, size))) }),
  setBrushHardness: (brushHardness) => set({ brushHardness }),
  setCompare: (compare) => set((s) => ({ compare, tool: compare && s.tool === "crop" ? "move" : s.tool })),
  setComparePosition: (comparePosition) => set({ comparePosition: Math.min(1, Math.max(0, comparePosition)) }),
  setZoom: (zoom) => set({ zoom }),
  setAspect: (aspect) => set({ aspect }),
  view: (command) => set({ command: { ...command, nonce: Date.now() + Math.random() } }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
}));

export function aspectRatioOf(aspect: AspectPreset, width: number, height: number): number | null {
  switch (aspect) {
    case "free":
      return null;
    case "original":
      return width / height;
    case "1:1":
      return 1;
    case "4:5":
      return 4 / 5;
    case "3:2":
      return 3 / 2;
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
  }
}
