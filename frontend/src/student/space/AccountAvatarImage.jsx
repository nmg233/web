import {nextAsset} from './nextAssets';
export default function AccountAvatarImage({preset,legacyUrl,size=32,...props}){
 const src=preset?nextAsset('account-'+preset):legacyUrl||nextAsset('account-pilot');
 return <img key={src} {...props} src={src} alt="" width={size} height={size} className="account-avatar-image" onError={e=>{if(e.currentTarget.dataset.fallback)return;e.currentTarget.dataset.fallback='true';e.currentTarget.src=nextAsset('account-pilot');}}/>;
}
