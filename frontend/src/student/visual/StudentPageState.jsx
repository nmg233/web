import AsyncPageState from '../../components/common/AsyncPageState';
import {displayText} from '../../content/displayText';
export default function StudentPageState({error,emptyText,...props}){
 return <AsyncPageState {...props} error={displayText(error)} emptyText={displayText(emptyText)}/>;
}
