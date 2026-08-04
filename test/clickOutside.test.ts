import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { effectScope, shallowRef } from "vue";
import { useClickOutside } from "../src";

class FakeNode {
  parent: FakeNode | null = null;

  contains(other: FakeNode | null): boolean {
    for (let current = other; current; current = current.parent) {
      if (current === this) return true;
    }

    return false;
  }
}

type Registered = { capture: boolean; listener: EventListener };

let registered: Registered[] = [];

const fakeDocument = {
  addEventListener: (
    _type: string,
    listener: EventListener,
    capture?: boolean,
  ) => {
    registered.push({ capture: capture === true, listener });
  },
  removeEventListener: (_type: string, listener: EventListener) => {
    registered = registered.filter((entry) => entry.listener !== listener);
  },
};

const press = (target: FakeNode) => {
  for (const entry of [...registered]) {
    entry.listener({ target } as unknown as Event);
  }
};

beforeEach(() => {
  globalThis.Node = FakeNode as unknown as typeof Node;
  globalThis.document = fakeDocument as unknown as Document;
});

afterEach(() => {
  registered = [];
});

describe("useClickOutside", () => {
  test("fires on presses outside the target, not inside it", () => {
    const root = new FakeNode();
    const child = new FakeNode();
    child.parent = root;
    const stranger = new FakeNode();

    // shallowRef mirrors template refs: Vue never deep-proxies DOM elements,
    // and a deep ref would proxy FakeNode and break identity in contains().
    const target = shallowRef<FakeNode | null>(root);
    let fired = 0;
    const scope = effectScope();
    scope.run(() =>
      useClickOutside(target as never, () => {
        fired += 1;
      }),
    );

    expect(registered).toEqual([
      { capture: true, listener: expect.any(Function) },
    ]);

    press(child);
    expect(fired).toBe(0);
    press(stranger);
    expect(fired).toBe(1);
    scope.stop();
  });

  test("ignores presses while the target is null and detaches on dispose", () => {
    const target = shallowRef<FakeNode | null>(null);
    let fired = 0;
    const scope = effectScope();
    scope.run(() =>
      useClickOutside(target as never, () => {
        fired += 1;
      }),
    );

    press(new FakeNode());
    expect(fired).toBe(0);

    scope.stop();
    expect(registered).toHaveLength(0);
  });
});
