import { SidebarNav } from "./sidebar-nav";
import type { UserProfile } from "@/types/auth";

/** Fixed sidebar for laptop and desktop widths. */
export function Sidebar({ profile }: { profile: UserProfile }) {
  return (
    <aside className="bg-sidebar border-sidebar-border/70 hidden w-[16.5rem] shrink-0 rounded-2xl border py-5 shadow-[0_1px_2px_0_oklch(0_0_0/0.03)] lg:flex lg:flex-col">
      <SidebarNav profile={profile} />
    </aside>
  );
}
