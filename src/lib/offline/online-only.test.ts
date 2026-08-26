import { onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { isOfflineUnavailable, OfflineUnavailableError, requireOnline } from "./online-only";

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("requireOnline", () => {
  it("does nothing when the device is online", () => {
    onlineManager.setOnline(true);
    expect(() => requireOnline("Applying a discount code")).not.toThrow();
  });

  it("refuses when the device is offline", () => {
    onlineManager.setOnline(false);
    expect(() => requireOnline("Applying a discount code")).toThrow(OfflineUnavailableError);
  });

  // The message reaches a cashier through a toast, so it has to say which
  // thing was refused rather than "something went wrong".
  it("names what was refused", () => {
    onlineManager.setOnline(false);
    expect(() => requireOnline("Changing tax settings")).toThrow(
      /Changing tax settings needs a connection/
    );
  });
});

describe("isOfflineUnavailable", () => {
  it("recognises the refusal", () => {
    expect(isOfflineUnavailable(new OfflineUnavailableError("Anything"))).toBe(true);
  });

  it("does not claim an ordinary failure", () => {
    expect(isOfflineUnavailable(new Error("Failed to fetch"))).toBe(false);
    expect(isOfflineUnavailable("Unauthorized")).toBe(false);
    expect(isOfflineUnavailable(undefined)).toBe(false);
  });
});
