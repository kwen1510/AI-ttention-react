import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import CheckboxDashboard from './pages/CheckboxDashboard.jsx';
import DataExplorer from './pages/DataExplorer.jsx';
import PromptsPage from './pages/PromptsPage.jsx';
import StudentView from './pages/StudentView.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/checkbox"
          element={
            <ProtectedRoute>
              <CheckboxDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/data"
          element={
            <ProtectedRoute>
              <DataExplorer />
            </ProtectedRoute>
          }
        />

        <Route
          path="/prompts"
          element={
            <ProtectedRoute>
              <PromptsPage />
            </ProtectedRoute>
          }
        />

        <Route path="/student" element={<StudentView />} />
      </Route>

      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default App;
