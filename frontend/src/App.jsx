import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/Signup';
import StudentPanel from './components/StudentPanel';
import LecturerPanel from './components/LecturerPanel';
import AdminDashboard from './components/AdminDashboard';

// 🔥 Toast imports
import { Toaster } from "react-hot-toast";

export default function App() {
  const [user, setUser] = useState(null);

  // Load stored token when app starts
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
      } catch (e) {
        console.error('Token decode error:', e);
        setUser(null);
      }
    }
  }, []);

  // Handle logout globally
  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <Router>

      {/* 🔥 Global toast handler */}
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />

      <Routes>
        {/* Default route: show login if not logged in */}
        <Route
          path="/"
          element={
            user ? (
              <Navigate to={`/${user.role}`} replace />
            ) : (
              <Login setUser={setUser} />
            )
          }
        />

        {/* Signup route for new users */}
        <Route path="/signup" element={<Signup />} />

        {/* Student Dashboard */}
        <Route
          path="/student"
          element={
            user?.role === 'student' ? (
              <StudentPanel user={user} setUser={setUser} handleLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Lecturer Dashboard */}
        <Route
          path="/lecturer"
          element={
            user?.role === 'lecturer' ? (
              <LecturerPanel user={user} setUser={setUser} handleLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Admin Dashboard */}
        <Route
          path="/admin"
          element={
            user?.role === 'admin' ? (
              <AdminDashboard user={user} setUser={setUser} handleLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
