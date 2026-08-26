export function parsePagination(searchParams: URLSearchParams, defaultLimit = 20) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || String(defaultLimit), 10) || defaultLimit)
  );
  return { page, limit };
}
