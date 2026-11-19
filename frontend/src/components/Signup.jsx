
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [regNumber, setRegNumber] = useState('');
  const [matricYear, setMatricYear] = useState('');

  const [activeSession, setActiveSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const API_URL =
    process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // Fetch the active academic session when student registration is selected
  useEffect(() => {
    if (role !== 'student') {
      setActiveSession(null);
      return;
    }

    let cancelled = false;

    const fetchActiveSession = async () => {
      setLoadingSession(true);
      setError(null);
      setActiveSession(null);

      try {
        const res = await axios.get(
          `${API_URL}/auth/active-session`
        );

        if (!cancelled) {
          setActiveSession(res.data);
        }
      } catch (err) {
        console.error('Academic session error:', err);

        if (!cancelled) {
          setError(
            err.response?.data?.detail ||
            'Unable to retrieve the active academic session. Please try again.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSession(false);
        }
      }
    };

    fetchActiveSession();

    return () => {
      cancelled = true;
    };
  }, [role, API_URL]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (role === 'student') {
      if (!activeSession) {
        setError('No active academic session is available. Registration cannot continue.');
        return;
      }

      if (!/^\d{6}$/.test(regNumber)) {
        setError('Registration number must be exactly 6 digits.');
        return;
      }

      if (!/^(1[5-9]|2[0-4])$/.test(matricYear)) {
        setError('Please select a valid matriculation year.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const payload = {
        name,
        email,
        password,
        role,
        reg_number: regNumber
      };

      // Matriculation year is required only for students
      if (role === 'student') {
        payload.matric_year = matricYear;
      }

      const res = await axios.post(
        `${API_URL}/auth/signup`,
        payload
      );

      alert(
        res.data.academic_session
          ? `Registration successful!\nAcademic Session: ${res.data.academic_session}\nMatriculation Year: ${res.data.matric_year}\n\nYour account is awaiting admin approval.`
          : res.data.message || 'Signup successful!'
      );

      navigate('/');

    } catch (err) {
      console.error('Signup error:', err);

      if (err.response?.data) {
        setError(
          err.response.data.detail ||
          'Server error during signup.'
        );
      } else {
        setError('Network error — check your backend connection.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 mt-12 mb-10 bg-white rounded shadow">

      <h2 className="text-xl font-bold mb-5">
        Create an Account
      </h2>

      {error && (
        <div className="text-red-600 bg-red-50 border border-red-200 p-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Full Name
          </label>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter full name"
            className="w-full p-2 border rounded"
            required
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Email Address
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            className="w-full p-2 border rounded"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create password"
            className="w-full p-2 border rounded"
            required
          />
        </div>

        {/* Account Type */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Account Type
          </label>

          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setError(null);
            }}
            className="w-full p-2 border rounded"
          >
            <option value="student">Student</option>
            <option value="lecturer">Lecturer</option>
          </select>
        </div>

        {/* Student-specific fields */}
        {role === 'student' && (
          <>
            {/* Academic Session */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Academic Session
              </label>

              <div className="w-full p-3 border rounded bg-gray-100 flex items-center justify-between">
                {loadingSession ? (
                  <span className="text-gray-500 text-sm">
                    Loading academic session...
                  </span>
                ) : activeSession ? (
                  <span className="font-semibold text-gray-800">
                    {activeSession.name}
                  </span>
                ) : (
                  <span className="text-red-600 text-sm">
                    Academic session unavailable
                  </span>
                )}

                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                  System Assigned
                </span>
              </div>

              <p className="text-xs text-gray-500 mt-1">
                Academic session is assigned by the administrator
                and cannot be changed by students.
              </p>
            </div>

            {/* Matriculation Year */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Matriculation Year
              </label>

              <select
                value={matricYear}
                onChange={(e) => setMatricYear(e.target.value)}
                className="w-full p-2 border rounded"
                required
              >
                <option value="">
                  Select matriculation year
                </option>

                {Array.from(
                  { length: 10 },
                  (_, i) => 15 + i
                ).map((year) => (
                  <option
                    key={year}
                    value={String(year)}
                  >
                    {String(year).padStart(2, '0')}
                  </option>
                ))}
              </select>

              <p className="text-xs text-gray-500 mt-1">
                Select your year of admission.
              </p>
            </div>
          </>
        )}

        {/* Registration / Staff Number */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {role === 'student'
              ? 'Registration Number'
              : 'Staff Number'}
          </label>

          <input
            value={regNumber}
            onChange={(e) => {
              let value = e.target.value;

              if (role === 'student') {
                value = value.replace(/\D/g, '').slice(0, 6);
              }

              setRegNumber(value);
            }}
            placeholder={
              role === 'student'
                ? '6-Digit Registration Number'
                : 'Staff Number'
            }
            className="w-full p-2 border rounded"
            maxLength={role === 'student' ? 6 : 20}
            required
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={
            submitting ||
            (role === 'student' &&
              (loadingSession || !activeSession))
          }
          className={`w-full text-white py-2 rounded ${
            submitting ||
            (role === 'student' &&
              (loadingSession || !activeSession))
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {submitting
            ? 'Registering...'
            : 'Sign Up'}
        </button>

      </form>

      <div className="text-sm text-gray-500 mt-5 text-center">
        Already have an account?{' '}

        <button
          onClick={() => navigate('/')}
          className="text-blue-600 hover:underline"
        >
          Login
        </button>
      </div>

    </div>
  );
}
