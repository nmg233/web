import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from './store/AuthContext';
import NotificationProvider from './store/NotificationProvider';
import AppLayout from './components/AppLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ChangePassword from './pages/auth/ChangePassword';
import Dashboard from './pages/dashboard/Index';
import SchoolDetail from './pages/dashboard/School';
import CourseList from './pages/courses/List';
import CourseDetail from './pages/courses/Detail';
import CourseForm from './pages/courses/Form';
import Learning from './pages/courses/Learning';
import TaskList from './pages/tasks/List';
import TaskDetail from './pages/tasks/Detail';
import StudentList from './pages/students/List';
import StudentDetail from './pages/students/Detail';
import WorkList from './pages/works/List';
import WorkDetail from './pages/works/Detail';
import WorkUpload from './pages/works/Upload';
import ArchiveIndex from './pages/archives/Index';
import Reflection from './pages/archives/Reflection';
import AIAssistant from './pages/dashboard/AI';
import FeedbackList from './pages/feedback/List';
import FeedbackForm from './pages/feedback/Form';
import FeedbackDetail from './pages/feedback/Detail';
import FeedbackManage from './pages/feedback/Manage';
import NotificationList from './pages/notifications/List';
import NotificationDetail from './pages/notifications/Detail';
import GliderSimulator from './pages/glider/Simulator';

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
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
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
            </NotificationProvider>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
