
import {fixedWindow} from "../security/rateLimit";
import {riskScore,actionForRisk} from "../security/abuse";
describe("Phase 76 security",()=>{
 it("limits bursts",()=>{
  const s=new Map<string,{start:number,count:number}>();
  expect(fixedWindow("u",2,60,0,s).allowed).toBe(true);
  expect(fixedWindow("u",2,60,1000,s).allowed).toBe(true);
  expect(fixedWindow("u",2,60,2000,s).allowed).toBe(false);
 });
 it("calculates bounded abuse risk",()=>{expect(riskScore([{type:"burst",score:60}])).toBe(60);expect(actionForRisk(85)).toBe("block");});
});
