import {copyText} from '../content/copy';

// One reviewed field definition for student forms and maintenance previews.
export function reportFields(){
 return [['summary','055'],['key_points','056'],['application','057'],['difficulties','058'],['next_plan','059']]
  .map(([name,id])=>[name,copyText('system.learning.'+id)]);
}
