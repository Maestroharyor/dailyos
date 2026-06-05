// Module-agnostic page skeleton used as the streamed `loading.tsx` fallback for
// routes without a tailored skeleton. Header + stat cards + a list block.
export function GenericPageSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-64 rounded-lg bg-gray-100 dark:bg-gray-800/60" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-gray-200 dark:bg-gray-800" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
          />
        ))}
      </div>

      {/* List / table block */}
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 border-b border-gray-100 dark:border-gray-800 last:border-0"
          >
            <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-1/4 rounded bg-gray-100 dark:bg-gray-800/60" />
            </div>
            <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
