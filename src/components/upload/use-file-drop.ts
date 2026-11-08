"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Drag-and-drop state that survives nested children (enter/leave counting). */
export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = useCallback(
    (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      depth.current++;
      setDragging(true);
    },
    [disabled],
  );
  const onDragOver = useCallback(
    (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );
  const onDragLeave = useCallback((event: DragEvent) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);
  const onDrop = useCallback(
    (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length) onFiles(files);
    },
    [disabled, onFiles],
  );

  return { dragging, bind: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
