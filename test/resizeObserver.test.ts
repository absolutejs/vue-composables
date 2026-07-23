import { afterEach, describe, expect, test } from "bun:test";
import { effectScope, nextTick, ref } from "vue";
import { useResizeObserver } from "../src";

type ObserverCallback = (entries: ResizeObserverEntry[]) => void;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  disconnected = false;
  observed: Array<{ element: Element; options?: ResizeObserverOptions }> = [];

  constructor(private readonly callback: ObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  disconnect() {
    this.disconnected = true;
  }

  observe(element: Element, options?: ResizeObserverOptions) {
    this.observed.push({ element, options });
  }

  emit(entries: ResizeObserverEntry[]) {
    this.callback(entries);
  }
}

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

const runFrames = () => {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(0);
};

afterEach(() => {
  FakeResizeObserver.instances = [];
  frames = new Map();
  nextFrame = 1;
});

describe("useResizeObserver", () => {
  test("coalesces delivery to an animation frame", () => {
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    globalThis.requestAnimationFrame = (callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      frames.delete(id);
    };

    const target = ref<Element | null>({} as Element);
    const deliveries: ResizeObserverEntry[][] = [];
    const scope = effectScope();
    scope.run(() => useResizeObserver(target, (entries) => deliveries.push(entries)));

    const observer = FakeResizeObserver.instances[0]!;
    const first = [{} as ResizeObserverEntry];
    const latest = [{ contentRect: { width: 640 } } as ResizeObserverEntry];
    observer.emit(first);
    observer.emit(latest);
    expect(deliveries).toHaveLength(0);

    runFrames();
    expect(deliveries).toEqual([latest]);
    scope.stop();
  });

  test("disconnects and cancels queued delivery when the target changes", async () => {
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    globalThis.requestAnimationFrame = (callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      frames.delete(id);
    };

    const firstTarget = {} as Element;
    const target = ref<Element | null>(firstTarget);
    let deliveries = 0;
    const scope = effectScope();
    scope.run(() => useResizeObserver(target, () => deliveries++));

    const firstObserver = FakeResizeObserver.instances[0]!;
    firstObserver.emit([{} as ResizeObserverEntry]);
    target.value = {} as Element;
    await nextTick();

    expect(firstObserver.disconnected).toBe(true);
    expect(FakeResizeObserver.instances).toHaveLength(2);
    runFrames();
    expect(deliveries).toBe(0);

    scope.stop();
    expect(FakeResizeObserver.instances[1]!.disconnected).toBe(true);
  });
});
