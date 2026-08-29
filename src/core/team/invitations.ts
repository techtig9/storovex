
import type {Role} from "../auth/authorization";
import {randomToken} from "../ui/randomToken";

export const INVITE_EXPIRY_MS=1000*60*60*24*7;

export function assertCanInvite(inviterRole:Role){
 if(inviterRole!=="owner"&&inviterRole!=="admin")throw new Error("FORBIDDEN");
}

export function assertInviteableRole(inviterRole:Role,targetRole:Role){
 if(targetRole==="owner")throw new Error("CANNOT_INVITE_AS_OWNER");
 if(inviterRole==="admin"&&targetRole==="admin")throw new Error("ADMIN_CANNOT_INVITE_ADMIN");
}

export function isInviteExpired(createdAtMs:number,now:number){
 return now-createdAtMs>INVITE_EXPIRY_MS;
}

export function generateInviteToken(){
 return randomToken(32);
}
