"use server";

import type { DeliveryNote as PDeliveryNote } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

/**
 * The copy shown under a delivery option at checkout, stored once per key
 * rather than once per option.
 *
 * The interstate hub note is four sentences and appears under 74 options. Held
 * on the option rows it would take 74 edits to change a word, and 74 chances
 * for one of them to end up saying something different from the rest. These are
 * the terms a customer accepts when they pay, so they have to be identical.
 */

const deliveryNoteSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, "Use upper snake case, e.g. INTERSTATE_HUB"),
  label: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
  // Whether the note is folded away until its option is selected. A property of
  // the copy, not the option: a four-sentence note repeated down a list is
  // noise, while a one-line one is useful at a glance.
  isCollapsible: z.boolean().optional(),
});

export type DeliveryNoteInput = z.infer<typeof deliveryNoteSchema>;

function serializeNote(note: PDeliveryNote) {
  return {
    id: note.id,
    key: note.key,
    label: note.label,
    body: note.body,
    isCollapsible: note.isCollapsible,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export type SerializedDeliveryNote = ReturnType<typeof serializeNote>;

export async function listDeliveryNotes(spaceId: string) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const notes = await prisma.deliveryNote.findMany({
      where: { spaceId },
      orderBy: [{ key: "asc" }],
    });
    return actionSuccess(notes.map(serializeNote), "Delivery notes fetched");
  } catch (error) {
    console.error("Error fetching delivery notes:", error);
    return actionError("Failed to fetch delivery notes");
  }
}

/**
 * Upsert rather than create, keyed on (spaceId, key).
 *
 * A note is addressed by its key from every option that points at it, so the
 * key is the identity and saving the same key twice is an edit, not a
 * duplicate.
 */
export async function saveDeliveryNote(spaceId: string, input: DeliveryNoteInput) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = deliveryNoteSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const note = await prisma.deliveryNote.upsert({
      where: { spaceId_key: { spaceId, key: parsed.data.key } },
      create: {
        spaceId,
        key: parsed.data.key,
        label: parsed.data.label.trim(),
        body: parsed.data.body,
        isCollapsible: parsed.data.isCollapsible ?? false,
      },
      update: {
        label: parsed.data.label.trim(),
        body: parsed.data.body,
        ...(parsed.data.isCollapsible !== undefined && {
          isCollapsible: parsed.data.isCollapsible,
        }),
      },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(serializeNote(note), "Delivery note saved");
  } catch (error) {
    console.error("Error saving delivery note:", error);
    return actionError("Failed to save delivery note");
  }
}

export async function deleteDeliveryNote(spaceId: string, key: string) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const existing = await prisma.deliveryNote.findUnique({
      where: { spaceId_key: { spaceId, key } },
    });
    if (!existing) {
      return actionError("Delivery note not found");
    }

    // Options point at a note by key with no foreign key, so a delete cannot
    // fail on a reference. It can leave an option pointing at nothing, which
    // renders as no note rather than an error, so warn about it here rather
    // than letting the copy quietly disappear from checkout.
    const referencing = await prisma.deliveryZone.count({ where: { spaceId, noteKey: key } });
    if (referencing > 0) {
      return actionError(
        `${referencing} delivery option${referencing === 1 ? "" : "s"} still show this note. Point them elsewhere first.`
      );
    }

    await prisma.deliveryNote.delete({ where: { spaceId_key: { spaceId, key } } });

    revalidatePath("/commerce/settings");
    return actionSuccess(null, "Delivery note deleted");
  } catch (error) {
    console.error("Error deleting delivery note:", error);
    return actionError("Failed to delete delivery note");
  }
}
