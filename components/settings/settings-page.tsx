import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/settings-form";
import { SETTINGS_COPY } from "@/lib/settings/copy";
import { requirePermission } from "@/lib/auth/require-auth";
import { getSettingsByCategory } from "@/lib/settings/queries";
import type { SettingCategory } from "@/types/settings";

/**
 * A settings category page.
 *
 * The controls are built from the metadata each setting carries in the database
 * — its type, its bounds, its allowed values — so a page is a title, a sentence
 * and an ordering. Adding a setting is a migration, not a new screen, and a
 * setting can never render a control that disagrees with what the database will
 * accept.
 */
export async function SettingsCategoryPage({
  category,
  title,
  description,
  groups,
  extraCopy,
  children,
}: {
  category: SettingCategory;
  title: string;
  description: string;
  groups?: { title: string; description?: string; keys: string[] }[];
  extraCopy?: Record<string, { label: string; hint?: string; options?: { value: string; label: string }[] }>;
  /** Rendered above the form — a warning, a related link, a note. */
  children?: React.ReactNode;
}) {
  await requirePermission("MANAGE_SETTINGS");
  const settings = await getSettingsByCategory(category);

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      {children}
      <Card>
        <CardContent className="pt-6">
          <SettingsForm
            settings={settings}
            copy={{ ...SETTINGS_COPY, ...(extraCopy ?? {}) }}
            groups={groups}
          />
        </CardContent>
      </Card>
    </div>
  );
}
