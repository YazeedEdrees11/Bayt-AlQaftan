"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import { APP_NAME } from "@/lib/constants";
import type { UserProfile } from "@/types/auth";

/** Drawer navigation for tablet and phone widths. */
export function MobileSidebar({ profile }: { profile: UserProfile }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="فتح القائمة"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-sidebar w-[17rem] p-0 py-5">
        <SheetHeader className="sr-only">
          <SheetTitle>قائمة {APP_NAME}</SheetTitle>
        </SheetHeader>
        <SidebarNav profile={profile} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
