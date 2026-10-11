import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {installTeachingLeaveHistory} from './pages/courses/useTeachingLeaveGuard';
installTeachingLeaveHistory();
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { PLATFORM_FONT } from './student/space/identity';
import { colors } from './styles/tokens';
import { AuthProvider } from './store/AuthContext';
import NotificationProvider from './store/NotificationProvider';
import AppLayout from './components/AppLayout';
import { PageLoading } from './components/PageStatus';
import NotFound from './components/NotFound';
import Login from './pages/auth/Login';
import RoleGuard, { RoleHomeRedirect } from './components/RoleGuard';
import { useAuth } from './store/AuthContext';
import { ExploreHome, CourseMap } from './student/Explore';
import Lab from './student/Lab';
const Personal = lazy(() => import('./student/space/Personal'));
const BadgeRoom = lazy(() => import('./student/space/BadgeRoom'));
const LegacyEntry = lazy(() => import('./student/space/LegacyEntry'));
const PixelPreview = import.meta.env.DEV ? lazy(() => import('./student/visual/PixelPreview')) : null;

function StudentView({ student, legacy }) {
  const { user } = useAuth();
  return user?.role === 'student' ? student : legacy;
}

// 路由级代码分割：按需加载各业务页面，降低首包体积
const ChangePassword = lazy(() => import('./pages/auth/ChangePassword'));
const Dashboard = lazy(() => import('./pages/dashboard/Index'));
const SchoolDetail = lazy(() => import('./pages/dashboard/School'));
const AIAssistant = lazy(() => import('./pages/dashboard/AI'));
const AISettings = lazy(() => import('./pages/dashboard/AISettings'));
const AIKnowledge = lazy(() => import('./pages/courses/AIKnowledge'));
const CourseList = lazy(() => import('./pages/courses/List'));
const CourseDetail = lazy(() => import('./pages/courses/Detail'));
const CourseForm = lazy(() => import('./pages/courses/Form'));
const Learning = lazy(() => import('./pages/courses/Learning'));
const TaskList = lazy(() => import('./pages/tasks/List'));
const TaskDetail = lazy(() => import('./pages/tasks/Detail'));
const StudentList = lazy(() => import('./pages/students/List'));
const StudentDetail = lazy(() => import('./pages/students/Detail'));
const WorkList = lazy(() => import('./pages/works/List'));
const WorkDetail = lazy(() => import('./pages/works/Detail'));
const WorkUpload = lazy(() => import('./pages/works/Upload'));
const ArchiveIndex = lazy(() => import('./pages/archives/Index'));
const Reflection = lazy(() => import('./pages/archives/Reflection'));
const FeedbackList = lazy(() => import('./pages/feedback/List'));
const FeedbackForm = lazy(() => import('./pages/feedback/Form'));
const FeedbackDetail = lazy(() => import('./pages/feedback/Detail'));
const FeedbackManage = lazy(() => import('./pages/feedback/Manage'));
const NotificationList = lazy(() => import('./pages/notifications/List'));
const NotificationDetail = lazy(() => import('./pages/notifications/Detail'));
const GliderSimulator = lazy(() => import('./pages/glider/Simulator'));
const LessonLearn = lazy(() => import('./pages/learning/LessonLearn'));
const MentorReviewList = lazy(() => import('./pages/mentor/ReviewList'));
const MentorReviewDetail = lazy(() => import('./pages/mentor/ReviewDetail'));
const LessonContentEditor = lazy(() => import('./pages/mentor/LessonContentEditor'));
const ObserverDashboard = lazy(() => import('./pages/observer/Dashboard'));
const ObserverStudents = lazy(() => import('./pages/observer/StudentList'));
const ObserverStudentDetail = lazy(() => import('./pages/observer/StudentDetail'));
const MentorContentHub = lazy(() => import('./pages/mentor/ContentHub'));
const CopyReview = lazy(() => import('./copy-review/CopyReview'));

const guard = (element, roles) => <RoleGuard roles={roles}>{element}</RoleGuard>;

function PageFallback() {
  return <PageLoading />;
}

