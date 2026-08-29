
export function motionDurationMs(baseMs:number,reduced:boolean){
 if(baseMs<0)throw new Error("DURATION_INVALID");
 return reduced?0:baseMs;
}

export type AnnouncedStage="planning"|"building"|"generating_assets"|"finalizing"|"completed"|"failed";

const STAGE_ANNOUNCEMENTS:Record<AnnouncedStage,string>={
 planning:"Planning your generation.",
 building:"Building the layout.",
 generating_assets:"Generating assets.",
 finalizing:"Finalizing results.",
 completed:"Generation complete.",
 failed:"Generation failed. See details below.",
};

// Screen-reader users following a background job need the same stage updates a
// sighted user gets from the visual progress indicator, spoken through an ARIA live region.
export function ariaLiveAnnouncement(stage:AnnouncedStage){
 const message=STAGE_ANNOUNCEMENTS[stage];
 if(!message)throw new Error("STAGE_ANNOUNCEMENT_UNKNOWN");
 return message;
}

export function focusableId(prefix:string,id:string){
 if(!prefix||!id)throw new Error("FOCUSABLE_ID_INVALID");
 return `${prefix}-${id}`.replace(/[^a-zA-Z0-9_-]/g,"-");
}
