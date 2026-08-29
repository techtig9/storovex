
import {THEME_IDS,DEFAULT_THEME,isValidTheme,resolveTheme,themeLabel} from "../theme/themeTokens";
import {breakpointForWidth,isSidebarCollapsedByDefault} from "../ui/breakpoints";
import {motionDurationMs,ariaLiveAnnouncement,focusableId} from "../ui/accessibility";
import {missingEnvVars,assertEnvComplete,REQUIRED_ENV_VARS} from "../launch/envCheck";
import {launchReadinessPct,blockingItems,isLaunchReady,DEFAULT_LAUNCH_CHECKLIST,type ChecklistItem} from "../launch/launchChecklist";
import {computeRange,totalPages} from "../data/pagination";
import {randomToken} from "../ui/randomToken";

describe("Phase 85 theme tokens",()=>{
 it("exposes exactly 7 themes",()=>{
  expect(THEME_IDS).toHaveLength(7);
 });
 it("validates and resolves theme ids, falling back to the default",()=>{
  expect(isValidTheme("blackout")).toBe(true);
  expect(isValidTheme("nonexistent")).toBe(false);
  expect(resolveTheme("sepia")).toBe("sepia");
  expect(resolveTheme("nonexistent")).toBe(DEFAULT_THEME);
  expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
 });
 it("labels every theme",()=>{
  for(const id of THEME_IDS)expect(themeLabel(id).length).toBeGreaterThan(0);
 });
});

describe("Phase 85 breakpoints",()=>{
 it("classifies widths into the correct breakpoint",()=>{
  expect(breakpointForWidth(375)).toBe("mobile");
  expect(breakpointForWidth(640)).toBe("tablet");
  expect(breakpointForWidth(1024)).toBe("desktop");
  expect(breakpointForWidth(1440)).toBe("wide");
 });
 it("rejects invalid widths",()=>{
  expect(()=>breakpointForWidth(-1)).toThrow("WIDTH_INVALID");
 });
 it("collapses the sidebar below desktop width",()=>{
  expect(isSidebarCollapsedByDefault("mobile")).toBe(true);
  expect(isSidebarCollapsedByDefault("tablet")).toBe(true);
  expect(isSidebarCollapsedByDefault("desktop")).toBe(false);
 });
});

describe("Phase 85 accessibility",()=>{
 it("zeroes motion duration when reduced motion is requested",()=>{
  expect(motionDurationMs(300,false)).toBe(300);
  expect(motionDurationMs(300,true)).toBe(0);
 });
 it("announces every generation stage",()=>{
  expect(ariaLiveAnnouncement("generating_assets")).toBe("Generating assets.");
  expect(()=>ariaLiveAnnouncement("bogus" as any)).toThrow("STAGE_ANNOUNCEMENT_UNKNOWN");
 });
 it("sanitizes focusable ids",()=>{
  expect(focusableId("card","abc 123!")).toBe("card-abc-123-");
  expect(()=>focusableId("","x")).toThrow("FOCUSABLE_ID_INVALID");
 });
});

describe("Phase 85 env checklist",()=>{
 it("lists all required env vars as missing from an empty env",()=>{
  expect(missingEnvVars({})).toEqual([...REQUIRED_ENV_VARS]);
 });
 it("passes once every required var is set",()=>{
  const full=Object.fromEntries(REQUIRED_ENV_VARS.map(k=>[k,"x"]));
  expect(missingEnvVars(full)).toEqual([]);
  expect(assertEnvComplete(full)).toBe(true);
 });
 it("throws naming the missing vars",()=>{
  expect(()=>assertEnvComplete({})).toThrow(/ENV_VARS_MISSING/);
 });
});

describe("Phase 85 launch checklist",()=>{
 it("computes readiness percentage",()=>{
  const items:ChecklistItem[]=[{id:"a",label:"a",done:true,critical:true},{id:"b",label:"b",done:false,critical:false}];
  expect(launchReadinessPct(items)).toBe(50);
  expect(launchReadinessPct([])).toBe(0);
 });
 it("identifies blocking (critical, not done) items",()=>{
  const items:ChecklistItem[]=[{id:"a",label:"a",done:false,critical:true},{id:"b",label:"b",done:false,critical:false}];
  expect(blockingItems(items).map(i=>i.id)).toEqual(["a"]);
  expect(isLaunchReady(items)).toBe(false);
 });
 it("is ready once all critical items are done regardless of non-critical ones",()=>{
  const items:ChecklistItem[]=[{id:"a",label:"a",done:true,critical:true},{id:"b",label:"b",done:false,critical:false}];
  expect(isLaunchReady(items)).toBe(true);
 });
 it("ships a non-empty default checklist with at least one critical item",()=>{
  expect(DEFAULT_LAUNCH_CHECKLIST.length).toBeGreaterThan(0);
  expect(DEFAULT_LAUNCH_CHECKLIST.some(i=>i.critical)).toBe(true);
 });
});

describe("Phase 85 pagination",()=>{
 it("computes an inclusive offset range",()=>{
  expect(computeRange(1,20)).toEqual({from:0,to:19});
  expect(computeRange(3,20)).toEqual({from:40,to:59});
 });
 it("rejects invalid page/pageSize",()=>{
  expect(()=>computeRange(0,20)).toThrow("PAGE_INVALID");
  expect(()=>computeRange(1,0)).toThrow("PAGE_SIZE_INVALID");
  expect(()=>computeRange(1,101)).toThrow("PAGE_SIZE_INVALID");
 });
 it("computes total pages, minimum of 1",()=>{
  expect(totalPages(0,20)).toBe(1);
  expect(totalPages(41,20)).toBe(3);
 });
});

describe("Phase 85 random token",()=>{
 it("generates a hex token of the requested byte length and is non-deterministic",()=>{
  const t1=randomToken(16);
  const t2=randomToken(16);
  expect(t1).toHaveLength(32);
  expect(t1).not.toBe(t2);
 });
});
