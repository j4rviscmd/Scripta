/**
 * Shared custom event names used across features.
 *
 * Centralises event-name constants so that both `features/` and
 * `shared/` modules can reference them without creating cross-layer
 * import dependencies.
 */

/** Dispatched on `document` when cursor-centering triggers a scroll. */
export const CENTERING_EVENT = "scripta:centering";
