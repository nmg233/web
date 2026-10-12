// Entertainment only. No persisted record, reward or learning side effect.
const { createHash } = require('node:crypto');
const catalog = require('../../shared/fortunePool.json');
const VERSION = catalog.version;
const levels = ['great', 'lucky', 'small', 'steady'];
const patterns = ['fortune-plane', 'fortune-star', 'fortune-device'];
const good = catalog.good.map(id=>id.slice('fortune.good.'.length));
const avoid = catalog.avoid.map(id=>id.slice('fortune.avoid.'.length));
if(good.length!==30||avoid.length!==30||new Set(good).size!==30||new Set(avoid).size!==30)throw Error('运势受控词库必须宜、忌各30条');
const modulo = (value, size) => ((value % size) + size) % size;
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
// Round-robin perfect matchings cover all 435 unordered good pairs. Within a
// matching, every item is distinct. Arrange only its first/last pair to also
// avoid yesterday's items at matching boundaries, including the cycle wrap.
function goodPairs(seed){
 let state=seed||1;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 const shuffle=items=>{const out=[...items];for(let i=out.length-1;i>0;i--){const j=random()%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;};
 const disjoint=(a,b)=>a.every(item=>!b.includes(item));let ring=shuffle(good);const result=[];
 for(let round=0;round<good.length-1;round++){
  const pairs=shuffle(Array.from({length:good.length/2},(_,i)=>[ring[i],ring[ring.length-1-i]]));
  if(result.length){const first=pairs.findIndex(pair=>disjoint(pair,result.at(-1)));[pairs[0],pairs[first]]=[pairs[first],pairs[0]];}
  if(round===good.length-2){const last=pairs.findIndex((pair,i)=>i>0&&disjoint(pair,result[0]));[pairs[pairs.length-1],pairs[last]]=[pairs[last],pairs[pairs.length-1]];}
  result.push(...pairs);ring=[ring[0],ring.at(-1),...ring.slice(1,-1)];
 }
 return result;
}
function dailyFortune(userId, now = new Date()) {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const day = Date.parse(date + 'T00:00:00Z') / 86400000;
  const bytes = createHash('sha256').update(`${VERSION}:${userId}`).digest();
  const pairs=goodPairs(bytes.readUInt32BE(0));
  let step=1+bytes.readUInt32BE(4)%(avoid.length-1);while(gcd(step,avoid.length)!==1)step=step%(avoid.length-1)+1;
  const dailyGood=pairs[modulo(day+bytes.readUInt32BE(8),pairs.length)];
  const dailyAvoid=avoid[modulo(day*step+bytes.readUInt32BE(12),avoid.length)];
  const art=patterns[modulo(day+bytes.readUInt32BE(16),patterns.length)],level=levels[modulo(day+bytes.readUInt32BE(20),levels.length)];
  return { version: VERSION, date, nextUpdateAt: new Date(Date.parse(date+'T00:00:00+08:00')+86400000).toISOString(),
    level, art, good: [...dailyGood], avoid: [dailyAvoid] };
}
module.exports = { dailyFortune, VERSION, goodPairs };
