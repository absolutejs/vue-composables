/**
 * @absolutejs/vue-composables — small, broadly-useful Vue composables for
 * AbsoluteJS (SSR-first) apps. Vue is a peer dependency.
 */
import { onMounted, onScopeDispose, ref } from "vue";

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
