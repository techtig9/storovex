
import {validateUpload,safeFilename,storagePath} from "../storage/uploadSecurity";
describe("Phase 80 secure uploads",()=>{
 it("accepts allowed images",()=>expect(validateUpload({size:100,mime:"image/png",name:"photo.png"}).extension).toBe("png"));
 it("rejects oversized and unsafe types",()=>{
  expect(()=>validateUpload({size:11*1024*1024,mime:"image/png",name:"x.png"})).toThrow("UPLOAD_SIZE_INVALID");
  expect(()=>validateUpload({size:100,mime:"application/x-msdownload",name:"x.exe"})).toThrow("UPLOAD_MIME_NOT_ALLOWED");
 });
 it("sanitizes filenames",()=>expect(safeFilename("../../secret file.png")).toBe("secret_file.png"));
 it("isolates storage by store/user/file",()=>expect(storagePath("11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222","33333333-3333-3333-3333-333333333333","a.png")).toContain("11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333"));
});
