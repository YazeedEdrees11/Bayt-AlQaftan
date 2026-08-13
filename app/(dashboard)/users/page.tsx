import { redirect } from "next/navigation";

/**
 * User management moved under settings in Phase 8, where it sits beside roles
 * and permissions. The old route redirects rather than 404s, because it is in
 * people's history and their bookmarks.
 */
export default function UsersPage() {
  redirect("/settings/users");
}
