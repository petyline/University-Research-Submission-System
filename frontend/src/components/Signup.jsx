import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [regNumber, setRegNumber] = useState('');
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  // Use backend URL from .env (same style as Login.jsx)
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (role === "student") {
      if (!/^\d{6}$/.test(regNumber)) {
        setError("Registration number must be exactly 6 digits.");
        return;
      }
    }

    setError(null);

    try {
      const res = await axios.post(`${API_URL}/auth/signup`, {
        name,
        email,
        password,
        role,
        reg_number: regNumber
      });

      alert(res.data.message || 'Signup successful!');
      navigate('/'); // Redirect to login
    } catch (err) {
      console.error('Signup error:', err);
      if (err.response && err.response.data) {
        setError(err.response.data.detail || 'Server error during signup');
      } else {
        setError('Network error — check backend connection');
      }
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 mt-20 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Create an Account</h2>

      {error && <div className="text-red-600 mb-3">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full Name"
          className="w-full p-2 border"
          required
        />

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email Address"
          className="w-full p-2 border"
          required
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full p-2 border"
          required
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full p-2 border"
        >
          <option value="student">Student</option>
          <option value="lecturer">Lecturer</option>
        </select>

        <input
          value={regNumber}
          onChange={(e) => {
            let v = e.target.value;
        
            if (role === "student") {
              // Only allow digits
              v = v.replace(/\D/g, "");
              // Limit length to 6
              if (v.length > 6) v = v.slice(0, 6);
            }
            setRegNumber(v);
          }}
          placeholder={role === "student" ? "6-Digit Registration Number" : "Staff Number"}
          className="w-full p-2 border"
          maxLength={role === "student" ? 6 : 20}
          required
        />


        <button className="w-full bg-blue-600 text-white py-2 rounded">
          Sign Up
        </button>
      </form>

      <div className="text-sm text-gray-500 mt-4 text-center">
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
