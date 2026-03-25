/**
 * A single entry in the Google Fonts catalog.
 *
 * @property family - The font family name (e.g. "Noto Sans JP").
 * @property category - The font category (e.g. "Sans Serif", "Serif", "Display").
 * @property variants - Available weight/style variants (e.g. ["400", "700", "400i"]).
 */
export type GoogleFontEntry = {
  family: string;
  category: string;
  variants: string[];
};
