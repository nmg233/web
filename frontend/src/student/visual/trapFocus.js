export function trapFocus(event){
 if(event.key!=='Tab')return;
 const scope=event.currentTarget;
 const items=[...scope.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length&&el.getAttribute('aria-disabled')!=='true');
 if(!items.length)return;
 const first=items[0],last=items.at(-1);
 if(!scope.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}
 else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
