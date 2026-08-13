"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SupplierDialog } from "./supplier-dialog";
import type { Supplier } from "@/types/catalog";

/** Opens the supplier form from the detail page header. */
export function SupplierEditButton({ supplier }: { supplier: Supplier }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-4" />
        تعديل
      </Button>
      {open ? (
        <SupplierDialog open={open} onOpenChange={setOpen} supplier={supplier} />
      ) : null}
    </>
  );
}
