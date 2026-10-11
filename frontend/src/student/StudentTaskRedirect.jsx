import {copyText as siteText} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import {useCourseApis} from './useCourseApis';
import { useCallback } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Link from './space/SpaceLink';

import { Spin } from 'antd';
import { useAuth } from '../store/AuthContext';
import { ServicePage } from '../components/ServiceUI';
import { requestError, objectErrorTitle } from '../utils/requestError';
import { PixelButton, PixelPanel } from './visual/PixelUI';
import useCourseResource from './useCourseResource';
import { validId } from './compatibilityModel';
import './visual/pixel-compatibility.css';

export default function StudentTaskRedirect() {
  const { id } = useParams(), { user } = useAuth();
  return <TaskRedirect key={`${user.id}:${id}`} id={id} />;
}
function TaskRedirect({ id }) {
 const {taskAPI,courseAPI}=useCourseApis();
  const read = useCallback(async () => {
    const data = await taskAPI.detail(id);
    const current = await courseAPI.list();
    if (!(current.courses || []).some(c => String(c.id) === String(data.task.course_id))) throw { response: { status: 404, data: { error: siteText("site.9957663d3d717472") } } };
    if (!validId(data.task.course_id) || !validId(data.task.lesson_id)) throw new Error(siteText("site.307ebeea8c3efd3d"));
    return data;
  }, [id,taskAPI,courseAPI]);
  const { data, loading, error, reload } = useCourseResource(read);
  if (data) return <Navigate replace to={`/courses/${data.task.course_id}/lessons/${data.task.lesson_id}/learn`} />;
  return <ServicePage title={siteText("site.d84f377fe206084c")} eyebrow={siteText("site.771b311154012644")} description={siteText("site.8a57c06caa5758bd")}>
    <PixelPanel className="compat-redirect"><span className="compat-route-mark" aria-hidden="true">→</span>
      {loading ? <div role="status"><Spin /><h3>{siteText("site.1d56f8824148d016")}</h3><Sentence>{siteText("site.40161d665232a523")}</Sentence></div>
        : <><Alert role="alert" type="warning" title={objectErrorTitle(error, siteText("site.26be51a635380b55"))} description={error?.message || requestError(error)} /><PixelButton type="primary" onClick={reload}>{siteText("site.c0ec52c25ca600c3")}</PixelButton></>}
      <div className="compat-row-actions"><Link to="/tasks">{siteText("site.fcfd13328a828a5a")}</Link><Link to="/explore">{siteText("site.026e145d71cae1d7")}</Link></div>
    </PixelPanel>
  </ServicePage>;
}
