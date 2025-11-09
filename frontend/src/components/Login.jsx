import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  // Backend URL from .env
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const handle = async (e) => {
    e.preventDefault();

    try {
      const url = `${API_URL}/auth/login`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Login failed:', errorText);
        alert('Login failed — check credentials or account approval');
        return;
      }

      const data = await res.json();
      localStorage.setItem('token', data.access_token);

      // Decode JWT payload
      const payload = JSON.parse(atob(data.access_token.split('.')[1]));
      setUser(payload);

      // Redirect based on role
      if (payload.role === 'admin') navigate('/admin');
      else if (payload.role === 'lecturer') navigate('/lecturer');
      else navigate('/student');
    } catch (err) {
      console.error('Login error:', err);
      alert('Login failed — check connection to backend');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 mt-20 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Login</h2>
      <form onSubmit={handle} className="space-y-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full p-2 border"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full p-2 border"
        />
        <button className="w-full bg-blue-600 text-white py-2 rounded">
          Login
        </button>
      </form>

      <div className="text-sm text-gray-600 mt-4 text-center">
        Don't have an account?{' '}
        <button
          onClick={() => navigate('/signup')}
          className="text-blue-600 hover:underline"
        >
          Sign up
        </button>
      </div>

      <div className="text-sm text-gray-500 mt-2">
        Seed accounts: admin@uni.edu/adminpass, lect1@uni.edu/lectpass1, student1@uni.edu/studpass1
      </div>
    </div>
  );
}
