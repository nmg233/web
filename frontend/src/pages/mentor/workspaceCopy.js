import catalog from '../../../../content/mentor-workspace/copy.json';
// Staff copy is separate from teaching fields and frozen student manuscripts.
export function mentorText(id){return catalog.entries[id]?.text??id;}
