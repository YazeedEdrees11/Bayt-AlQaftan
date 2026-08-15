const { createClient } = require('@supabase/supabase-js');

const url = 'https://aqxrmxobhyoutyqbogsy.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxeHJteG9iaHlvdXR5cWJvZ3N5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTIzOCwiZXhwIjoyMTAxOTIxMjM4fQ.HmlikJFxPUbqbRpDW3GRSpwBW6qc6y6LpLgRxlgOQak';
const supabase = createClient(url, key);

const id = 'e2aaf152-af38-43fe-a40b-a57b8c7a13d7';

async function run() {
  console.log("Starting profile of queries for product:", id);
  
  let start = Date.now();
  const { data: product, error: pError } = await supabase
    .from("products")
    .select("*, category:categories(id, name)")
    .eq("id", id)
    .maybeSingle();
  console.log(`1. Fetch product took: ${Date.now() - start}ms (error: ${pError?.message || 'none'})`);

  start = Date.now();
  const [variantsResult, imagesResult, stockResult] = await Promise.all([
    supabase
      .from("product_variants")
      .select("*, supplier:suppliers(id, name)")
      .eq("product_id", id)
      .order("created_at"),
    supabase
      .from("product_images")
      .select("*")
      .eq("product_id", id)
      .order("is_primary", { ascending: false })
      .order("sort_order")
      .order("created_at"),
    supabase.from("variant_stock").select("*").eq("product_id", id),
  ]);
  console.log(`2. Fetch variants/images/stock took: ${Date.now() - start}ms`);

  const images = imagesResult.data ?? [];
  const paths = images.map((i) => i.storage_path);
  console.log("Paths to sign:", paths);

  if (paths.length > 0) {
    start = Date.now();
    const { data: urls, error: signError } = await supabase.storage
      .from('product-images')
      .createSignedUrls(paths, 3600);
    console.log(`3. createSignedUrls took: ${Date.now() - start}ms (error: ${signError?.message || 'none'})`);
  }
}

run();
