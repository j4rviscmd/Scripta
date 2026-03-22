import { invoke } from "@tauri-apps/api/core";

/**
 * Fetches the page title for a URL via the Rust backend.
 *
 * Results are cached in-memory on the Rust side for the app session.
 *
 * @param url - The HTTP/HTTPS URL to scrape.
 * @returns The page title, or `null` if unavailable.
 */
export async function fetchLinkTitle(
  url: string,
): Promise<string | null> {
  return invoke<string | null>("fetch_link_title", { url });
}
