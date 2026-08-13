import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { requireAuth } from "@/lib/auth/require-auth";
import { enforceMaintenanceMode } from "@/lib/settings/maintenance";
import { getUnreadNotificationCount } from "@/lib/settings/queries";
import { hasPermission } from "@/lib/permissions/check-permission";

/**
 * Every authenticated screen is rendered per request: the session, the profile
 * and the permission checks all depend on the incoming cookies, so there is
 * nothing here worth prerendering. Applies to all nested routes.
 */
export const dynamic = "force-dynamic";

/**
 * Shell for every authenticated route.
 *
 * `requireAuth()` runs before anything renders: no session means a redirect to
 * /login, and a deactivated account is signed out on the spot. Individual
 * pages add their own permission guard on top.
 *
 * Maintenance mode is checked here rather than in middleware: middleware runs
 * for every request including static assets, and this is the first thing every
 * protected page renders — early enough to keep people out, cheap enough to do
 * with a real database read (§69).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();
  await enforceMaintenanceMode();

  const showNotifications = hasPermission(profile, "VIEW_NOTIFICATIONS");
  const unreadNotifications = showNotifications ? await getUnreadNotificationCount() : 0;

  /*
   * A fixed shell: the viewport is the frame, and only `main` scrolls inside
   * it. The sidebar and the header stay where they are at every width.
   *
   * `h-svh` rather than `min-h-svh` is what makes it fixed — a minimum lets the
   * page grow past the viewport and take the chrome with it, which is what it
   * used to do. `min-h-0` on the scrolling column is the other half: without
   * it a flex child refuses to shrink below its content, so `overflow-y-auto`
   * on `main` never has a bounded height to scroll within and does nothing.
   *
   * `svh` and not `dvh`: on a phone the small viewport is the height with the
   * browser chrome showing, so the shell is sized for the worst case and never
   * jumps as the address bar hides and reappears mid-scroll.
   *
   * `data-app-shell` marks the two elements that are deliberately clipped, so
   * the print stylesheet can unclip exactly those and nothing else. Without it
   * a printed receipt stops at the fold.
   */
  return (
    <div
      data-app-shell
      className="bg-background h-svh overflow-hidden p-0 lg:p-4"
    >
      <div
        data-app-shell
        className="mx-auto flex h-full w-full max-w-[1760px] gap-4"
      >
        <Sidebar profile={profile} />

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-0">
          <Header
            profile={profile}
            showNotifications={showNotifications}
            unreadNotifications={unreadNotifications}
          />

          <main className="bg-card border-border/70 min-h-0 flex-1 overflow-y-auto rounded-2xl border p-5 shadow-[0_1px_2px_0_oklch(0_0_0/0.03)] sm:p-7">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
