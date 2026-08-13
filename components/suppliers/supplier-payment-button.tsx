"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PaymentDialog,
  type PayablePurchase,
} from "@/components/purchases/payment-dialog";

/** Opens the supplier payment dialog from the supplier detail header. */
export function SupplierPaymentButton({
  supplierId,
  purchases,
}: {
  supplierId: string;
  purchases: PayablePurchase[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={purchases.length === 0}>
        <Wallet className="size-4" />
        تسجيل دفعة
      </Button>
      {open ? (
        <PaymentDialog
          open={open}
          onOpenChange={setOpen}
          supplierId={supplierId}
          purchases={purchases}
        />
      ) : null}
    </>
  );
}
