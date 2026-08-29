
import {requiresSignedUrl,assertValidTtl,buildAssetPath,assertPublishAllowed,MAX_SIGNED_URL_TTL_SECONDS} from "../storage/signedUrl";
import {estimateCredits,assertValidAspectRatio} from "../generation/catalog";
import {nextStage,canTransition,shouldDeadLetter,validateGenerationOutput,MAX_GENERATION_ATTEMPTS} from "../generation/stageMachine";
import {assertRegenerationAllowed,nextVersion,affectedSections} from "../generation/regeneration";

describe("Phase 82 signed URLs",()=>{
 it("requires signing for private buckets only",()=>{
  expect(requiresSignedUrl("generated-assets")).toBe(true);
  expect(requiresSignedUrl("public-store-assets")).toBe(false);
 });
 it("rejects unknown buckets",()=>{
  expect(()=>requiresSignedUrl("not-a-bucket" as any)).toThrow("BUCKET_UNKNOWN");
 });
 it("bounds TTL to the configured maximum",()=>{
  expect(()=>assertValidTtl(0)).toThrow("SIGNED_URL_TTL_INVALID");
  expect(()=>assertValidTtl(MAX_SIGNED_URL_TTL_SECONDS+1)).toThrow("SIGNED_URL_TTL_INVALID");
  expect(()=>assertValidTtl(MAX_SIGNED_URL_TTL_SECONDS)).not.toThrow();
 });
 it("builds tenant-isolated, filename-sanitized asset paths",()=>{
  const p=buildAssetPath("generated-assets","11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222","33333333-3333-3333-3333-333333333333","../hero image.png");
  expect(p).toBe("generated-assets/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/hero_image.png");
 });
 it("only allows publishing from generated or project asset buckets",()=>{
  expect(()=>assertPublishAllowed("project-assets","public-store-assets")).not.toThrow();
  expect(()=>assertPublishAllowed("uploads","public-store-assets")).toThrow("PUBLISH_SOURCE_BUCKET_NOT_ALLOWED");
 });
});

describe("Phase 82 generation catalog",()=>{
 it("estimates credits scaling with quality and count",()=>{
  expect(estimateCredits("product_hero","standard",1)).toBe(8);
  expect(estimateCredits("product_hero","high",1)).toBe(14);
  expect(estimateCredits("product_hero","draft",1)).toBe(5);
  expect(estimateCredits("banner","standard",3)).toBe(18);
 });
 it("rejects invalid type/quality/count",()=>{
  expect(()=>estimateCredits("bogus" as any,"standard",1)).toThrow("GENERATION_TYPE_INVALID");
  expect(()=>estimateCredits("banner","bogus" as any,1)).toThrow("GENERATION_QUALITY_INVALID");
  expect(()=>estimateCredits("banner","standard",0)).toThrow("GENERATION_COUNT_INVALID");
  expect(()=>estimateCredits("banner","standard",21)).toThrow("GENERATION_COUNT_INVALID");
 });
 it("validates aspect ratios",()=>{
  expect(()=>assertValidAspectRatio("16:9")).not.toThrow();
  expect(()=>assertValidAspectRatio("2:1")).toThrow("ASPECT_RATIO_INVALID");
 });
});

describe("Phase 82 generation stage machine",()=>{
 it("advances stages in order",()=>{
  expect(nextStage("planning")).toBe("building");
  expect(nextStage("building")).toBe("generating_assets");
  expect(nextStage("generating_assets")).toBe("finalizing");
  expect(nextStage("finalizing")).toBe("completed");
 });
 it("rejects advancing past a terminal state",()=>{
  expect(()=>nextStage("completed")).toThrow("GENERATION_TERMINAL_STATE");
  expect(()=>nextStage("failed")).toThrow("GENERATION_TERMINAL_STATE");
 });
 it("allows failing from any non-terminal stage but not skipping stages",()=>{
  expect(canTransition("building","failed")).toBe(true);
  expect(canTransition("planning","finalizing")).toBe(false);
  expect(canTransition("completed","failed")).toBe(false);
 });
 it("dead-letters only after the max attempt threshold",()=>{
  expect(shouldDeadLetter(MAX_GENERATION_ATTEMPTS-1)).toBe(false);
  expect(shouldDeadLetter(MAX_GENERATION_ATTEMPTS)).toBe(true);
 });
 it("validates provider output before it can be stored",()=>{
  expect(validateGenerationOutput({assetUrls:["a.png"]})).toEqual(["a.png"]);
  expect(()=>validateGenerationOutput({assetUrls:[]})).toThrow("GENERATION_OUTPUT_EMPTY");
  expect(()=>validateGenerationOutput({error:"provider down"})).toThrow("GENERATION_PROVIDER_ERROR: provider down");
 });
});

describe("Phase 82 section regeneration & versioning",()=>{
 it("requires a base version for section-only regeneration but not for full",()=>{
  expect(()=>assertRegenerationAllowed("hero",undefined)).toThrow("REGENERATION_REQUIRES_BASE_VERSION");
  expect(assertRegenerationAllowed("hero",2)).toBe(true);
  expect(assertRegenerationAllowed("full",undefined)).toBe(true);
 });
 it("increments version deterministically",()=>{
  expect(nextVersion(undefined)).toBe(1);
  expect(nextVersion(3)).toBe(4);
 });
 it("scopes affected sections to the regeneration target",()=>{
  expect(affectedSections("hero")).toEqual(["hero"]);
  expect(affectedSections("full")).toEqual(["hero","product_grid","collections","footer"]);
 });
});
