export const PATCH_ART = Object.freeze({
  loginDesktop:'login-desktop',loginMobile:'login-mobile',selection:'campus-select',personal:'campus-personal',
  reading:'voyage-reading',experiments:'voyage-lab',glider:'glider-cover',robot:'robot-wink',
});
export function patchAsset(name,width=960){return '/assets/redesign-v2/visual-patch/web/'+name+'-'+width+'.webp';}
