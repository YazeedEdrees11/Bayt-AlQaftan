"use client";

import { useState } from "react";
import { Pencil, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustomerDialog } from "./customer-dialog";
import {
  SalePaymentDialog,
  type PayableSale,
} from "@/components/sales/sale-payment-dialog";
import type { Customer } from "@/types/sales";

/** Edit + record-payment buttons for the customer detail header. */
export function CustomerHeaderActions({
  customer,
  outstandingSales,
  canUpdate,
  canPay,
}: {
  customer: Customer;
  outstandingSales: PayableSale[];
  canUpdate: boolean;
  canPay: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  return (
    <>
      {canPay ? (
        <Button
          onClick={() => setPayOpen(true)}
          disabled={outstandingSales.length === 0}
        >
          <Wallet className="size-4" />
          تسجيل دفعة
        </Button>
      ) : null}

      {canUpdate ? (
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
          تعديل
        </Button>
      ) : null}

      {editOpen ? (
        <CustomerDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          customer={customer}
        />
      ) : null}

      {payOpen ? (
        <SalePaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          sales={outstandingSales}
          receiptKey={customer.id}
        />
      ) : null}
    </>
  );
}
