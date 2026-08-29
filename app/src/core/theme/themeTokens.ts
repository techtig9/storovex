
export type ThemeId="daylight"|"blackout"|"contact-sheet"|"darkroom-red"|"slate"|"high-contrast"|"sepia";

export const THEME_IDS:ThemeId[]=["daylight","blackout","contact-sheet","darkroom-red","slate","high-contrast","sepia"];

export const THEME_LABELS:Record<ThemeId,string>={
 daylight:"Daylight Studio",
 blackout:"Blackout",
 "contact-sheet":"Contact Sheet",
 "darkroom-red":"Darkroom Safelight",
 slate:"Slate",
 "high-contrast":"High Contrast",
 sepia:"Sepia Print",
};

export const DEFAULT_THEME:ThemeId="daylight";

export function isValidTheme(id:string):id is ThemeId{
 return (THEME_IDS as string[]).includes(id);
}

export function resolveTheme(preferred:string|undefined|null):ThemeId{
 if(preferred&&isValidTheme(preferred))return preferred;
 return DEFAULT_THEME;
}

export function themeLabel(id:ThemeId){
 const label=THEME_LABELS[id];
 if(!label)throw new Error("THEME_ID_INVALID");
 return label;
}
