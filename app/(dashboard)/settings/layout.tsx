import { SettingsNav } from "@/components/settings/settings-nav";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { SETTINGS_NAV } from "@/lib/settings/navigation";

/**
 * The settings shell (§74).
 *
 * Navigation on one side, content on the other; on a phone the navigation
 * collapses. The permission filtering happens here, on the server, and only the
 * resulting list of routes crosses to the client — the nav items themselves
 * carry icon components, which cannot be serialised.
 *
 * Every page guards itself again on arrival, because hiding a link is
 * presentation, not access control (§78).
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();

  const allowed = SETTINGS_NAV.flatMap((section) => section.items)
    .filter((item) => hasPermission(profile, item.permission))
    .map((item) => item.href);

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SettingsNav allowed={allowed} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
