
export type Breakpoint="mobile"|"tablet"|"desktop"|"wide";

export const BREAKPOINTS:Record<Breakpoint,number>={mobile:0,tablet:640,desktop:1024,wide:1440};

export function breakpointForWidth(widthPx:number):Breakpoint{
 if(!Number.isFinite(widthPx)||widthPx<0)throw new Error("WIDTH_INVALID");
 if(widthPx>=BREAKPOINTS.wide)return "wide";
 if(widthPx>=BREAKPOINTS.desktop)return "desktop";
 if(widthPx>=BREAKPOINTS.tablet)return "tablet";
 return "mobile";
}

// The sidebar starts collapsed to an icon rail below desktop width, since there
// isn't room for a labeled sidebar and a comfortable content column together.
export function isSidebarCollapsedByDefault(bp:Breakpoint){
 return bp==="mobile"||bp==="tablet";
}
