import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import CheckboxDashboard from './pages/CheckboxDashboard.jsx';
import DataExplorer from './pages/DataExplorer.jsx';
import MindmapPage from './pages/MindmapPage.jsx';
import MindmapPlayground from './pages/MindmapPlayground.jsx';
import PromptsPage from './pages/PromptsPage.jsx';
import StudentView from './pages/StudentView.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login.html" element={<Navigate to="/login" replace />} />

      <Route element={<AppLayout />}> 
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/admin.html" element={<Navigate to="/admin" replace />} />

        <Route
          path="/checkbox"
          element={
            <ProtectedRoute>
              <CheckboxDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/checkbox.html" element={<Navigate to="/checkbox" replace />} />

        <Route
          path="/data"
          element={
            <ProtectedRoute>
              <DataExplorer />
            </ProtectedRoute>
          }
        />
        <Route path="/data.html" element={<Navigate to="/data" replace />} />

        <Route
          path="/mindmap"
          element={
            <ProtectedRoute>
              <MindmapPage />
            </ProtectedRoute>
          }
        />
        <Route path="/mindmap.html" element={<Navigate to="/mindmap" replace />} />

        <Route
          path="/mindmap-playground"
          element={
            <ProtectedRoute>
              <MindmapPlayground />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mindmap-playground.html"
          element={<Navigate to="/mindmap-playground" replace />}
        />

        <Route
          path="/prompts"
          element={
            <ProtectedRoute>
              <PromptsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/prompts.html" element={<Navigate to="/prompts" replace />} />

        <Route path="/student" element={<StudentView />} />
        <Route path="/student.html" element={<Navigate to="/student" replace />} />
      </Route>

      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default App;
