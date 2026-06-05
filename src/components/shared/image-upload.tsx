"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@heroui/react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadEntity =
  | "products"
  | "branding"
  | "recipes"
  | "sale-events"
  | "receipts";

interface ImageUploadProps {
  /**
   * Current persisted value. For public entities this is the image URL; for a
   * private entity (`isPrivate`) it is the storage object PATH.
   */
  value?: string | null;
  /** Public: called with the URL. Private: called with the object path. null on remove. */
  onChange: (value: string | null) => void;
  /** Space the upload is authorized against. */
  spaceId: string;
  /** Determines the bucket, capability check, and size/type limits server-side. */
  entity: UploadEntity;
  /**
   * Private mode: persist the object path (not a public URL) and preview via a
   * short-lived signed URL. Use for `receipts`.
   */
  isPrivate?: boolean;
  accept?: string;
  /** Circle preview (avatars) instead of a rounded square. */
  rounded?: boolean;
  className?: string;
  label?: string;
}

/**
 * Single reusable uploader for the whole app. Posts the file to `/api/uploads`,
 * which stores it in Supabase Storage and returns a URL (public) or path + signed
 * URL (private); the caller persists the returned value in the existing column.
 */
export function ImageUpload({
  value,
  onChange,
  spaceId,
  entity,
  isPrivate = false,
  accept = "image/*",
  rounded = false,
  className,
  label = "Upload image",
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the preview <img> shows. For public it mirrors `value`; for private it
  // is a signed URL resolved from the stored path.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Resolve the preview source whenever the value changes.
  useEffect(() => {
    let active = true;
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    if (!isPrivate) {
      setPreviewUrl(value);
      return;
    }
    // Private: value is a path — fetch a signed URL for preview.
    fetch(`/api/uploads/sign?path=${encodeURIComponent(value)}`)
      .then((r) => r.json())
      .then((json) => {
        if (active && json.success) setPreviewUrl(json.data.url as string);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value, isPrivate]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("spaceId", spaceId);
      form.append("entity", entity);

      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Upload failed");
      }
      if (isPrivate) {
        onChange(json.data.path as string);
        setPreviewUrl(json.data.url as string);
      } else {
        onChange(json.data.url as string);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const shape = rounded ? "rounded-full" : "rounded-xl";
  const isPdf = previewUrl?.includes(".pdf") || value?.endsWith(".pdf");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center w-28 h-28 overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900",
          shape
        )}
      >
        {value && isPdf ? (
          <a
            href={previewUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 underline px-2 text-center"
          >
            View document
          </a>
        ) : previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded asset
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs">{label}</span>
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Spinner size="sm" color="white" />
          </div>
        )}

        {value && !uploading && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove"
            className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline self-start cursor-pointer disabled:cursor-not-allowed"
        >
          Replace
        </button>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
