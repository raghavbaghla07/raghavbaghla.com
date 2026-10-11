import type { CSSProperties } from "react";

export const fontFamilies = [
  { label: "Modern sans", value: "Arial, sans-serif" },
  { label: "Editorial serif", value: "Georgia, serif" },
  { label: "Typewriter", value: "monospace" },
];
export const fontSizes = ["16px", "20px", "24px", "32px", "40px"];
export const inkColors = [
  { label: "Default", value: "" },
  { label: "Ivory", value: "#edece2" },
  { label: "Copper", value: "#d49c74" },
  { label: "Sage", value: "#b6cfa0" },
  { label: "Lavender", value: "#c9b5e7" },
  { label: "Sky", value: "#a8c7e7" },
];

// Only supported typography can reach the public renderer, including pasted content.
export function textStyle(attrs?: Record<string, unknown>): CSSProperties {
  return {
    fontFamily: fontFamilies.some((font) => font.value === attrs?.fontFamily)
      ? String(attrs?.fontFamily)
      : undefined,
    fontSize: fontSizes.includes(String(attrs?.fontSize))
      ? String(attrs?.fontSize)
      : undefined,
    color: inkColors.some((ink) => ink.value && ink.value === attrs?.color)
      ? String(attrs?.color)
      : undefined,
  };
}
export function blockStyle(attrs?: Record<string, unknown>): CSSProperties {
  const align = attrs?.textAlign;
  return {
    textAlign:
      align === "left" || align === "center" || align === "right"
        ? align
        : undefined,
  };
}
