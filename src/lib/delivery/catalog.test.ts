import { describe, expect, it } from "vitest";
import { type DeliveryCatalogOption, sortDeliveryOptions } from "./catalog";

const option = (over: Partial<DeliveryCatalogOption>): DeliveryCatalogOption => ({
  id: "o1",
  state: "Lagos",
  label: "An area",
  fee: 4000,
  deposit: 0,
  deliveryType: "door_to_door",
  pickupAddress: null,
  noteKey: null,
  isPinned: false,
  ...over,
});

describe("sortDeliveryOptions", () => {
  it("puts a pinned option first even when it is not cheapest", () => {
    const sorted = sortDeliveryOptions([
      option({ id: "cheap", fee: 3000, label: "Cheap" }),
      option({ id: "pinned", fee: 7000, label: "Pinned", isPinned: true }),
    ]);
    expect(sorted.map((o) => o.id)).toEqual(["pinned", "cheap"]);
  });

  it("orders by cost ascending", () => {
    const sorted = sortDeliveryOptions([
      option({ id: "c", fee: 7000 }),
      option({ id: "a", fee: 3000 }),
      option({ id: "b", fee: 4500 }),
    ]);
    expect(sorted.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  /**
   * Lagos has six options at one price. Without a stable last key they reorder
   * between page loads, which reads as a broken page rather than a tie.
   */
  it("breaks a price tie alphabetically and stably", () => {
    const tied = [
      option({ id: "3", fee: 4000, label: "Ojota, Magodo, Ketu" }),
      option({ id: "1", fee: 4000, label: "Ajao Estate" }),
      option({ id: "2", fee: 4000, label: "Anthony, Ilupeju" }),
    ];
    expect(sortDeliveryOptions(tied).map((o) => o.id)).toEqual(["1", "2", "3"]);
    expect(sortDeliveryOptions([...tied].reverse()).map((o) => o.id)).toEqual(["1", "2", "3"]);
  });

  /**
   * There is no store-pickup special case, because it does not need one: a free
   * or 1,000 pickup already sorts above carriage that starts at 3,000.
   */
  it("floats store pickup to the top on price alone", () => {
    const sorted = sortDeliveryOptions([
      option({ id: "d2d", fee: 3000, label: "Iyana Ipaja" }),
      option({
        id: "pickup",
        fee: 0,
        deposit: 1000,
        label: "Store pickup",
        deliveryType: "store_pickup",
      }),
    ]);
    expect(sorted[0].id).toBe("pickup");
  });

  it("ranks a pickup deposit as cost, so it does not outrank a cheaper delivery", () => {
    const sorted = sortDeliveryOptions([
      option({ id: "free-d2d", fee: 0, label: "Waived area" }),
      option({
        id: "pickup",
        fee: 0,
        deposit: 1000,
        label: "Store pickup",
        deliveryType: "store_pickup",
      }),
    ]);
    expect(sorted.map((o) => o.id)).toEqual(["free-d2d", "pickup"]);
  });

  it("does not mutate its argument", () => {
    const input = [option({ id: "b", fee: 5000 }), option({ id: "a", fee: 1000 })];
    sortDeliveryOptions(input);
    expect(input.map((o) => o.id)).toEqual(["b", "a"]);
  });
});
