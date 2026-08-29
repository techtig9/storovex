
export function stripControlChars(value:string){
 return [...value].filter(ch=>ch==="\n"||ch==="\r"||ch==="\t"||ch>="\u0020").join("");
}
export function sanitizeFilename(name:string){
 const base=name.normalize("NFKC").replace(/[\r\n]/g,"").replace(/[\/\\]/g,"_");
 if(!base||base==="."||base==="..")throw new Error("INVALID_FILENAME");
 return base.slice(0,255);
}
