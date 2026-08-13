"use client";

import { Direction } from "radix-ui";

import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side providers shared by the whole app.
 *
 * `Direction.Provider` tells every Radix primitive that the document reads
 * right-to-left, so menus, sheets and tooltips open on the correct side.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Direction.Provider dir="rtl">
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </Direction.Provider>
  );
}
