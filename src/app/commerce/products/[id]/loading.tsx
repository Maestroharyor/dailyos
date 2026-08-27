import { ProductDetailSkeleton } from "@/components/skeletons";

// Without this, the products *list* skeleton from ../loading.tsx is what shows
// while a product detail page loads: a loading.tsx boundary covers its segment
// and every route beneath it, so the nearest one wins.
export default function Loading() {
  return <ProductDetailSkeleton />;
}
