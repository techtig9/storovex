
import {assertCan,assertSameStore,type Permission, type Role} from "./authorization";
import {requireStoreMembership} from "./session";
export async function authorizeStoreAction(storeId:string,permission:Permission){
 const m=await requireStoreMembership(storeId);
 assertSameStore(m.storeId,storeId); assertCan(m.role as Role,permission);
 return m;
}
