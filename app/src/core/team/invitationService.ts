
import {createServerStorageClient} from "../storage/supabaseStorage";
import {assertCanInvite,assertInviteableRole,generateInviteToken,isInviteExpired} from "./invitations";
import {assertCanChangeRole,assertCanRemoveMember} from "./roleRules";
import type {Role} from "../auth/authorization";

export async function createInvitation(input:{storeId:string;inviterRole:Role;targetRole:Role;email:string}){
 assertCanInvite(input.inviterRole);
 assertInviteableRole(input.inviterRole,input.targetRole);
 const token=generateInviteToken();
 const c=createServerStorageClient();
 const {data,error}=await c.from("store_invitations").insert({
  store_id:input.storeId,email:input.email,role:input.targetRole,token,status:"pending",
 }).select("id,token,role,status").single();
 if(error)throw new Error(`INVITATION_CREATE_FAILED: ${error.message}`);
 return data;
}

export async function acceptInvitation(input:{token:string;userId:string;now?:number}){
 const c=createServerStorageClient();
 const {data:invite,error:findErr}=await c.from("store_invitations").select("*").eq("token",input.token).eq("status","pending").single();
 if(findErr||!invite)throw new Error("INVITATION_NOT_FOUND");
 if(isInviteExpired(new Date(invite.created_at).getTime(),input.now??Date.now()))throw new Error("INVITATION_EXPIRED");
 const {error:memberErr}=await c.from("store_members").insert({store_id:invite.store_id,user_id:input.userId,role:invite.role,status:"active"});
 if(memberErr)throw new Error(`INVITATION_ACCEPT_FAILED: ${memberErr.message}`);
 await c.from("store_invitations").update({status:"accepted"}).eq("id",invite.id);
 return {storeId:invite.store_id,role:invite.role};
}

export async function changeMemberRole(input:{storeId:string;actingRole:Role;targetMemberId:string;targetCurrentRole:Role;targetNewRole:Role}){
 assertCanChangeRole(input.actingRole,input.targetCurrentRole,input.targetNewRole);
 const c=createServerStorageClient();
 const {error}=await c.from("store_members").update({role:input.targetNewRole}).eq("id",input.targetMemberId).eq("store_id",input.storeId);
 if(error)throw new Error(`ROLE_CHANGE_FAILED: ${error.message}`);
 return {updated:true};
}

export async function removeMember(input:{storeId:string;actingRole:Role;targetMemberId:string;targetRole:Role}){
 const c=createServerStorageClient();
 const {count:ownerCount}=await c.from("store_members").select("id",{count:"exact",head:true}).eq("store_id",input.storeId).eq("role","owner").eq("status","active");
 assertCanRemoveMember(input.actingRole,input.targetRole,ownerCount??0);
 const {error}=await c.from("store_members").update({status:"suspended"}).eq("id",input.targetMemberId).eq("store_id",input.storeId);
 if(error)throw new Error(`MEMBER_REMOVE_FAILED: ${error.message}`);
 return {removed:true};
}
