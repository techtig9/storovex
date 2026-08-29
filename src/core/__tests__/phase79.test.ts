
import {promptSchema,safeFilenameSchema} from "../security/validation";
import {sanitizeFilename} from "../security/sanitize";
import {validateHttpUrl} from "../security/url";
describe("Phase 79 validation",()=>{
 it("rejects oversized prompts",()=>expect(promptSchema.safeParse({prompt:"x".repeat(100001)}).success).toBe(false));
 it("rejects unknown request fields",()=>expect(promptSchema.safeParse({prompt:"ok",secret:"x"}).success).toBe(false));
 it("sanitizes filenames",()=>expect(sanitizeFilename("../x.png")).toBe(".._x.png"));
 it("rejects URL credentials",()=>expect(()=>validateHttpUrl("https://user:pass@example.com")).toThrow());
 it("validates safe filenames",()=>expect(safeFilenameSchema.safeParse("photo.webp").success).toBe(true));
});
