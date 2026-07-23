/**
 * @absolutejs/vue-composables — small, broadly-useful Vue composables for
 * AbsoluteJS (SSR-first) apps. Vue is a peer dependency.
 */
import {
  computed,
  onMounted,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";

/** True on the client, false during SSR — `if (!isBrowser) return;`. */
export const isBrowser = typeof window !== "undefined";

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * A ref that is `false` during SSR and the first client render (the hydration
 * pass), then flips to `true` after `onMounted`. Gate client-only-data
 * rendering on this so the SSR HTML matches the first client paint exactly.
 *
 * Content from client-only sources (a data fetcher that doesn't run on the
 * server, `localStorage`, `window`) otherwise renders one thing on the server
 * and another on first client paint — a hydration mismatch. Typical use:
 * `loading = !hydrated.value || actualLoading.value`.
 */
export const useHydrated = () => {
  const hydrated = ref(false);
  onMounted(() => {
    hydrated.value = true;
  });

  return hydrated;
};

/**
 * A trailing-edge debouncer scoped to the current component — the timer is
 * cleared automatically on scope dispose. `trigger()` (re)starts the delay.
 */
export const useDebouncedAction = (
  action: () => void | Promise<void>,
  delayMs = DEFAULT_DEBOUNCE_MS,
) => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  onScopeDispose(cancel);

  return {
    cancel,
    trigger() {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        void action();
      }, delayMs);
    },
  };
};

// --- ResizeObserver --------------------------------------------------------

export type UseResizeObserverOptions = ResizeObserverOptions;

/**
 * Observe an element without running reactive DOM writes inside the browser's
 * ResizeObserver delivery cycle. Notifications are coalesced to the next
 * animation frame, and the observer/frame are cleaned up when the target
 * changes or the current Vue scope is disposed.
 */
export const useResizeObserver = (
  target: MaybeRefOrGetter<Element | null | undefined>,
  callback: ResizeObserverCallback,
  options: UseResizeObserverOptions = {},
) => {
  let observer: ResizeObserver | null = null;
  let frame: number | null = null;
  let latestEntries: ResizeObserverEntry[] = [];

  const cancelFrame = () => {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    frame = null;
    latestEntries = [];
  };
  const stop = () => {
    observer?.disconnect();
    observer = null;
    cancelFrame();
  };

  watch(
    () => toValue(target),
    (element) => {
      stop();
      if (typeof ResizeObserver === "undefined" || element == null) return;

      observer = new ResizeObserver((entries) => {
        latestEntries = entries;
        if (frame !== null) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          const deliveredEntries = latestEntries;
          latestEntries = [];
          if (observer !== null) callback(deliveredEntries, observer);
        });
      });
      observer.observe(element, options);
    },
    { immediate: true },
  );

  onScopeDispose(stop);

  return { stop };
};

// --- runAsyncAction ---------------------------------------------------------

/** Where success/error messages go — inject your toast/snackbar once. */
export type AsyncNotifier = {
  success: (message: string) => void;
  error: (message: string) => void;
};

let notifier: AsyncNotifier = { error: () => {}, success: () => {} };

/** Wire your toast/snackbar so `runAsyncAction`'s messages surface. Call once
 *  at app startup. Without it, messages are silently dropped (no-op notifier). */
export const configureAsyncNotifier = (next: AsyncNotifier) => {
  notifier = next;
};

export type AsyncActionOptions<T> = {
  /** Toggle a loading flag — called `true` before, `false` in `finally`. */
  loading?: (state: boolean) => void;
  /** Success message (or derive it from the result). */
  successMessage?: string | ((result: T) => string);
  /** Error message. Default "Operation failed". */
  errorMessage?: string;
  /** Called on success, after the success notification. */
  onSuccess?: (result: T) => void | Promise<void>;
  /** Called on error. Return `true` to suppress the default notify + log. */
  onError?: (error: unknown) => boolean | void;
};

