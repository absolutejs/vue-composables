import { describe, expect, test } from "bun:test";
import { effectScope, ref } from "vue";
import { isTextSubmitKey, useAutoGrowTextarea } from "../src";

const keyboardEvent = (input: Partial<KeyboardEvent>) =>
  ({
    isComposing: false,
    key: "",
    shiftKey: false,
    ...input,
  }) as KeyboardEvent;

describe("textarea composer helpers", () => {
  test("bounds height and enables internal scrolling at the responsive cap", () => {
    const field = {
      scrollHeight: 180,
      style: { height: "", overflowY: "" },
    } as unknown as HTMLTextAreaElement;
    const maxHeight = ref(144);
    const scope = effectScope();
    const composer = scope.run(() =>
      useAutoGrowTextarea(ref(field), { maxHeight }),
    )!;

    composer.resize();
    expect(field.style.height).toBe("144px");
    expect(field.style.overflowY).toBe("auto");

    field.scrollHeight = 80;
    composer.resize();
    expect(field.style.height).toBe("80px");
    expect(field.style.overflowY).toBe("hidden");
    scope.stop();
  });

  test("submits only a plain Enter outside IME composition", () => {
    expect(isTextSubmitKey(keyboardEvent({ key: "Enter" }))).toBe(true);
    expect(
      isTextSubmitKey(keyboardEvent({ isComposing: true, key: "Enter" })),
    ).toBe(false);
    expect(
      isTextSubmitKey(keyboardEvent({ key: "Enter", shiftKey: true })),
    ).toBe(false);
  });
});
