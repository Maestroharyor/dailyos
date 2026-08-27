import { FormSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto p-4">
      <FormSkeleton fields={6} />
    </div>
  );
}
