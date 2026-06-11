"use server";

import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import type { RecurrenceType } from "@prisma/client";

// Safety cap so a very old weekly template can't generate an unbounded backlog
// in a single pass.
const MAX_INSTANCES_PER_TEMPLATE = 520;

// Strip time so comparisons happen at day granularity (Transaction.date is @db.Date).
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Advance a date by one recurrence period. Month/year steps clamp the day to the
// last day of the target month (e.g. Jan 31 + 1 month -> Feb 28/29).
function addPeriod(date: Date, type: RecurrenceType): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  if (type === "weekly") {
    return new Date(y, m, d + 7);
  }

  const monthOffset = type === "yearly" ? 12 : 1;
  const targetYear = y + Math.floor((m + monthOffset) / 12);
  const targetMonth = (m + monthOffset) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(d, lastDay));
}

/**
 * On-read catch-up: for every recurring template in the space, generate the
 * transaction instances that should have occurred between the latest existing
 * occurrence and today. Idempotent — it resumes from the newest instance date,
 * so repeated calls create nothing once caught up.
 *
 * Convention: a template has `recurring=true, recurringTemplateId=null`; each
 * generated instance has `recurring=false, recurringTemplateId=<template.id>`.
 */
export async function materializeRecurring(spaceId: string) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "edit_finances");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const templates = await prisma.transaction.findMany({
      where: { spaceId, recurring: true, recurringTemplateId: null },
    });

    if (templates.length === 0) {
      return actionSuccess({ created: 0 }, "No recurring templates");
    }

    const today = startOfDay(new Date());
    const toCreate: {
      spaceId: string;
      type: (typeof templates)[number]["type"];
      amount: (typeof templates)[number]["amount"];
      category: string;
      description: string;
      date: Date;
      tags: string[];
      recurring: false;
      recurringTemplateId: string;
    }[] = [];

    for (const template of templates) {
      if (!template.recurrenceType) continue;

      // Resume from the newest occurrence: the template date or the latest instance.
      const latestInstance = await prisma.transaction.aggregate({
        where: { spaceId, recurringTemplateId: template.id },
        _max: { date: true },
      });
      let cursor = startOfDay(latestInstance._max.date ?? template.date);

      let generated = 0;
      while (generated < MAX_INSTANCES_PER_TEMPLATE) {
        cursor = addPeriod(cursor, template.recurrenceType);
        if (cursor > today) break;

        toCreate.push({
          spaceId,
          type: template.type,
          amount: template.amount,
          category: template.category,
          description: template.description,
          date: cursor,
          tags: template.tags,
          recurring: false,
          recurringTemplateId: template.id,
        });
        generated++;
      }
    }

    if (toCreate.length === 0) {
      return actionSuccess({ created: 0 }, "Recurring transactions up to date");
    }

    const result = await prisma.transaction.createMany({ data: toCreate });
    return actionSuccess(
      { created: result.count },
      "Recurring transactions generated"
    );
  } catch (error) {
    console.error("Error materializing recurring transactions:", error);
    return actionError("Failed to generate recurring transactions");
  }
}
