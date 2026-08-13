"use client";

import Link from "next/link";
import { useTransition } from "react";
import { LoaderCircle, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleBadge } from "@/components/shared/role-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { signOutAction } from "@/app/actions/auth";
import { PROFILE_ROUTE } from "@/lib/routes";
import type { UserProfile } from "@/types/auth";

export function UserMenu({ profile }: { profile: UserProfile }) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      toast.success("تم تسجيل الخروج");
      // The action redirects to /login after revoking the session.
      await signOutAction();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="hover:bg-accent/60 h-auto gap-3 rounded-xl py-1.5 ps-2 pe-1.5"
        >
          <div className="hidden text-start leading-tight sm:block">
            <p className="text-sm font-medium">{profile.full_name}</p>
            <p className="text-muted-foreground text-xs">
              {profile.email}
            </p>
          </div>
          <UserAvatar
            fullName={profile.full_name}
            avatarUrl={profile.avatar_url}
            className="size-9"
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-3">
          <UserAvatar
            fullName={profile.full_name}
            avatarUrl={profile.avatar_url}
            className="size-10"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm font-medium">{profile.full_name}</p>
            <p className="text-muted-foreground truncate text-xs font-normal">
              {profile.email}
            </p>
            <RoleBadge role={profile.role} className="mt-1" />
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={PROFILE_ROUTE} className="cursor-pointer">
            <UserRound className="size-4" />
            الملف الشخصي
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={isPending}
          onSelect={(event) => {
            event.preventDefault();
            handleSignOut();
          }}
          className="cursor-pointer"
        >
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
