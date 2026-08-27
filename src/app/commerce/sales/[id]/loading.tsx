import { DetailSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <DetailSkeleton
        showImage={false}
        sections={3}
      />
    </div>
  );
}
