
export function computeRange(page:number,pageSize:number){
 if(!Number.isInteger(page)||page<1)throw new Error("PAGE_INVALID");
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new Error("PAGE_SIZE_INVALID");
 const from=(page-1)*pageSize;
 return {from,to:from+pageSize-1};
}

export function totalPages(totalCount:number,pageSize:number){
 if(totalCount<0)throw new Error("TOTAL_COUNT_INVALID");
 if(!Number.isInteger(pageSize)||pageSize<1)throw new Error("PAGE_SIZE_INVALID");
 return Math.max(1,Math.ceil(totalCount/pageSize));
}
