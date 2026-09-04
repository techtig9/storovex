import React from "react";

export const THEME_STORAGE_KEY = "storovex-theme";

/**
 * Applies the stored theme before first paint.
 *
 * This has to be a blocking inline script: if the theme were applied in an effect,
 * every visitor would see a flash of the wrong palette on load. It is deliberately
 * tiny and touches nothing but the root element's data-theme attribute.
 */
export function ThemeScript() {
  const script = `
(function(){
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var valid = stored === "light" || stored === "dark" || stored === "high-contrast";
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", valid ? stored : (prefersDark ? "dark" : "light"));
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();`.trim();

  return <script dangerouslySetInnerHTML={{__html: script}} />;
}
