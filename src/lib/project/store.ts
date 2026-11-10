"use client";

import { create } from "zustand";
import { DEFAULT_SETTINGS, type EditSettings } from "@/lib/editor/types";
import { DEFAULT_ENGINE_ID, type EngineId } from "@/lib/processing/registry";
import type { EngineErrorCode, JobPhase } from "@/lib/processing/types";

export type ImageStatus = "decoding" | "queued" | "needs-auth" | "processing" | "ready" | "error" | "cancelled";

export interface ImageError {
  code: EngineErrorCode | string;
  message: string;
  detail?: string;
}

export interface ProjectImage {
  id: string;
  name: string;
  size: number;
  mime: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  /** Thumbnail of the original. */
  thumbUrl: string | null;
  /** Thumbnail of the cutout once processed. */
  resultThumbUrl: string | null;
  status: ImageStatus;
  phase: JobPhase | null;
  error: ImageError | null;
  /** Non-fatal information, e.g. no clear subject found. */
  notice: string | null;
  result: { engineId: string; backend: string; durationMs: number } | null;
  settings: EditSettings;
  /** Bumped whenever pixels shown on the canvas change. */
  revision: number;
  /** Set when the image was opened from Batch Studio; edits flow back to that item. */
  batchItemId: string | null;
  /** Set when the image was opened from a studio project; refined masks flow back to it. */
  libraryProjectId: string | null;
  history: { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string };
}

export interface BackgroundOption {
  id: string;
  name: string;
  thumbUrl: string;
}

interface ProjectState {
  images: ProjectImage[];
  activeId: string | null;
  engineId: EngineId;
  backgrounds: BackgroundOption[];
  setActive: (id: string | null) => void;
  setEngine: (id: EngineId) => void;
  addImage: (image: ProjectImage) => void;
  patchImage: (id: string, patch: Partial<ProjectImage> | ((image: ProjectImage) => Partial<ProjectImage>)) => void;
  dropImage: (id: string) => void;
  addBackground: (option: BackgroundOption) => void;
}

export function newImage(partial: Pick<ProjectImage, "id" | "name" | "size" | "mime"> & Partial<Pick<ProjectImage, "batchItemId" | "libraryProjectId" | "settings">>): ProjectImage {
  return {
    width: 0,
    height: 0,
    hasAlpha: false,
    thumbUrl: null,
    resultThumbUrl: null,
    status: "decoding",
    phase: null,
    error: null,
    notice: null,
    result: null,
    settings: DEFAULT_SETTINGS,
    revision: 0,
    history: { canUndo: false, canRedo: false },
    batchItemId: null,
    libraryProjectId: null,
    ...partial,
  };
}

export const useProject = create<ProjectState>((set) => ({
  images: [],
  activeId: null,
  engineId: DEFAULT_ENGINE_ID,
  backgrounds: [],
  setActive: (id) => set({ activeId: id }),
  setEngine: (engineId) => set({ engineId }),
  addImage: (image) => set((s) => ({ images: [...s.images, image], activeId: s.activeId ?? image.id })),
  patchImage: (id, patch) =>
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id ? { ...img, ...(typeof patch === "function" ? patch(img) : patch) } : img,
      ),
    })),
  dropImage: (id) =>
    set((s) => {
      const index = s.images.findIndex((i) => i.id === id);
      const images = s.images.filter((i) => i.id !== id);
      let activeId = s.activeId;
      if (activeId === id) activeId = images[Math.min(index, images.length - 1)]?.id ?? null;
      return { images, activeId };
    }),
  addBackground: (option) => set((s) => ({ backgrounds: [...s.backgrounds, option] })),
}));

export function useActiveImage(): ProjectImage | null {
  return useProject((s) => s.images.find((i) => i.id === s.activeId) ?? null);
}

export function getImage(id: string): ProjectImage | undefined {
  return useProject.getState().images.find((i) => i.id === id);
}
