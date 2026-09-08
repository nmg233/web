import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from './store/AuthContext';
import NotificationProvider from './store/NotificationProvider';
import AppLayout from './components/AppLayout';
import Login from './pages/auth/Login';

// 路由级代码分割：按需加载各业务页面，降低首包体积
const ChangePassword = lazy(() => import('./pages/auth/ChangePassword'));
const Dashboard = lazy(() => import('./pages/dashboard/Index'));
const SchoolDetail = lazy(() => import('./pages/dashboard/School'));
const AIAssistant = lazy(() => import('./pages/dashboard/AI'));
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
        colorPrimary: '#1a73e8',
        borderRadius: 8,
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
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="dashboard/schools/:id" element={<SchoolDetail />} />
                <Route path="dashboard/ai" element={<AIAssistant />} />
                <Route path="glider" element={<GliderSimulator />} />
                <Route path="courses" element={<CourseList />} />
                <Route path="courses/create" element={<CourseForm />} />
                <Route path="courses/:id" element={<CourseDetail />} />
                <Route path="courses/:id/learn" element={<Learning />} />
                <Route path="courses/:id/edit" element={<CourseForm />} />
                <Route path="students" element={<StudentList />} />
                <Route path="students/:id" element={<StudentDetail />} />
                <Route path="works" element={<WorkList />} />
                <Route path="works/upload" element={<WorkUpload />} />
                <Route path="works/:id" element={<WorkDetail />} />
                <Route path="tasks" element={<TaskList />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="archives" element={<ArchiveIndex />} />
                <Route path="archives/reflection" element={<Reflection />} />
                <Route path="feedback" element={<FeedbackList />} />
                <Route path="feedback/new" element={<FeedbackForm />} />
                <Route path="feedback/manage" element={<FeedbackManage />} />
                <Route path="feedback/:id" element={<FeedbackDetail />} />
                <Route path="notifications" element={<NotificationList />} />
                <Route path="notifications/:id" element={<NotificationDetail />} />
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
