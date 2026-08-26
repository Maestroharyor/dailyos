import { describe, expect, it } from "vitest";
import { type OrderableRecord, orderOutbox, producesLocalId } from "./outbox-order";

function record(over: Partial<OrderableRecord> & { id: string; seq: number }): OrderableRecord {
  return { status: "pending", payload: {}, ...over };
}

const NONE = new Set<string>();

describe("orderOutbox", () => {
  it("dispatches in the order the cashier did things", () => {
    const out = orderOutbox(
      [record({ id: "c", seq: 3 }), record({ id: "a", seq: 1 }), record({ id: "b", seq: 2 })],
      NONE
    );
    expect(out.ready.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  // The case the whole module exists for: create a customer offline, ring a
  // sale against it, and the sale must not go out first.
  it("puts a create before the write that depends on it, in one pass", () => {
    const customer = record({ id: "cust", seq: 1, localId: "local-1" });
    const order = record({ id: "order", seq: 2, payload: { customerId: "local-1" } });

    const out = orderOutbox([order, customer], NONE);
    expect(out.ready.map((r) => r.id)).toEqual(["cust", "order"]);
    expect(out.blocked).toEqual([]);
  });

  it("treats a dependency resolved in an earlier drain as available", () => {
    const order = record({ id: "order", seq: 2, payload: { customerId: "local-1" } });
    const out = orderOutbox([order], new Set(["local-1"]));
    expect(out.ready.map((r) => r.id)).toEqual(["order"]);
  });

  it("blocks a record whose producer has not been dispatched yet", () => {
    // The producer is queued but sits *after* the dependent by seq, which is
    // the out-of-order case seq alone would get wrong.
    const order = record({ id: "order", seq: 1, payload: { customerId: "local-1" } });
    const customer = record({ id: "cust", seq: 2, localId: "local-1" });

    const out = orderOutbox([order, customer], NONE);
    expect(out.ready.map((r) => r.id)).toEqual(["cust"]);
    expect(out.blocked.map((r) => r.id)).toEqual(["order"]);
  });

  // The customer create was refused. The order pointing at it cannot succeed,
  // and dispatching it would turn one problem into two.
  it("holds back a record whose dependency was poisoned", () => {
    const customer = record({ id: "cust", seq: 1, localId: "local-1", status: "poison" });
    const order = record({ id: "order", seq: 2, payload: { customerId: "local-1" } });

    const out = orderOutbox([customer, order], NONE);
    // The poisoned create is not a dispatch candidate at all, and the order
    // behind it is stuck rather than merely waiting.
    expect(out.ready).toEqual([]);
    expect(out.blocked).toEqual([]);
    expect(out.deadlocked.map((r) => r.id)).toEqual(["order"]);
  });

  it("holds back a record whose dependency is not in the queue at all", () => {
    const order = record({ id: "order", seq: 1, payload: { customerId: "local-gone" } });
    const out = orderOutbox([order], NONE);
    expect(out.deadlocked.map((r) => r.id)).toEqual(["order"]);
  });

  it("resolves a chain of dependencies in one pass", () => {
    const a = record({ id: "a", seq: 1, localId: "local-a" });
    const b = record({ id: "b", seq: 2, localId: "local-b", payload: { x: "local-a" } });
    const c = record({ id: "c", seq: 3, payload: { y: "local-b" } });

    const out = orderOutbox([c, b, a], NONE);
    expect(out.ready.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("finds dependencies nested in arrays", () => {
    const product = record({ id: "p", seq: 1, localId: "local-p" });
    const order = record({
      id: "o",
      seq: 2,
      payload: { items: [{ productId: "local-p", quantity: 1 }] },
    });
    const out = orderOutbox([order, product], NONE);
    expect(out.ready.map((r) => r.id)).toEqual(["p", "o"]);
  });

  // A cycle cannot be produced by the UI, but a corrupted store could hold
  // one, and a drain loop that hangs on it would stop every sale behind it.
  it("cannot hang on a cycle — it reports both sides as waiting", () => {
    const a = record({ id: "a", seq: 1, localId: "local-a", payload: { x: "local-b" } });
    const b = record({ id: "b", seq: 2, localId: "local-b", payload: { x: "local-a" } });

    const out = orderOutbox([a, b], NONE);
    expect(out.ready).toEqual([]);
    expect(out.blocked.length + out.deadlocked.length).toBe(2);
  });

  it("handles an empty queue", () => {
    expect(orderOutbox([], NONE)).toEqual({ ready: [], blocked: [], deadlocked: [] });
  });

  it("does not mutate the input array", () => {
    const records = [record({ id: "b", seq: 2 }), record({ id: "a", seq: 1 })];
    orderOutbox(records, NONE);
    expect(records.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("ignores a record that has already gone out", () => {
    const done = record({ id: "done", seq: 1, status: "done", localId: "local-1" });
    const order = record({ id: "order", seq: 2, payload: { customerId: "local-1" } });
    const out = orderOutbox([done, order], new Set(["local-1"]));
    expect(out.ready.map((r) => r.id)).toEqual(["order"]);
  });
});

describe("producesLocalId", () => {
  it("guards against a localId that is not one", () => {
    expect(
      producesLocalId({ id: "x", seq: 1, status: "pending", payload: {}, localId: "local-1" })
    ).toBe(true);
    expect(
      producesLocalId({ id: "x", seq: 1, status: "pending", payload: {}, localId: "cus_real" })
    ).toBe(false);
    expect(producesLocalId({ id: "x", seq: 1, status: "pending", payload: {} })).toBe(false);
  });
});

describe("deadlocked records", () => {
  // A dependent left "pending" behind a refused create sits on the sync screen
  // saying "waiting" forever: nothing happens and nobody is told. It has to be
  // separable from the ones that are genuinely still waiting.
  it("separates permanently stuck from merely waiting", () => {
    const refused = record({ id: "cust", seq: 1, localId: "local-1", status: "poison" });
    const stuck = record({ id: "stuck", seq: 2, payload: { customerId: "local-1" } });
    const waiting = record({ id: "waiting", seq: 4, payload: { customerId: "local-2" } });
    const producer = record({ id: "producer", seq: 5, localId: "local-2" });

    const out = orderOutbox([refused, stuck, waiting, producer], NONE);
    expect(out.deadlocked.map((r) => r.id)).toEqual(["stuck"]);
    // `waiting` sits behind a producer queued after it, so it goes out on the
    // next pass rather than this one — genuinely waiting, not stuck.
    expect(out.blocked.map((r) => r.id)).toEqual(["waiting"]);
    expect(out.ready.map((r) => r.id)).toEqual(["producer"]);
  });

  it("treats a dependency that was discarded outright as stuck, not waiting", () => {
    // Discarding removes the record entirely, so the producer is simply absent.
    const orphan = record({ id: "orphan", seq: 1, payload: { customerId: "local-gone" } });
    const out = orderOutbox([orphan], NONE);
    expect(out.deadlocked.map((r) => r.id)).toEqual(["orphan"]);
    expect(out.blocked).toEqual([]);
  });
});
