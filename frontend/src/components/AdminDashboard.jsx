// src/components/AdminDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import CircularSimilarity from './CircularSimilarity';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
  // Default tab is now 'dashboard'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'submissions' | 'pending' | 'users' | 'assign' | 'settings'
  const [subs, setSubs] = useState([]);
  const [students, setStudents] = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('user'); // 'user' | 'submission'
  const [error, setError] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedLecturer, setSelectedLecturer] = useState(null);
  const [settings, setSettings] = useState({ undergrad_mode: 'title', postgrad_mode: 'title_plus' });

  // Filters state for Submissions
  const [submissionFilter, setSubmissionFilter] = useState({
    category: null, // "Seminar"|"Project"|"Dissertation"|"Thesis" or null
    lecturerId: null // numeric id or null
  });

  // All users view filter for unassigned students
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  useEffect(() => {
    // When the tab changes, load the required data
    if (activeTab === 'submissions') fetchSubs();
    else if (activeTab === 'pending') fetchPendingUsers();
    else if (activeTab === 'users') fetchAllUsers();
    else if (activeTab === 'assign') { fetchStudents(); fetchLecturers(); }
    else if (activeTab === 'settings') fetchSettings();
    else if (activeTab === 'dashboard') {
      // load everything important for dashboard
      Promise.all([fetchSubs(), fetchAllUsers(), fetchStudents(), fetchLecturers()]).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ---------- Fetchers ----------
  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings`, { headers: { Authorization: `Bearer ${token}` }});
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSettings(data);
    } catch (e) {
      console.error("Error loading settings:", e);
      toast.error("Failed to load settings");
    }
  };

  const fetchSubs = async () => {
    try {
      const res = await fetch(`${API_URL}/submissions`, { headers: { Authorization: `Bearer ${token}` }});
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSubs(data);
    } catch (err) {
      setError(err.message);
      toast.error("Unable to load submissions");
    }
  };

  const fetchPendingUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/pending_approvals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setPendingUsers(await res.json());
    } catch (err) {
      setError(err.message);
      toast.error("Failed to load pending users");
    }
  };

  const fetchAllUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/users`, { headers: { Authorization: `Bearer ${token}` }});
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAllUsers(data);
    } catch (err) {
      setError(err.message);
      toast.error("Failed to load users");
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/users`, { headers: { Authorization: `Bearer ${token}` }});
      const data = await res.json();
      setStudents(data.filter(u => u.role === "student"));
    } catch (err) {
      toast.error("Failed to fetch students");
    }
  };

  const fetchLecturers = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/users`, { headers: { Authorization: `Bearer ${token}` }});
      const data = await res.json();
      setLecturers(data.filter(u => u.role === "lecturer"));
    } catch (err) {
      toast.error("Failed to fetch lecturers");
    }
  };

  // ---------- Actions ----------
  const approveUser = async (id, approve) => {
    try {
      const res = await fetch(`${API_URL}/auth/approve_user/${id}?approve=${approve}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());

      toast.success(approve ? "User approved" : "User rejected");
      await fetchPendingUsers();
      await fetchAllUsers();
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
      toast.error("Operation failed: " + err.message);
    }
  };

  const decideSubmission = async (id, decision) => {
    try {
      const res = await fetch(`${API_URL}/admin/decide_submission/${id}?decision=${decision}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());

      toast.success(decision === 'approve' ? "Submission approved" : "Submission rejected");
      await fetchSubs();
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
      toast.error("Failed to update submission: " + (err.message || ""));
    }
  };

  const assignSupervisor = async () => {
    if (!selectedStudent || !selectedLecturer) return toast.error("Select both student and supervisor");

    try {
      const res = await fetch(`${API_URL}/admin/assign_supervisor`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ student_id: selectedStudent, supervisor_id: selectedLecturer }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to assign supervisor");

      toast.success(data.message);
      fetchStudents();
    } catch (err) {
      toast.error("Assign failed: " + err.message);
    }
  };

  const resetPassword = async (id) => {
    try {
      const res = await fetch(`${API_URL}/auth/reset_password/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed reset");
      toast.success("Password reset to 1234567");
    } catch (err) {
      toast.error("Reset failed: " + err.message);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  // ---------- Derived / UI helpers ----------
  // Counts by category for dashboard
  const counts = useMemo(() => {
    const c = { Seminar: 0, Project: 0, Dissertation: 0, Thesis: 0, totalStudents: 0, totalLecturers: 0, totalUsers: 0 };
    subs.forEach(s => {
      if (s.proposal_type) {
        if (c[s.proposal_type] !== undefined) c[s.proposal_type] += 1;
      }
    });
    c.totalStudents = students.length;
    c.totalLecturers = lecturers.length;
    c.totalUsers = allUsers.length;
    return c;
  }, [subs, students, lecturers, allUsers]);

  // Apply submissionFilter to subs when showing submissions tab
  const filteredSubs = useMemo(() => {
    return subs.filter(s => {
      if (submissionFilter.category && s.proposal_type !== submissionFilter.category) return false;
      if (submissionFilter.lecturerId && Number(s.supervisor?.id) !== Number(submissionFilter.lecturerId)) return false;
      return true;
    });
  }, [subs, submissionFilter]);

  // All users view filtered by unassigned students
  const displayedUsers = useMemo(() => {
    if (!showUnassignedOnly) return allUsers;
    // show only students with no assigned supervisor
    return allUsers.filter(u => u.role === 'student' && (!u.supervisors || u.supervisors.length === 0));
  }, [allUsers, showUnassignedOnly]);

  const openModal = (item, type) => {
    setModalType(type);
    if (type === 'user') setSelectedUser(item);
    else setSelectedSubmission(item);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedUser(null);
    setSelectedSubmission(null);
  };

  // When clicking a category card on dashboard -> switch to submissions and apply filter
  const gotoSubmissionsForCategory = (category) => {
    setSubmissionFilter({ category, lecturerId: null });
    setActiveTab('submissions');
  };

  // Clear submission filters UI
  const clearSubmissionFilter = () => {
    setSubmissionFilter({ category: null, lecturerId: null });
    toast.success("Submission filter cleared");
  };

  // Lecturer details opens new page (user asked for this)
  const openLecturerPage = (lecturerId) => {
    // navigate to a new route - implement that page separately
    navigate(`/lecturer/${lecturerId}`);
  };

  // ---------- UI ----------
  return (
    <div>
      <header className="sticky top-0 bg-white shadow p-4 flex justify-between items-center z-50">
        <h1 className="text-lg font-bold">Admin Dashboard</h1>
        <div className="flex gap-2 items-center">
          <button className="bg-gray-200 px-3 py-1 rounded" onClick={() => { setActiveTab('dashboard'); toast.dismiss(); }}>Dashboard</button>
          <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={logout}>Logout</button>
        </div>
      </header>

      <nav className="flex gap-2 p-4 border-b bg-gray-50">
        <button onClick={() => setActiveTab('dashboard')} className={`px-3 py-1 rounded ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Dashboard</button>
        <button onClick={() => setActiveTab('submissions')} className={`px-3 py-1 rounded ${activeTab === 'submissions' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Submissions</button>
        <button onClick={() => setActiveTab('pending')} className={`px-3 py-1 rounded ${activeTab === 'pending' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Pending Users</button>
        <button onClick={() => setActiveTab('users')} className={`px-3 py-1 rounded ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'bg-white'}`}>All Users</button>
        <button onClick={() => setActiveTab('assign')} className={`px-3 py-1 rounded ${activeTab === 'assign' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Assign Supervisors</button>
        <button onClick={() => setActiveTab('settings')} className={`px-3 py-1 rounded ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Settings</button>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        {error && <div className="text-red-600 mb-4">{error}</div>}

        {/* ---------- Dashboard Tab (NEW) ---------- */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded shadow">
              <h3 className="font-semibold">Students in system</h3>
              <div className="text-2xl mt-2">{counts.totalStudents}</div>
            </div>

            <div className="p-4 bg-white rounded shadow">
              <h3 className="font-semibold">Lecturers in system</h3>
              <div className="text-2xl mt-2">{counts.totalLecturers}</div>
            </div>

            <div className="p-4 bg-white rounded shadow">
              <h3 className="font-semibold">Total users</h3>
              <div className="text-2xl mt-2">{counts.totalUsers}</div>
            </div>

            {/* Category cards */}
            <div className="col-span-1 md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {['Seminar','Project','Dissertation','Thesis'].map(cat => (
                <button
                  key={cat}
                  onClick={() => gotoSubmissionsForCategory(cat)}
                  className="p-4 bg-white rounded shadow text-left hover:bg-blue-50"
                >
                  <div className="text-sm font-medium">{cat}</div>
                  <div className="text-2xl font-bold mt-2">{counts[cat] || 0}</div>
                  <div className="text-xs text-gray-500 mt-1">Click to view {cat} submissions</div>
                </button>
              ))}
            </div>

            {/* Optionally: quick list of lecturers with counts */}
            <div className="col-span-1 md:col-span-3 mt-4 bg-white rounded p-4 shadow">
              <h3 className="font-semibold mb-2">Lecturers (click to open details)</h3>
              <div className="space-y-2">
                {lecturers.length === 0 ? <div className="text-sm text-gray-500">No lecturers</div> :
                  lecturers.map(l => {
                    // compute counts per lecturer quickly (client-side)
                    const byLect = subs.filter(s => s.supervisor?.id === l.id);
                    return (
                      <div key={l.id} className="flex justify-between items-center border-b py-2">
                        <div>
                          <button className="text-blue-600 hover:underline" onClick={() => openLecturerPage(l.id)}>{l.name}</button>
                          <div className="text-xs text-gray-500">Email: {l.email}</div>
                        </div>
                        <div className="text-xs text-right">
                          <div>Seminar: {byLect.filter(x => x.proposal_type === 'Seminar').length}</div>
                          <div>Project: {byLect.filter(x => x.proposal_type === 'Project').length}</div>
                          <div>Dissertation: {byLect.filter(x => x.proposal_type === 'Dissertation').length}</div>
                          <div>Thesis: {byLect.filter(x => x.proposal_type === 'Thesis').length}</div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>
        )}

        {/* ---------- Submissions Tab ---------- */}
        {activeTab === 'submissions' && (
          <>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">Student Submissions</h2>
              <div className="flex gap-2 items-center">
                { (submissionFilter.category || submissionFilter.lecturerId) && (
                  <button className="px-3 py-1 rounded bg-gray-200" onClick={clearSubmissionFilter}>Clear Filter</button>
                )}
              </div>
            </div>

            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2">Student</th>
                  <th className="border p-2">Supervisor</th>
                  <th className="border p-2">Type</th>
                  <th className="border p-2">Similarity</th>
                  <th className="border p-2">Lecturer Decision</th>
                  <th className="border p-2">Final Decision</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.length === 0 ? (
                  <tr><td colSpan="6" className="text-center p-4">No submissions</td></tr>
                ) : (
                  filteredSubs.map(s => (
                    <tr key={s.id} className="border-b cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => openModal(s, 'submission')}>
                      <td className="p-2">{s.student ? `${s.student.name} (${s.student.reg_number})` : 'Unknown'}</td>
                      <td className="p-2">{s.supervisor ? `${s.supervisor.name}` : '-'}</td>
                      <td className="p-2">{s.proposal_type} </td>
                      <td className="p-2 text-center"><div className="flex justify-center"><CircularSimilarity value={s.similarity_score} /></div></td>
                      <td className="p-2">{s.lecturer_decision || '-'}</td>
                      <td className="p-2">{s.final_decision || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}

        {/* ---------- Pending Users Tab ---------- */}
        {activeTab === 'pending' && (
          <table className="w-full border-collapse border border-gray-300">
            <thead><tr className="bg-gray-100">
              <th className="border p-2">Name</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Role</th>
              <th className="border p-2">Reg/Staff Number</th>
            </tr></thead>
            <tbody>
              {pendingUsers.length === 0 ? (
                <tr><td colSpan="4" className="text-center p-4">No pending users</td></tr>
              ) : (
                pendingUsers.map(u => (
                  <tr key={u.id} className="border-b cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => openModal(u, 'user')}>
                    <td className="p-2">{u.name}<span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">Click to view</span></td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2">{u.reg_number || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ---------- All Users Tab (with Unassigned filter) ---------- */}
        {activeTab === 'users' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold">All Users</h2>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showUnassignedOnly} onChange={(e) => setShowUnassignedOnly(e.target.checked)} />
                  Show unassigned students only
                </label>
                <button className="px-3 py-1 rounded bg-gray-200" onClick={() => { setShowUnassignedOnly(false); toast.success('Filter cleared'); }}>Clear</button>
              </div>
            </div>

            <table className="w-full border-collapse border border-gray-300">
              <thead><tr className="bg-gray-100">
                <th className="border p-2">Name</th>
                <th className="border p-2">Email</th>
                <th className="border p-2">Role</th>
                <th className="border p-2">Reg/Staff Number</th>
                <th className="border p-2">Supervisor</th>
                <th className="border p-2">Approved</th>
              </tr></thead>
              <tbody>
                {displayedUsers.length === 0 ? (
                  <tr><td colSpan="6" className="text-center p-4">No users</td></tr>
                ) : (
                  displayedUsers.map(u => (
                    <tr key={u.id} className="border-b cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => openModal(u, 'user')}>
                      <td className="p-2">{u.name}</td>
                      <td className="p-2">{u.email}</td>
                      <td className="p-2">{u.role}</td>
                      <td className="p-2">{u.reg_number || '-'}</td>
                      <td className="p-2">{u.role === "student" ? (u.supervisors?.length > 0 ? u.supervisors.map(sup => sup.name).join(", ") : <span className="text-red-600">None</span>) : "-"}</td>
                      <td className="p-2">{u.is_approved ? 'Yes' : 'No'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}

        {/* ---------- Assign Tab ---------- */}
        {activeTab === "assign" && (
          <div className="max-w-lg mx-auto space-y-4">
            <h2 className="text-lg font-bold mb-2">Assign Supervisor to Student</h2>

            <input type="text" placeholder="Search student by name or reg number" className="w-full p-2 border rounded"
              onChange={(e) => {
                const q = e.target.value.toLowerCase();
                setStudents(prev => prev.map(st => ({ ...st, hidden: !(st.name.toLowerCase().includes(q) || (st.reg_number || "").toLowerCase().includes(q)) })));
              }} />

            <select value={selectedStudent || ""} onChange={e => setSelectedStudent(Number(e.target.value))} className="w-full p-2 border rounded">
              <option value="">Select Student</option>
              {students.filter(s => !s.hidden).map(s => <option key={s.id} value={s.id}>{s.name} ({s.reg_number})</option>)}
            </select>

            <select value={selectedLecturer || ""} onChange={e => setSelectedLecturer(Number(e.target.value))} className="w-full p-2 border rounded">
              <option value="">Select Supervisor</option>
              {lecturers.map(l => <option key={l.id} value={l.id}>{l.name} ({l.email})</option>)}
            </select>

            <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={assignSupervisor}>Assign</button>
          </div>
        )}

        {/* ---------- Shared Modal ---------- */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded p-6 w-[480px] shadow-lg">
              {modalType === 'user' && selectedUser && (
                <>
                  <h2 className="text-lg font-bold mb-4">User Details</h2>
                  <p><strong>Name:</strong> {selectedUser.name}</p>
                  <p><strong>Email:</strong> {selectedUser.email}</p>
                  <p><strong>Role:</strong> {selectedUser.role}</p>
                  <p><strong>Reg/Staff Number:</strong> {selectedUser.reg_number || '-'}</p>
                  <p><strong>Approved:</strong> {selectedUser.is_approved ? 'Yes' : 'No'}</p>
                  <div className="mt-4 flex justify-end gap-2">
                    {!selectedUser.is_approved && (
                      <button className="bg-green-500 text-white px-3 py-1 rounded" onClick={() => approveUser(selectedUser.id, true)}>Approve</button>
                    )}
                    <button className="bg-red-500 text-white px-3 py-1 rounded" onClick={() => approveUser(selectedUser.id, false)}>Reject</button>
                    <button className="bg-purple-600 text-white px-3 py-1 rounded" onClick={() => resetPassword(selectedUser.id)}>Reset Password</button>
                    <button className="bg-gray-300 px-3 py-1 rounded" onClick={closeModal}>Close</button>
                  </div>
                </>
              )}

              {modalType === 'submission' && selectedSubmission && (
                <>
                  <h2 className="text-lg font-bold mb-4">Submission Details</h2>
                  <p><strong>Title:</strong> {selectedSubmission.proposed_title}</p>
                  <p><strong>Type:</strong> {selectedSubmission.proposal_type}</p>
                  <p>Similarity Score: {Number(selectedSubmission.similarity_score ?? 0).toFixed(2)}</p>
                  <p><strong>Lecturer Decision:</strong> {selectedSubmission.lecturer_decision}</p>
                  <p><strong>Final Decision:</strong> {selectedSubmission.final_decision}</p>
                  <div className="mt-4 flex justify-end gap-2">
                    {selectedSubmission.final_decision === 'pending' && (
                      <>
                        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={() => decideSubmission(selectedSubmission.id, 'approve')}>Approve</button>
                        <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={() => decideSubmission(selectedSubmission.id, 'reject')}>Reject</button>
                        <button onClick={async () => {
                          try {
                            const token = localStorage.getItem("token");
                            const response = await fetch(`${API_URL}/submission/${selectedSubmission.id}/pdf`, {
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            if (!response.ok) throw new Error("Failed to fetch PDF");
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            window.open(url, "_blank");
                          } catch (err) {
                            console.error(err);
                            toast.error("Unable to open PDF");
                          }
                        }} className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 ml-2">PDF</button>
                      </>
                    )}
                    <button className="bg-gray-300 px-3 py-1 rounded" onClick={closeModal}>Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---------- Settings Tab ---------- */}
        {activeTab === 'settings' && (
          <div className="max-w-6xl mx-auto p-6">
            <div className="max-w-xl space-y-6">
              <h2 className="text-xl font-bold mb-2">Similarity Settings</h2>

              <div className="border rounded p-4">
                <h3 className="font-semibold mb-2">Undergraduate (Seminar / Project)</h3>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={settings.undergrad_mode === 'title'} onChange={() => setSettings(s => ({ ...s, undergrad_mode: 'title' }))} />
                    Title only
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={settings.undergrad_mode === 'title_plus'} onChange={() => setSettings(s => ({ ...s, undergrad_mode: 'title_plus' }))} />
                    Title + Other inputs
                  </label>
                </div>
              </div>

              <div className="border rounded p-4">
                <h3 className="font-semibold mb-2">Postgraduate (Dissertation / Thesis)</h3>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={settings.postgrad_mode === 'title'} onChange={() => setSettings(s => ({ ...s, postgrad_mode: 'title' }))} />
                    Title only
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={settings.postgrad_mode === 'title_plus'} onChange={() => setSettings(s => ({ ...s, postgrad_mode: 'title_plus' }))} />
                    Title + Other inputs
                  </label>
                </div>
              </div>

              <div className="border rounded p-4">
                <h3 className="font-semibold mb-2">Submission Limit</h3>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.allow_multiple_submissions} onChange={(e) => setSettings(s => ({ ...s, allow_multiple_submissions: e.target.checked }))} />
                  Allow multiple submissions per student (Seminar/Project)
                </label>
              </div>

              <button onClick={async () => {
                // saveSettings wrapper to call the existing function defined above
                try {
                  await saveSettings();
                } catch (err) {
                  // saveSettings already shows toasts
                }
              }} className="bg-blue-600 text-white px-4 py-2 rounded">Save Settings</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
