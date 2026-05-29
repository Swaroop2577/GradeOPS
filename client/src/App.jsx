import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import ProtectedRoute from './components/shared/ProtectedRoute';
import Navbar from './components/shared/Navbar';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import InstructorDashboard from './pages/InstructorDashboard';
import TADashboard from './pages/TADashboard';
import ExamDetail from './pages/ExamDetail';
import ExamsList from './pages/ExamsList';
import ExamTypeDetail from './pages/ExamTypeDetail';

const HomeRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'instructor' ? '/instructor' : '/ta'} replace />;
};

const App = () => (
  <Routes>
    {/* Public */}
    <Route path="/login"    element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/"         element={<HomeRedirect />} />

    {/* Instructor routes */}
    <Route element={<ProtectedRoute roles={['instructor']} />}>
      <Route
        path="/instructor/*"
        element={
          <>
            <Navbar />
            <main>
              <Routes>
                <Route index                          element={<InstructorDashboard />} />
                <Route path="exams"                   element={<ExamsList />} />
                <Route path="exams/:examId"           element={<ExamDetail />} />
                <Route path="exam-types/:examTypeId"  element={<ExamTypeDetail />} />
              </Routes>
            </main>
          </>
        }
      />
    </Route>

    {/* TA routes */}
    <Route element={<ProtectedRoute roles={['ta']} />}>
      <Route
        path="/ta/*"
        element={
          <>
            <Navbar />
            <main>
              <Routes>
                <Route index                    element={<TADashboard />} />
                <Route path="review/:examId"    element={<TADashboard />} />
              </Routes>
            </main>
          </>
        }
      />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
