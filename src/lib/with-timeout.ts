/**
 * Bounds how long a promise is waited on.
 *
 * Note what this does not do: it cannot cancel the underlying work. A timed-out
 * query keeps running on the connection. What it buys is a caller that stops
 * waiting, which is the property a request with a deadline actually needs.
 *
 * Used by the email transport and by the Supabase Send Email Hook, where the
 * user's auth request is blocked on the response and Supabase fails that
 * request rather than falling back to its own mailer.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Same bound, but a timeout or rejection yields `fallback` instead of throwing. */
export async function withTimeoutOr<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  fallback: T
): Promise<T> {
  try {
    return await withTimeout(promise, ms, label);
  } catch (err) {
    console.error(`[timeout] ${label}:`, err);
    return fallback;
  }
}
