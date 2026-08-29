
export type StoreSection="hero"|"product_grid"|"collections"|"footer"|"full";

export function assertRegenerationAllowed(scope:StoreSection,previousVersion:number|undefined){
 if(scope!=="full"&&(previousVersion===undefined||previousVersion<1))
  throw new Error("REGENERATION_REQUIRES_BASE_VERSION");
 return true;
}

export function nextVersion(previousVersion:number|undefined){
 if(previousVersion===undefined)return 1;
 if(!Number.isInteger(previousVersion)||previousVersion<1)throw new Error("VERSION_INVALID");
 return previousVersion+1;
}

// Regenerating a single section must never overwrite sibling sections' current version.
export function affectedSections(scope:StoreSection):StoreSection[]{
 return scope==="full"?["hero","product_grid","collections","footer"]:[scope];
}
