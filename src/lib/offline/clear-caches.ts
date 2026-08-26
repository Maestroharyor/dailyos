/**
 * Everything this browser is holding on behalf of the signed-in user.
 *
 * DailyOS runs on shared terminals — one till, several cashiers through a
 * shift — so signing out has to leave nothing readable behind. The service
 * worker owns the Cache Storage buckets, so it does the deleting; this asks it
 * to and waits for the acknowledgement.
 *
 * Best-effort by design: a sign-out must never be blocked by a worker that is
 * missing, still installing, or slow to answer.
 */

const ACK_TIMEOUT_MS = 2000;

export async function clearOfflineCaches(): Promise<void> {
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
    controller.postMessage({ type: "CLEAR_CACHES" }, [channel.port2]);
  });
}
