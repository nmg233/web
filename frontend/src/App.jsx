import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from './store/AuthContext';
import NotificationProvider from './store/NotificationProvider';
import SeasonPixelBackground from './components/SeasonPixelBackground';
import Login from './pages/auth/Login';

// 注册页与登录后的应用外壳按需加载，未登录首屏只保留登录必需代码。
const Register = lazy(() => import('./pages/auth/Register'));
const AppLayout = lazy(() => import('./components/AppLayout'));

// 业务页面按路由拆包，登录首屏不再一次性下载所有管理与详情页面代码。
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

// 主题对象保持稳定引用，避免应用重渲染时重复生成全局配置。
const themeConfig = {
  token: {
    colorPrimary: '#347fbd',
    colorText: '#16476a',
    colorTextSecondary: '#527898',
    colorBgContainer: 'rgba(255, 255, 255, .72)',
    borderRadius: 4,
    fontFamily: "'ZCOOL KuaiLe', 'YouYuan', 'Microsoft YaHei', sans-serif",
  },
};

function App() {
  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntApp>
        <SeasonPixelBackground />
        <AuthProvider>
          {/* 为顶部通知组件提供共享状态，避免登录后页面渲染报错。 */}
          <NotificationProvider>
            <BrowserRouter>
              <Suspense
                fallback={(
                  <div className="loading-screen">
                    <Spin size="large" description="页面加载中..." />
                  </div>
                )}
              >
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/" element={<AppLayout />}>
                    <Route path="change-password" element={<ChangePassword />} />
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="dashboard/schools/:id" element={<SchoolDetail />} />
                    <Route path="dashboard/ai" element={<AIAssistant />} />
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
            </BrowserRouter>
          </NotificationProvider>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;