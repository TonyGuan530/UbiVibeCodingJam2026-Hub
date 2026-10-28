// Third-person camera math, shared by runtime and collision regression tests.
export function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]}
export function cameraPose(player,floorY,yaw=0,pitch=.35,distance=7,blocked=()=>false){
 const pivot=[player.x,floorY+1.35,player.z];
 const reach=Math.max(.25,Math.min(10,distance));
 const dx=Math.sin(yaw)*Math.cos(pitch),dz=Math.cos(yaw)*Math.cos(pitch),dy=Math.sin(pitch);
 let safe=.22;
 for(let d=.25;d<=reach+.001;d+=.12){if(blocked(pivot[0]+dx*d,pivot[2]+dz*d,pivot[1]+dy*d))break;safe=d}
 safe=Math.max(.22,Math.min(reach,safe-.1));
 return{pivot,eye:[pivot[0]+dx*safe,pivot[1]+dy*safe,pivot[2]+dz*safe],distance:safe};
}
