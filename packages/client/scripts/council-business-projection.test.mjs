import assert from "node:assert/strict";
import test from "node:test";
import { councilBusinessView, councilBusinessViews } from "../src/models/councilBusiness.ts";

const business = (id, reportResourceId = `report-${id}`) => ({ id, reportResourceId });
const item = (councilBusinessId, id, position, kind = "document") => ({ councilBusinessId, id, position, kind });

test("bulk projection preserves business order, stable ties, duplicate associations and exclusions", () => {
  const businesses = [business("b"), business("a"), business("empty"), business("a")];
  const items = [item("a", "late", 8), item("b", "only-b", 2), item("a", "report-a", 0),
    item("a", "folder", 1, "folder"), item("other", "outside", 1), item("a", "first", 1),
    item("a", "tied", 1), item("a", "first", 1)];
  const before = structuredClone({ businesses, items });
  const result = councilBusinessViews(businesses, items);
  assert.deepEqual(result.map(({ resources }) => resources.map(({ id }) => id)),
    [["only-b"], ["first", "tied", "first", "late"], [], ["first", "tied", "first", "late"]]);
  assert.deepEqual(result, businesses.map((entry) => councilBusinessView(entry, items)));
  assert.deepEqual({ businesses, items }, before);
  assert.notEqual(result[1].resources, result[3].resources);
});

test("empty projections retain the existing result", () => {
  assert.deepEqual(councilBusinessViews([], []), []);
  assert.deepEqual(councilBusinessViews([business("a")], []), [{ ...business("a"), resources: [] }]);
});

test("bulk projection scales association inspection linearly instead of scanning every association per business", () => {
  let reads = 0;
  const businesses = Array.from({ length: 100 }, (_, i) => business(String(i)));
  const items = businesses.flatMap(({ id }) => Array.from({ length: 10 }, (_, i) => ({
    ...item(id, `${id}-${i}`, i),
    get councilBusinessId() { reads += 1; return id; },
  })));
  const expected = businesses.map((entry) => councilBusinessView(entry, items));
  const previousReads = reads;
  reads = 0;
  assert.deepEqual(councilBusinessViews(businesses, items), expected);
  assert.ok(reads < previousReads / 10, `${reads} inspections versus ${previousReads}`);
});
