import {tierLimits} from "../scheduling/limits";
import {fairSort,canStart} from "../scheduling/scheduler";
describe("Phase 75",()=>{
 it("applies plan concurrency limits",()=>{expect(tierLimits("free").perUser).toBe(1);expect(tierLimits("pro").perUser).toBe(20);});
 it("prioritizes high priority and then FIFO",()=>{const a:any={priority:"highest",createdAt:2},b:any={priority:"standard",createdAt:1};expect(fairSort(a,b)).toBeLessThan(0);});
 it("prevents capacity overflow",()=>{expect(canStart(1,1)).toBe(false);expect(canStart(0,1)).toBe(true);});
});