function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{
      token: {
        fontFamily: PLATFORM_FONT,
        colorPrimary: colors.primary,
        colorBgLayout: colors.pageBg,
        colorBgContainer: colors.surface,
        colorText: '#172033',
        colorTextSecondary: colors.textSecondary,
        colorBorderSecondary: colors.border,
        borderRadius: 8,
        borderRadiusLG: 12,
      }
    }}>
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <NotificationProvider>
              <Suspense fallback={<PageFallback />}>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<AppLayout />}>
                <Route path="change-password" element={<ChangePassword />} />
                <Route path="copy-review" element={guard(<CopyReview />, ['admin'])} />
                <Route index element={<RoleHomeRedirect />} />
                <Route path="explore" element={guard(<ExploreHome />, ['student'])} />
                {import.meta.env.DEV && <Route path="__pixel-preview" element={guard(<PixelPreview />, ['student'])} />}
                <Route path="lab" element={guard(<LegacyEntry free={<Lab/>}/>, ['student'])} />
                <Route path="archives/rewards" element={guard(<Navigate to="/me" replace/>, ['student'])} />
                <Route path="me" element={guard(<Personal/>, ['student'])} />
                <Route path="me/badges" element={guard(<BadgeRoom/>, ['student'])} />
                <Route path="dashboard" element={guard(<StudentView student={<ExploreHome />} legacy={<Dashboard />} />, ['admin', 'academic_mentor', 'student', 'media'])} />
                <Route path="dashboard/schools/:id" element={guard(<SchoolDetail />, ['admin'])} />
                <Route path="dashboard/ai" element={guard(<StudentView student={<LegacyEntry/>} legacy={<AIAssistant/>}/>, ['admin', 'academic_mentor', 'student'])} />
                <Route path="dashboard/ai/settings" element={guard(<AISettings />, ['admin'])} />
                <Route path="glider" element={guard(<StudentView student={<LegacyEntry free={<GliderSimulator/>}/>} legacy={<GliderSimulator/>}/>, ['admin', 'academic_mentor', 'student'])} />
                <Route path="courses" element={guard(<StudentView student={<ExploreHome />} legacy={<CourseList />} />, ['admin', 'academic_mentor', 'student', 'media'])} />
                <Route path="courses/create" element={guard(<CourseForm />, ['admin', 'academic_mentor'])} />
                <Route path="courses/:id" element={guard(<StudentView student={<CourseMap />} legacy={<CourseDetail />} />, ['admin', 'academic_mentor', 'student'])} />
                <Route path="courses/:courseId/lab" element={guard(<Lab/>, ['student'])} />
                <Route path="courses/:courseId/glider" element={guard(<GliderSimulator/>, ['student'])} />
                <Route path="courses/:courseId/archives" element={guard(<ArchiveIndex/>, ['student'])} />
                <Route path="courses/:courseId/reflection" element={guard(<Reflection/>, ['student'])} />
                <Route path="courses/:courseId/assistant" element={guard(<AIAssistant/>, ['student'])} />
                <Route path="courses/:courseId/tasks" element={guard(<TaskList/>, ['student'])} />
                <Route path="courses/:courseId/tasks/:id" element={guard(<TaskDetail/>, ['student'])} />
                <Route path="courses/:courseId/works" element={guard(<WorkList/>, ['student'])} />
                <Route path="courses/:courseId/works/upload" element={guard(<WorkUpload/>, ['student'])} />
                <Route path="courses/:courseId/works/:id" element={guard(<WorkDetail/>, ['student'])} />
                <Route path="courses/:courseId/ai-knowledge" element={guard(<AIKnowledge />, ['admin', 'academic_mentor'])} />
                <Route path="courses/:id/learn" element={guard(<Learning />, ['student'])} />
                <Route path="courses/:courseId/lessons/:lessonId/learn" element={guard(<LessonLearn />, ['student'])} />
                <Route path="courses/:courseId/lessons/:lessonId/content" element={guard(<LessonContentEditor />, ['admin', 'academic_mentor'])} />
                <Route path="courses/:id/edit" element={guard(<CourseForm />, ['admin', 'academic_mentor'])} />
                <Route path="students" element={guard(<StudentList />, ['admin', 'academic_mentor'])} />
                <Route path="students/:id" element={guard(<StudentDetail />, ['admin', 'academic_mentor'])} />
                <Route path="works" element={guard(<StudentView student={<LegacyEntry/>} legacy={<WorkList/>}/>, ['admin', 'academic_mentor', 'student'])} />
                <Route path="works/upload" element={guard(<StudentView student={<LegacyEntry/>} legacy={<WorkUpload/>}/>, ['student'])} />
                <Route path="works/:id" element={guard(<StudentView student={<LegacyEntry/>} legacy={<WorkDetail/>}/>, ['admin', 'academic_mentor', 'student'])} />
                <Route path="tasks" element={guard(<StudentView student={<LegacyEntry/>} legacy={<TaskList/>}/>, ['admin', 'academic_mentor', 'student'])} />
                <Route path="tasks/:id" element={guard(<StudentView student={<LegacyEntry/>} legacy={<TaskDetail/>}/>, ['admin', 'academic_mentor', 'student'])} />
                <Route path="archives" element={guard(<StudentView student={<LegacyEntry/>} legacy={<ArchiveIndex/>}/>, ['admin', 'academic_mentor', 'teacher', 'student'])} />
                <Route path="archives/reflection" element={guard(<StudentView student={<LegacyEntry/>} legacy={<Reflection/>}/>, ['student'])} />
                <Route path="feedback" element={<FeedbackList />} />
                <Route path="feedback/new" element={<FeedbackForm />} />
                <Route path="feedback/manage" element={guard(<FeedbackManage />, ['admin'])} />
                <Route path="feedback/:id" element={<FeedbackDetail />} />
                <Route path="notifications" element={<NotificationList />} />
                <Route path="notifications/:id" element={<NotificationDetail />} />
                <Route path="mentor/content" element={guard(<MentorContentHub />, ['admin', 'academic_mentor'])} />
                <Route path="mentor/reviews" element={guard(<MentorReviewList />, ['admin', 'academic_mentor'])} />
                <Route path="mentor/reviews/:reportId" element={guard(<MentorReviewDetail />, ['admin', 'academic_mentor'])} />
                <Route path="observer" element={guard(<ObserverDashboard />, ['teacher', 'admin'])} />
                <Route path="observer/students" element={guard(<ObserverStudents />, ['teacher', 'admin'])} />
                <Route path="observer/students/:studentId" element={guard(<ObserverStudentDetail />, ['teacher', 'admin'])} />
                <Route path="*" element={<NotFound />} />
              </Route>
              </Routes>
              </Suspense>
            </NotificationProvider>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
