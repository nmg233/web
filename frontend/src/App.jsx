import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Result, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { colors } from './styles/tokens';
import { AuthProvider } from './store/AuthContext';
import NotificationProvider from './store/NotificationProvider';
import AppLayout from './components/AppLayout';
import Login from './pages/auth/Login';
import RoleGuard, { RoleHomeRedirect } from './components/RoleGuard';

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

const guard = (element, roles) => <RoleGuard roles={roles}>{element}</RoleGuard>;

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
      <Spin size="large" />
    </div>
  );
}

function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{
      token: {
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
                <Route index element={<RoleHomeRedirect />} />
                <Route path="dashboard" element={guard(<Dashboard />, ['admin', 'academic_mentor', 'student', 'media'])} />
                <Route path="dashboard/schools/:id" element={guard(<SchoolDetail />, ['admin'])} />
                <Route path="dashboard/ai" element={guard(<AIAssistant />, ['admin', 'academic_mentor', 'student'])} />
                <Route path="dashboard/ai/settings" element={guard(<AISettings />, ['admin'])} />
                <Route path="glider" element={guard(<GliderSimulator />, ['admin', 'academic_mentor', 'student'])} />
                <Route path="courses" element={guard(<CourseList />, ['admin', 'academic_mentor', 'student', 'media'])} />
                <Route path="courses/create" element={guard(<CourseForm />, ['admin', 'academic_mentor'])} />
                <Route path="courses/:id" element={guard(<CourseDetail />, ['admin', 'academic_mentor', 'student'])} />
                <Route path="courses/:courseId/ai-knowledge" element={guard(<AIKnowledge />, ['admin', 'academic_mentor'])} />
                <Route path="courses/:id/learn" element={guard(<Learning />, ['student'])} />
                <Route path="courses/:courseId/lessons/:lessonId/learn" element={guard(<LessonLearn />, ['student'])} />
                <Route path="courses/:courseId/lessons/:lessonId/content" element={guard(<LessonContentEditor />, ['admin', 'academic_mentor'])} />
                <Route path="courses/:id/edit" element={guard(<CourseForm />, ['admin', 'academic_mentor'])} />
                <Route path="students" element={guard(<StudentList />, ['admin', 'academic_mentor'])} />
                <Route path="students/:id" element={guard(<StudentDetail />, ['admin', 'academic_mentor'])} />
                <Route path="works" element={guard(<WorkList />, ['admin', 'academic_mentor', 'student'])} />
                <Route path="works/upload" element={guard(<WorkUpload />, ['student'])} />
                <Route path="works/:id" element={guard(<WorkDetail />, ['admin', 'academic_mentor', 'student'])} />
                <Route path="tasks" element={guard(<TaskList />, ['admin', 'academic_mentor', 'student'])} />
                <Route path="tasks/:id" element={guard(<TaskDetail />, ['admin', 'academic_mentor', 'student'])} />
                <Route path="archives" element={guard(<ArchiveIndex />, ['admin', 'academic_mentor', 'teacher', 'student'])} />
                <Route path="archives/reflection" element={guard(<Reflection />, ['student'])} />
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
                <Route path="*" element={<Result status="404" title="页面不存在" subTitle="请通过左侧导航进入功能页面。" />} />
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
