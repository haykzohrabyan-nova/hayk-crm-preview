import type { Page } from "@/lib/types";

export type NavSection = {
  section: "main" | "admin" | "bottom";
  pages: Page[];
};

/** Split flat nav pages into sidebar / mobile sections (mirrors layout rules). */
export function buildNavSections(pages: Page[]): NavSection[] {
  const main = pages.filter((p) => p.section === "main");
  const admin = pages.filter((p) => p.section === "admin" && p.route === "/admin");
  const bottom = pages.filter((p) => p.section === "bottom");

  const result: NavSection[] = [];
  if (main.length) result.push({ section: "main", pages: main });
  if (admin.length) result.push({ section: "admin", pages: admin });
  if (bottom.length) result.push({ section: "bottom", pages: bottom });
  return result;
}
