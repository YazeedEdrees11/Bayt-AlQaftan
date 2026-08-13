import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ProductForm } from "@/components/products/product-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { listActiveSuppliers, listCategories } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "إضافة منتج" };

export default async function NewProductPage() {
  await requirePermission("CREATE_PRODUCTS");

  const [categories, suppliers] = await Promise.all([
    listCategories({ activeOnly: true }),
    listActiveSuppliers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة منتج"
        description="أضف الموديل العام ثم الموديلات القابلة للبيع بألوانها ومقاساتها."
        actions={
          <Button asChild variant="outline">
            <Link href="/products">
              <ChevronRight className="size-4" />
              رجوع للمنتجات
            </Link>
          </Button>
        }
      />

      <ProductForm
        categories={categories}
        suppliers={suppliers}
        canCreateCategory
      />
    </div>
  );
}
