
import {can,assertCan,assertSameStore} from "../auth/authorization";
describe("Phase 77 authorization",()=>{
 it("enforces role permissions",()=>{
  expect(can("owner","billing:write")).toBe(true);
  expect(can("member","billing:write")).toBe(false);
  expect(can("member","ai:generate")).toBe(true);
  expect(()=>assertCan("member","members:manage")).toThrow("FORBIDDEN");
 });
 it("blocks cross-store access",()=>{
  expect(()=>assertSameStore("store-a","store-b")).toThrow("RESOURCE_ACCESS_DENIED");
  expect(assertSameStore("store-a","store-a")).toBeUndefined();
 });
});
