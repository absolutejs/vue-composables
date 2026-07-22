import { describe, expect, test } from "bun:test";
import { nextTick, ref } from "vue";
import { useCursorPagination, useOffsetPagination } from "../src";

describe("useOffsetPagination", () => {
  test("navigates, reports ranges, and clamps after totals shrink", async () => {
    const total = ref(57);
    const rowCount = ref(25);
    const pagination = useOffsetPagination({ pageSize: 25, total });
    const rangeEnd = pagination.rangeEnd(rowCount);

    pagination.setPage(2);
    rowCount.value = 7;
    expect(pagination.rangeStart.value).toBe(51);
    expect(rangeEnd.value).toBe(57);

    total.value = 12;
    await nextTick();
    expect(pagination.page.value).toBe(0);
  });
});

describe("useCursorPagination", () => {
  test("tracks opaque cursor history", () => {
    const pagination = useCursorPagination();
    pagination.setNextCursor("page-2");
    pagination.next();
    expect(pagination.cursor.value).toBe("page-2");
    expect(pagination.page.value).toBe(1);

    pagination.previous();
    expect(pagination.cursor.value).toBeNull();
    expect(pagination.canNext.value).toBe(true);
  });
});
