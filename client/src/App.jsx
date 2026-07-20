import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import CheckboxDashboard from './pages/CheckboxDashboard.jsx';
import AsyncDashboard from './pages/AsyncDashboard.jsx';
import AsyncStudentView from './pages/AsyncStudentView.jsx';
import DataExplorer from './pages/DataExplorer.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import PromptsPage from './pages/PromptsPage.jsx';
import StudentView from './pages/StudentView.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';

function App() {
  const renderTeacherRoute = (element) => (
    <ProtectedRoute>
      {element}
    </ProtectedRoute>
  );

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route
          path="/admin"
          element={renderTeacherRoute(<AdminDashboard />)}
        />

        <Route
          path="/checkbox"
          element={renderTeacherRoute(<CheckboxDashboard />)}
        />

        <Route
          path="/async"
          element={renderTeacherRoute(<AsyncDashboard />)}
        />

        <Route
          path="/history"
          element={renderTeacherRoute(<HistoryPage />)}
        />

        <Route
          path="/data"
          element={renderTeacherRoute(<DataExplorer />)}
        />

        <Route
          path="/prompts"
          element={renderTeacherRoute(<PromptsPage />)}
        />

        <Route path="/staging/admin" element={renderTeacherRoute(<AdminDashboard />)} />
        <Route path="/staging/checkbox" element={renderTeacherRoute(<CheckboxDashboard />)} />
        <Route path="/staging/async" element={renderTeacherRoute(<AsyncDashboard />)} />
        <Route path="/staging/history" element={renderTeacherRoute(<HistoryPage />)} />
        <Route path="/staging/data" element={renderTeacherRoute(<DataExplorer />)} />
        <Route path="/staging/prompts" element={renderTeacherRoute(<PromptsPage />)} />

        <Route path="/student" element={<StudentView />} />
        <Route path="/s" element={<StudentView />} />
        <Route path="/async/j/:shareId" element={<AsyncStudentView />} />
      </Route>

      <Route path="/staging" element={<Navigate to="/staging/admin" replace />} />
      <Route path="/" element={<Navigate to="/student" replace />} />
      <Route path="*" element={<Navigate to="/student" replace />} />
    </Routes>
  );
}

export default App;