const showSuccess = <T>(
  successMessage: AsyncActionOptions<T>["successMessage"],
  result: T,
) => {
  if (successMessage === undefined) return;
  notifier.success(
    typeof successMessage === "function"
      ? successMessage(result)
      : successMessage,
  );
};

const handleError = <T>(options: AsyncActionOptions<T>, error: unknown) => {
  if (options.onError?.(error) === true) return;
  const message = options.errorMessage ?? "Operation failed";
  console.error(`${message}:`, error);
  notifier.error(message);
};

/**
 * Wrap the try/catch/finally + notify + console.error + loading-flag dance.
 * Returns the resolved value on success, `undefined` on a caught error.
 */
export const runAsyncAction = async <T>(
  task: () => Promise<T>,
  options: AsyncActionOptions<T> = {},
) => {
  options.loading?.(true);
  try {
    const result = await task();
    showSuccess(options.successMessage, result);
    await options.onSuccess?.(result);

    return result;
  } catch (error) {
    handleError(options, error);

    return undefined;
  } finally {
    options.loading?.(false);
  }
};

// --- Pagination ------------------------------------------------------------

const positiveInteger = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

export type OffsetPaginationOptions = {
  total: MaybeRefOrGetter<number>;
  pageSize?: MaybeRefOrGetter<number>;
  initialPage?: number;
};

/** Headless, zero-based offset pagination state with automatic last-page clamp. */
export const useOffsetPagination = (options: OffsetPaginationOptions) => {
  const page = ref(Math.max(0, Math.floor(options.initialPage ?? 0)));
  const pageSize = computed(() =>
    positiveInteger(toValue(options.pageSize ?? 25), 25),
  );
  const total = computed(() => Math.max(0, toValue(options.total)));
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(total.value / pageSize.value)),
  );
  const offset = computed(() => page.value * pageSize.value);
  const canPrevious = computed(() => page.value > 0);
  const canNext = computed(() => page.value + 1 < pageCount.value);
  const rangeStart = computed(() =>
    total.value === 0 ? 0 : offset.value + 1,
  );
  const rangeEnd = (rowCount: MaybeRefOrGetter<number>) =>
    computed(() =>
      Math.min(offset.value + Math.max(0, toValue(rowCount)), total.value),
    );
  const setPage = (next: number) => {
    page.value = Math.max(
      0,
      Math.min(Math.floor(next), pageCount.value - 1),
    );
  };
  const reset = () => setPage(0);
  const next = () => {
    if (canNext.value) page.value += 1;
  };
  const previous = () => {
    if (canPrevious.value) page.value -= 1;
  };

  watch([total, pageSize], () => setPage(page.value));

  return {
    canNext,
    canPrevious,
    next,
    offset,
    page,
    pageCount,
    pageSize,
    previous,
    rangeEnd,
    rangeStart,
    reset,
    setPage,
    total,
  };
};

/** Cursor history for APIs that return an opaque `nextCursor`. */
export const useCursorPagination = () => {
  const cursorStack = ref<Array<string | null>>([null]);
  const page = ref(0);
  const nextCursor = ref<string | null>(null);
  const cursor = computed(() => cursorStack.value[page.value] ?? null);
  const canPrevious = computed(() => page.value > 0);
  const canNext = computed(() => nextCursor.value !== null);
  const setNextCursor = (next: string | null) => {
    nextCursor.value = next;
  };
  const next = () => {
    if (nextCursor.value === null) return;
    cursorStack.value = [
      ...cursorStack.value.slice(0, page.value + 1),
      nextCursor.value,
    ];
    page.value += 1;
    nextCursor.value = null;
  };
  const previous = () => {
    if (page.value === 0) return;
    page.value -= 1;
    nextCursor.value = cursorStack.value[page.value + 1] ?? null;
  };
  const reset = () => {
    cursorStack.value = [null];
    page.value = 0;
    nextCursor.value = null;
  };

  return {
    canNext,
    canPrevious,
    cursor,
    next,
    nextCursor,
    page,
    previous,
    reset,
    setNextCursor,
  };
};
