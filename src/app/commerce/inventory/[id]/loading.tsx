import { DetailSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto p-4">
      <DetailSkeleton
        showImage={false}
        sections={3}
      />
    </div>
  );
}
