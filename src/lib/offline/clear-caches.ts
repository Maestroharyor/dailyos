/**
 * Everything this browser is holding on behalf of the signed-in user.
 *
 * DailyOS runs on shared terminals — one till, several cashiers through a
 * shift — so signing out has to leave nothing readable behind. The service
 * worker owns the Cache Storage buckets, so it does the deleting; this asks it
 * to and waits for the acknowledgement.
 *
 * Best-effort by design, and it never rejects: `signOut` awaits it before
 * tearing down local auth state, so a worker that is missing, redundant,
 * still installing or slow to answer must not be able to stop that.
 */

const ACK_TIMEOUT_MS = 2000;

export async function clearOfflineCaches(): Promise<void> {
  try {
    await clearCaches();
  } catch (error) {
    // Never reject: signOut awaits this, and a failure here must not stop the
    // session from being torn down.
    console.warn("Could not clear offline caches:", error);
  }
}

async function clearCaches(): Promise<void> {
  if (typeof window === "undefined") return;

  // No worker controlling the page (first load, dev, unsupported browser) means
  // no worker-owned caches to clear. Delete directly where the API is exposed.
  const controller = navigator.serviceWorker?.controller;
  if (!controller) {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    return;
  }

  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const done = () => {
      channel.port1.close();
      resolve();
    };
    // Don't hold the redirect open on a worker that never answers.
    const timer = setTimeout(done, ACK_TIMEOUT_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      done();
    };
    try {
      controller.postMessage({ type: "CLEAR_CACHES" }, [channel.port2]);
    } catch (error) {
      // postMessage throws synchronously on a controller that has gone
      // redundant, which is most likely right after a deploy — the same moment
      // the new worker's activate handler is purging old caches. Letting that
      // reject would abort signOut before it clears local auth state, which is
      // a worse outcome than a cache that survives one sign-out.
      console.warn("Could not reach the service worker to clear caches:", error);
      clearTimeout(timer);
      done();
    }
  });
}
