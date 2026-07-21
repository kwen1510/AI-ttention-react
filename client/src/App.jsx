import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const CheckboxDashboard = lazy(() => import('./pages/CheckboxDashboard.jsx'));
const AsyncDashboard = lazy(() => import('./pages/AsyncDashboard.jsx'));
const AsyncStudentView = lazy(() => import('./pages/AsyncStudentView.jsx'));
const HistoryPage = lazy(() => import('./pages/HistoryPage.jsx'));
const PromptsPage = lazy(() => import('./pages/PromptsPage.jsx'));
const StudentView = lazy(() => import('./pages/StudentView.jsx'));

function App() {
  const renderTeacherRoute = (element) => (
    <ProtectedRoute>
      {element}
    </ProtectedRoute>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" aria-busy="true" />}>
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
          path="/prompts"
          element={renderTeacherRoute(<PromptsPage />)}
        />

        <Route path="/staging/admin" element={renderTeacherRoute(<AdminDashboard />)} />
        <Route path="/staging/checkbox" element={renderTeacherRoute(<CheckboxDashboard />)} />
        <Route path="/staging/async" element={renderTeacherRoute(<AsyncDashboard />)} />
        <Route path="/staging/history" element={renderTeacherRoute(<HistoryPage />)} />
        <Route path="/staging/prompts" element={renderTeacherRoute(<PromptsPage />)} />

        <Route path="/student" element={<StudentView />} />
        <Route path="/s" element={<StudentView />} />
        <Route path="/async/j/:shareId" element={<AsyncStudentView />} />
      </Route>

      <Route path="/staging" element={<Navigate to="/staging/admin" replace />} />
      <Route path="/" element={<Navigate to="/student" replace />} />
      <Route path="*" element={<Navigate to="/student" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
