import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { isFirstPage, patchFirstPages, patchLists, restoreLists } from "./optimistic";

interface Row {
  id: string;
  name: string;
}
interface Page {
  rows: Row[];
  total: number;
}

const LISTS = ["commerce", "products", "list", "space-1"];
const key = (filters: Record<string, unknown>) => [...LISTS, filters];

function seed(pages: [Record<string, unknown>, Page][]) {
  const client = new QueryClient();
  for (const [filters, page] of pages) {
    client.setQueryData(key(filters), page);
  }
  return client;
}

const page = (...rows: Row[]): Page => ({ rows, total: rows.length });
const ADE: Row = { id: "1", name: "Ade" };
const BOLA: Row = { id: "2", name: "Bola" };

describe("patchLists", () => {
  // The bug this exists for: a merchant with a search typed in was looking at
  // a different query key than the one every onMutate wrote to, so the row
  // did not move until the server answered — and offline, it never did.
  it("reaches a filtered page, not just the unfiltered one", () => {
    const client = seed([
      [{}, page(ADE)],
      [{ search: "ade" }, page(ADE)],
    ]);

    patchLists<Page>(client, LISTS, (data) => ({
      ...data,
      rows: data.rows.map((r) => (r.id === "1" ? { ...r, name: "Adebayo" } : r)),
    }));

    expect(client.getQueryData<Page>(key({ search: "ade" }))?.rows[0].name).toBe("Adebayo");
  });

  it("reaches a page beyond the first", () => {
    const client = seed([[{ page: 2 }, page(BOLA)]]);
    patchLists<Page>(client, LISTS, (data) => ({
      ...data,
      rows: data.rows.filter((r) => r.id !== "2"),
    }));
    expect(client.getQueryData<Page>(key({ page: 2 }))?.rows).toHaveLength(0);
  });

  it("leaves another space's cache alone", () => {
    const client = seed([[{}, page(ADE)]]);
    const other = ["commerce", "products", "list", "space-2", {}];
    client.setQueryData(other, page(BOLA));

    patchLists<Page>(client, LISTS, (data) => ({ ...data, rows: [] }));

    expect(client.getQueryData<Page>(other)?.rows).toHaveLength(1);
  });

  it("does not create a cache entry for a page nobody has loaded", () => {
    const client = seed([[{}, page(ADE)]]);
    patchLists<Page>(client, LISTS, (data) => ({ ...data, rows: [] }));
    expect(client.getQueryData(key({ search: "never-fetched" }))).toBeUndefined();
  });
});

describe("patchFirstPages", () => {
  it("puts a new row on page one", () => {
    const client = seed([[{}, page(ADE)]]);
    patchFirstPages<Page>(client, LISTS, (data) => ({
      rows: [BOLA, ...data.rows],
      total: data.total + 1,
    }));
    expect(client.getQueryData<Page>(key({}))?.rows[0]).toEqual(BOLA);
  });

  // Lists are newest-first, so a create belongs at the top of page one.
  // Prepending it to page three as well invents a row that is not there.
  it("leaves a later page alone", () => {
    const client = seed([[{ page: 3 }, page(ADE)]]);
    patchFirstPages<Page>(client, LISTS, (data) => ({
      rows: [BOLA, ...data.rows],
      total: data.total + 1,
    }));
    expect(client.getQueryData<Page>(key({ page: 3 }))?.rows).toEqual([ADE]);
  });

  it("treats an explicit page 1 as the first page", () => {
    const client = seed([[{ page: 1, search: "b" }, page(ADE)]]);
    patchFirstPages<Page>(client, LISTS, (data) => ({
      rows: [BOLA, ...data.rows],
      total: data.total + 1,
    }));
    expect(client.getQueryData<Page>(key({ page: 1, search: "b" }))?.rows).toHaveLength(2);
  });
});

describe("isFirstPage", () => {
  it("treats a key with no filters at all as the first page", () => {
    expect(isFirstPage(["commerce", "categories", "list", "space-1"])).toBe(true);
  });

  it("treats undefined filters as the first page", () => {
    expect(isFirstPage([...LISTS, undefined])).toBe(true);
  });
});

describe("restoreLists", () => {
  it("puts every page back, including ones the mutation changed", () => {
    const client = seed([
      [{}, page(ADE)],
      [{ search: "ade" }, page(ADE)],
    ]);

    const previous = patchLists<Page>(client, LISTS, (data) => ({
      ...data,
      rows: [],
    }));
    restoreLists(client, previous);

    expect(client.getQueryData<Page>(key({}))?.rows).toEqual([ADE]);
    expect(client.getQueryData<Page>(key({ search: "ade" }))?.rows).toEqual([ADE]);
  });

  it("is a no-op without a snapshot, so onError can call it unconditionally", () => {
    const client = seed([[{}, page(ADE)]]);
    expect(() => restoreLists(client, undefined)).not.toThrow();
    expect(client.getQueryData<Page>(key({}))?.rows).toEqual([ADE]);
  });
});
