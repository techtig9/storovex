
export type ProjectStatus="draft"|"active"|"archived";
export type ProjectSortField="updated_at"|"created_at"|"name";
export type SortDirection="asc"|"desc";

const VALID_STATUSES=new Set<ProjectStatus>(["draft","active","archived"]);
export function assertValidStatus(status:string){
 if(!VALID_STATUSES.has(status as ProjectStatus))throw new Error("PROJECT_STATUS_INVALID");
}

// draft <-> active move freely; either can archive; archived can only be restored to active,
// never straight back to draft, and can't be re-archived.
export function canTransitionStatus(from:ProjectStatus,to:ProjectStatus){
 if(from===to)return false;
 if(from==="archived")return to==="active";
 return true;
}

const VALID_SORT_FIELDS=new Set<ProjectSortField>(["updated_at","created_at","name"]);
export function assertValidSort(field:string,direction:string){
 if(!VALID_SORT_FIELDS.has(field as ProjectSortField))throw new Error("SORT_FIELD_INVALID");
 if(direction!=="asc"&&direction!=="desc")throw new Error("SORT_DIRECTION_INVALID");
}

export function duplicateName(originalName:string,existingNames:string[]){
 const set=new Set(existingNames);
 let candidate=`${originalName} (copy)`;
 let n=2;
 while(set.has(candidate)){candidate=`${originalName} (copy ${n})`;n++;}
 return candidate;
}

const MAX_QUERY_LENGTH=200;
export function sanitizeSearchQuery(q:string){
 const trimmed=q.trim().slice(0,MAX_QUERY_LENGTH);
 return trimmed.length===0?undefined:trimmed;
}
