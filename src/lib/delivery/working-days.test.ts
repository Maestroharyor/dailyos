import { describe, expect, it } from "vitest";
import { addWorkingDays, isWeekend } from "./working-days";

// 2026-08-31 is a Monday, which anchors every case below.
const monday = () => new Date("2026-08-31T09:00:00.000Z");

describe("isWeekend", () => {
  it("is true on Saturday and Sunday only", () => {
    expect(isWeekend(new Date("2026-09-05T12:00:00.000Z"))).toBe(true);
    expect(isWeekend(new Date("2026-09-06T12:00:00.000Z"))).toBe(true);
    expect(isWeekend(new Date("2026-09-04T12:00:00.000Z"))).toBe(false);
    expect(isWeekend(new Date("2026-09-07T12:00:00.000Z"))).toBe(false);
  });
});

describe("addWorkingDays", () => {
  it("counts from the day after, so one day on Monday is Tuesday", () => {
    expect(addWorkingDays(monday(), 1).toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("skips the weekend", () => {
    // Mon + 5 working days is the following Monday, not the Saturday.
    expect(addWorkingDays(monday(), 5).toISOString().slice(0, 10)).toBe("2026-09-07");
  });

  it("rolls a Friday deadline into the next week", () => {
    const friday = new Date("2026-09-04T09:00:00.000Z");
    expect(addWorkingDays(friday, 1).toISOString().slice(0, 10)).toBe("2026-09-07");
  });

  /** The two windows actually configured for VKT. */
  it("computes the 7 and 16 working day windows", () => {
    expect(addWorkingDays(monday(), 7).toISOString().slice(0, 10)).toBe("2026-09-09");
    expect(addWorkingDays(monday(), 16).toISOString().slice(0, 10)).toBe("2026-09-22");
  });

  it("keeps the time of day, so a deadline is a moment not a date", () => {
    expect(addWorkingDays(monday(), 3).toISOString().slice(11)).toBe("09:00:00.000Z");
  });

  it("returns the input unchanged for zero or negative days", () => {
    const start = monday();
    expect(addWorkingDays(start, 0).getTime()).toBe(start.getTime());
    expect(addWorkingDays(start, -5).getTime()).toBe(start.getTime());
  });

  it("does not mutate its argument", () => {
    const start = monday();
    const before = start.getTime();
    addWorkingDays(start, 10);
    expect(start.getTime()).toBe(before);
  });
});
