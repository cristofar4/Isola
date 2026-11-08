"use client";

import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      {children}
    </Tooltip.Provider>
  );
}
