import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
};

/**
 * The shell the service worker serves when a navigation cannot reach the
 * network. Deliberately static and deliberately empty of user data: it is
 * precached, so whatever is on this page is readable by anyone who later uses
 * the same browser. The old worker fell back to "/", which is a real
 * authenticated page.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-sm w-full text-center space-y-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          You&apos;re offline
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This page hasn&apos;t been opened on this device yet, so there is nothing saved to show.
          Pages you have already visited still work.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nothing is saved while you are offline yet. Wait for the connection before recording a
          sale.
        </p>
      </div>
    </div>
  );
}
