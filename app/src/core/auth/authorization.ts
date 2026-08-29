
export type Role="owner"|"admin"|"member";
export type Permission="store:read"|"store:write"|"billing:read"|"billing:write"|"members:manage"|"ai:generate"|"jobs:manage";
const matrix:Record<Role,Permission[]>={
 owner:["store:read","store:write","billing:read","billing:write","members:manage","ai:generate","jobs:manage"],
 admin:["store:read","store:write","billing:read","members:manage","ai:generate","jobs:manage"],
 member:["store:read","ai:generate"]
};
export function can(role:Role,permission:Permission){return matrix[role]?.includes(permission)??false;}
export function assertCan(role:Role,permission:Permission){if(!can(role,permission))throw new Error("FORBIDDEN");}
export function assertSameStore(resourceStoreId:string,sessionStoreId:string){
 if(!resourceStoreId||resourceStoreId!==sessionStoreId)throw new Error("RESOURCE_ACCESS_DENIED");
}
