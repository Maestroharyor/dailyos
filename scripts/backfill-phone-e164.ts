/**
 * Normalizes Customer.phone and Order.shippingPhone to E.164.
 *
 * Neither column has ever been validated, so both hold a mix of "0803...",
 * "+234803...", "234 803...", punctuation, and junk. An SMS provider needs
 * E.164 and fails per message on anything else, so this is the cleanup that has
 * to happen before a send path can trust the column.
 *
 * Rows it cannot parse are LEFT ALONE, not blanked. An unparseable number is
 * still something a merchant can read off an order and dial by hand, and the
 * send path normalizes defensively anyway, so a dirty row is skipped rather
 * than mis-sent. The counts below are the point of the dry run: if the
 * unparseable share is large, the fix is the capture path, not this script.
 *
 * Every row is parsed against ITS OWN space's CommerceSettings.defaultPhoneRegion,
 * never one global flag. National format is ambiguous across countries — a GB
 * mobile and an NG mobile are both a trunk zero and ten digits — so a single
 * --region against a multi-space database would rewrite one shop's good numbers
 * into fabricated numbers for another country, irreversibly and at write scale.
 * The per-space breakdown in the report is there so that is visible before
 * --commit, not after.
 *
 *   bun run scripts/backfill-phone-e164.ts            # dry run, writes nothing
 *   bun run scripts/backfill-phone-e164.ts --commit   # apply
 *   bun run scripts/backfill-phone-e164.ts --space <spaceId>   # one space only
 */
import { DEFAULT_PHONE_REGION, isE164, normalizePhone } from "../src/lib/commerce/phone";
import { prisma } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");

function parseSpaceFilter(): string | null {
  const i = process.argv.indexOf("--space");
  if (i === -1) return null;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--space needs a space id");
  }
  return value;
}

interface Tally {
  total: number;
  alreadyE164: number;
  normalized: number;
  unparseable: number;
  samples: string[];
}

function emptyTally(): Tally {
  return { total: 0, alreadyE164: 0, normalized: 0, unparseable: 0, samples: [] };
}

/** Redacted so a dry run can be pasted into a ticket without leaking numbers. */
function redact(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function report(label: string, tally: Tally) {
  console.log(`\n${label}`);
  console.log(`  rows with a phone:  ${tally.total}`);
  console.log(`  already E.164:      ${tally.alreadyE164}`);
  console.log(`  would normalize:    ${tally.normalized}`);
  console.log(`  unparseable:        ${tally.unparseable}`);
  if (tally.samples.length > 0) {
    console.log(`  unparseable samples (redacted): ${tally.samples.join(", ")}`);
  }
}

function classify(value: string, region: string, tally: Tally): string | null {
  tally.total += 1;
  if (isE164(value)) {
    tally.alreadyE164 += 1;
    return null;
  }
  const normalized = normalizePhone(value, region);
  if (!normalized) {
    tally.unparseable += 1;
    if (tally.samples.length < 10) tally.samples.push(redact(value));
    return null;
  }
  tally.normalized += 1;
  return normalized;
}

async function main() {
  const spaceFilter = parseSpaceFilter();
  console.log(COMMIT ? "MODE: commit (will write)" : "MODE: dry run (writes nothing)");

  const spaces = await prisma.space.findMany({
    where: spaceFilter ? { id: spaceFilter } : {},
    select: { id: true, name: true, commerceSettings: { select: { defaultPhoneRegion: true } } },
    orderBy: { name: "asc" },
  });
  if (spaces.length === 0) {
    console.log("No spaces matched.");
    return;
  }

  const customerUpdates: { id: string; phone: string }[] = [];
  const orderUpdates: { id: string; shippingPhone: string }[] = [];

  for (const space of spaces) {
    // A space with no commerce settings has never been configured, so there is
    // no shop region to read a national number against. Reported under the
    // fallback and worth eyeballing before --commit rather than assumed away.
    const region = space.commerceSettings?.defaultPhoneRegion ?? DEFAULT_PHONE_REGION;
    const configured = space.commerceSettings ? "" : " (no commerce settings, using fallback)";
    console.log(`\n=== ${space.name} [${space.id}] region ${region}${configured} ===`);

    const customerTally = emptyTally();
    const customers = await prisma.customer.findMany({
      where: { spaceId: space.id, phone: { not: null } },
      select: { id: true, phone: true },
    });
    for (const customer of customers) {
      if (!customer.phone) continue;
      const normalized = classify(customer.phone, region, customerTally);
      if (normalized) customerUpdates.push({ id: customer.id, phone: normalized });
    }

    const orderTally = emptyTally();
    const orders = await prisma.order.findMany({
      where: { spaceId: space.id, shippingPhone: { not: null } },
      select: { id: true, shippingPhone: true },
    });
    for (const order of orders) {
      if (!order.shippingPhone) continue;
      const normalized = classify(order.shippingPhone, region, orderTally);
      if (normalized) orderUpdates.push({ id: order.id, shippingPhone: normalized });
    }

    report("customers.phone", customerTally);
    report("orders.shipping_phone", orderTally);
  }

  if (!COMMIT) {
    console.log("\nDry run. Re-run with --commit to apply.");
    return;
  }

  // One statement per row rather than a bulk UPDATE: each row gets a different
  // value, and the volume here is thousands at most.
  for (const update of customerUpdates) {
    await prisma.customer.update({ where: { id: update.id }, data: { phone: update.phone } });
  }
  for (const update of orderUpdates) {
    await prisma.order.update({
      where: { id: update.id },
      data: { shippingPhone: update.shippingPhone },
    });
  }

  console.log(
    `\nWrote ${customerUpdates.length} customer rows and ${orderUpdates.length} order rows.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
