import { FormSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <FormSkeleton fields={7} />
    </div>
  );
}
