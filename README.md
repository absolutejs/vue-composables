# @absolutejs/vue-composables

A few small, broadly-useful Vue composables for AbsoluteJS (SSR-first) apps.
Vue is a peer dependency.

## Installation

```sh
bun add @absolutejs/vue-composables vue
```

## Composables

- **`useHydrated()`** — a ref that's `false` during SSR + the first client
  render, then `true` after mount. Gate client-only data on it to avoid
  hydration mismatches: `loading = !hydrated.value || actualLoading.value`.
- **`isBrowser`** — `true` on the client, `false` during SSR.
- **`useDebouncedAction(fn, delayMs?)`** — trailing-edge debouncer auto-cleared
  on scope dispose; `.trigger()` (re)starts the delay.
- **`useResizeObserver(target, callback, options?)`** — SSR-safe element
  observer that coalesces notifications to the next animation frame and
  automatically cleans up when the target or Vue scope changes.
- **`useAutoGrowTextarea(target, { maxHeight })`** — keeps chat composers
  content-sized until a reactive maximum, then switches to internal scrolling.
- **`isTextSubmitKey(event)`** — recognizes plain Enter while excluding
  Shift+Enter and IME composition confirmation.
- **`runAsyncAction(task, options)`** — the try/catch/finally + notify +
  console.error + loading-flag wrapper. Inject your toast once with
  `configureAsyncNotifier({ success, error })`.
- **`useOffsetPagination(options)`** — zero-based page, offset, range, and
  navigation state that automatically clamps when a filtered total shrinks.
- **`useCursorPagination()`** — opaque cursor history for stable keyset APIs.

## Async actions

```ts
import {
	configureAsyncNotifier,
	runAsyncAction,
	useHydrated
} from '@absolutejs/vue-composables';

configureAsyncNotifier({ success: toast.success, error: toast.error });

await runAsyncAction(() => api.save(payload), {
	successMessage: 'Saved',
	loading: (s) => (saving.value = s),
	onSuccess: () => emit('updated')
});
```

## Resize observation

```ts
const panel = useTemplateRef<HTMLElement>('panel');

useResizeObserver(panel, ([entry]) => {
	if (entry) compact.value = entry.contentRect.width < 640;
});
```

## Pagination

```ts
const total = computed(() => query.data.value?.total ?? 0);
const pagination = useOffsetPagination({ pageSize: 25, total });

await listRows({
	limit: pagination.pageSize.value,
	offset: pagination.offset.value
});
```

Apache-2.0
