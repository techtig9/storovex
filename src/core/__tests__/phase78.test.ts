
import {redact} from "../security/redaction";
describe("Phase 78 API security",()=>{
 it("redacts sensitive fields",()=>{
  expect(redact({apiKey:"secret",nested:{password:"x"},ok:"yes"})).toEqual({apiKey:"[REDACTED]",nested:{password:"[REDACTED]"},ok:"yes"});
 });
});
