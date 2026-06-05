import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { successResponse, errorResponse } from "@/lib/api-response";
import type { Capability } from "@/lib/types/permissions";

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MB = 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/**
 * Per-entity upload rules. `bucket` "media" is public-read; "receipts" is private
 * (the caller persists the returned `path` and reads it via a signed URL later).
 */
const ENTITY_CONFIG: Record<
  string,
  { bucket: "media" | "receipts"; capability: Capability; maxBytes: number; mimes: string[] }
> = {
  products: { bucket: "media", capability: "edit_products", maxBytes: 5 * MB, mimes: IMAGE_MIMES },
  branding: { bucket: "media", capability: "manage_account_settings", maxBytes: 5 * MB, mimes: IMAGE_MIMES },
  recipes: { bucket: "media", capability: "edit_recipes", maxBytes: 5 * MB, mimes: IMAGE_MIMES },
  "sale-events": { bucket: "media", capability: "edit_products", maxBytes: 5 * MB, mimes: IMAGE_MIMES },
  receipts: { bucket: "receipts", capability: "edit_finances", maxBytes: 10 * MB, mimes: [...IMAGE_MIMES, "application/pdf"] },
};

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const spaceId = form.get("spaceId");
    const entity = form.get("entity");

    if (!(file instanceof File)) {
      return errorResponse("file is required", 400);
    }
    if (typeof spaceId !== "string" || !spaceId) {
      return errorResponse("spaceId is required", 400);
    }
    if (typeof entity !== "string" || !(entity in ENTITY_CONFIG)) {
      return errorResponse("Invalid or missing entity", 400);
    }

    const config = ENTITY_CONFIG[entity];

    const auth = await authorizeAction(spaceId, config.capability);
    if (auth.error) {
      return errorResponse(auth.error, auth.status);
    }

    if (!config.mimes.includes(file.type)) {
      return errorResponse(`Unsupported file type: ${file.type || "unknown"}`, 415);
    }
    if (file.size > config.maxBytes) {
      return errorResponse(`File exceeds ${Math.round(config.maxBytes / MB)}MB limit`, 413);
    }

    const ext = EXT_BY_MIME[file.type] ?? "bin";
    const path = `${spaceId}/${entity}/${crypto.randomUUID()}.${ext}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(config.bucket)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload failed:", uploadError.message);
      return errorResponse("Upload failed", 500);
    }

    // Public bucket → stable public URL (persist this). Private bucket → return the
    // path (persist it) plus a short-lived signed URL for immediate preview.
    if (config.bucket === "media") {
      const { data } = admin.storage.from("media").getPublicUrl(path);
      return successResponse({ url: data.publicUrl, path, bucket: config.bucket }, "Uploaded");
    }

    const { data: signed } = await admin.storage
      .from("receipts")
      .createSignedUrl(path, 60 * 60);
    return successResponse(
      { url: signed?.signedUrl ?? null, path, bucket: config.bucket },
      "Uploaded"
    );
  } catch (error) {
    console.error("Error in /api/uploads:", error);
    return errorResponse("Failed to process upload", 500);
  }
}
