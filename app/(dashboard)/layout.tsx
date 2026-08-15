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
  const [authUser, _] = await Promise.all([
    requireAuth(),
    enforceMaintenanceMode(),
  ]);
  const { profile } = authUser;

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
    <div className="bg-background min-h-svh p-0 lg:px-4 lg:pb-4">
      <div className="mx-auto flex w-full max-w-[1760px] lg:gap-4">
        <Sidebar profile={profile} />

        <div className="flex min-w-0 flex-1 flex-col relative">
          <div className="sticky top-0 z-40 bg-background pb-3 sm:pb-4 pt-3 sm:pt-4 lg:pt-4">
            <Header
              profile={profile}
              showNotifications={showNotifications}
              unreadNotifications={unreadNotifications}
            />
          </div>

          <main className="bg-background lg:bg-card border-border/70 border-0 lg:border rounded-none lg:rounded-2xl p-5 shadow-none lg:shadow-[0_1px_2px_0_oklch(0_0_0/0.03)] sm:p-7">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
