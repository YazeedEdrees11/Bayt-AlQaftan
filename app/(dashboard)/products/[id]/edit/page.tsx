import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ProductEditForm } from "@/components/products/product-edit-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { getProductById, listCategories } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "تعديل المنتج" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("UPDATE_PRODUCTS");
  const { id } = await params;

  const [product, categories] = await Promise.all([
    getProductById(id),
    listCategories(),
  ]);

  if (!product) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="تعديل المنتج"
        description={`تعديل بيانات «${product.name}». الموديلات تُعدَّل من صفحة المنتج.`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/products/${product.id}`}>
              <ChevronRight className="size-4" />
              رجوع للمنتج
            </Link>
          </Button>
        }
      />

      <ProductEditForm
        product={product}
        categories={categories}
        canCreateCategory
      />
    </div>
  );
}
