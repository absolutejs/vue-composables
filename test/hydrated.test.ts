import { describe, expect, test } from "bun:test";
import { createRenderer, h, nextTick, type Ref } from "vue";
import { useHydrated } from "../src";

type TestNode = {
  children: TestNode[];
  parent: TestNode | null;
  text: string;
  type: string;
};

const node = (type: string, text = ""): TestNode => ({
  children: [],
  parent: null,
  text,
  type,
});

const renderer = createRenderer<TestNode, TestNode>({
  createComment: (text) => node("comment", text),
  createElement: (type) => node(type),
  createText: (text) => node("text", text),
  insert: (child, parent, anchor) => {
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(child);
    else parent.children.splice(index, 0, child);
  },
  nextSibling: (child) => {
    const siblings = child.parent?.children ?? [];
    const index = siblings.indexOf(child);

    return siblings[index + 1] ?? null;
  },
  parentNode: (child) => child.parent,
  patchProp: () => undefined,
  querySelector: () => null,
  remove: (child) => {
    if (!child.parent) return;
    const index = child.parent.children.indexOf(child);
    if (index >= 0) child.parent.children.splice(index, 1);
    child.parent = null;
  },
  setElementText: (element, text) => {
    element.text = text;
  },
  setText: (child, text) => {
    child.text = text;
  },
});

describe("useHydrated", () => {
  test("stays false through Vue's hydration tick and flips afterward", async () => {
    let hydrated: Ref<boolean> | undefined;
    const app = renderer.createApp({
      setup: () => {
        hydrated = useHydrated();

        return () => h("div", String(hydrated?.value));
      },
    });

    app.mount(node("root"));
    expect(hydrated?.value).toBeFalse();

    await nextTick();
    expect(hydrated?.value).toBeFalse();

    await Bun.sleep(1);
    expect(hydrated?.value).toBeTrue();
  });
});
