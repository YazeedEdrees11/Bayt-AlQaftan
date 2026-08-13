"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Follows the same conventions as `switch.tsx`: Radix for the behaviour and
 * keyboard handling, the palette tokens for the look.
 *
 * The `after:` inset enlarges the hit area beyond the 16px box without changing
 * the layout, so a thumb has something to land on. The visible control stays
 * small because a login form is not a settings screen.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input relative size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-3",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
        "data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
