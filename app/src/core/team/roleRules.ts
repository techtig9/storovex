
import type {Role} from "../auth/authorization";

export function assertCanChangeRole(actingRole:Role,targetCurrentRole:Role,targetNewRole:Role){
 if(actingRole!=="owner"&&actingRole!=="admin")throw new Error("FORBIDDEN");
 if(targetNewRole==="owner")throw new Error("OWNERSHIP_TRANSFER_REQUIRES_DEDICATED_FLOW");
 if(actingRole==="admin"&&(targetCurrentRole==="owner"||targetCurrentRole==="admin"))throw new Error("ADMIN_CANNOT_MODIFY_PEER_OR_OWNER");
}

export function assertCanRemoveMember(actingRole:Role,targetRole:Role,remainingOwnerCount:number){
 if(actingRole!=="owner"&&actingRole!=="admin")throw new Error("FORBIDDEN");
 if(targetRole==="owner"&&remainingOwnerCount<=1)throw new Error("CANNOT_REMOVE_LAST_OWNER");
 if(actingRole==="admin"&&targetRole==="owner")throw new Error("ADMIN_CANNOT_REMOVE_OWNER");
}
