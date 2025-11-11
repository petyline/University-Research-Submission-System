import React, { useState, useEffect } from 'react';
import CircularSimilarity from './CircularSimilarity'; // this is your round one

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('submissions'); // 'submissions' | 'pending' | 'users' | 'assign' | 'settings'
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

  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (activeTab === 'submissions') fetchSubs();
    else if (activeTab === 'pending') fetchPendingUsers();
    else if (activeTab === 'users') fetchAllUsers();
    else if (activeTab === 'assign') { fetchStudents(); fetchLecturers(); }
    else if (activeTab === 'settings') fetchSettings();
  }, [activeTab]);
  
  
  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings`, { headers: { Authorization: `Bearer ${token}` }});
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSettings(data);
    } catch (e) {
      console.error("Error loading settings:", e);
      alert("Failed to load settings");
    }
  };
  const saveSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          undergrad_mode: settings.undergrad_mode,
          postgrad_mode: settings.postgrad_mode
        })
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json();
      alert("Settings saved");
    } catch (e) {
      console.error("Save settings error:", e);
      alert("Failed to save settings");
    }
  };

  // -------------------- Fetchers --------------------
  const fetchSubs = async () => {
    try {
      const res = await fetch(`${API_URL}/submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setSubs(await res.json());
    } catch (err) {
      setError(err.message);
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
    }
  };

  const fetchAllUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setAllUsers(await res.json());
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchStudents = async () => {
    const res = await fetch(`${API_URL}/auth/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setStudents(data.filter(u => u.role === "student"));
  };

  const fetchLecturers = async () => {
    const res = await fetch(`${API_URL}/auth/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setLecturers(data.filter(u => u.role === "lecturer"));
  };

  // -------------------- Actions --------------------
  const approveUser = async (id, approve) => {
    try {
      const res = await fetch(`${API_URL}/auth/approve_user/${id}?approve=${approve}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      fetchPendingUsers();
      fetchAllUsers();
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const decideSubmission = async (id, decision) => {
    try {
      const res = await fetch(`${API_URL}/admin/decide_submission/${id}?decision=${decision}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      fetchSubs();
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const assignSupervisor = async () => {
    if (!selectedStudent || !selectedLecturer)
      return alert("Select both student and supervisor");

    try {
      const res = await fetch(`${API_URL}/admin/assign_supervisor`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: selectedStudent,
          supervisor_id: selectedLecturer,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to assign supervisor");
      alert(data.message);
      fetchStudents();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

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

  // -------------------- UI --------------------
  return (
    <div>
      <header className="sticky top-0 bg-white shadow p-4 flex justify-between items-center z-50">
        <h1 className="text-lg font-bold">Admin Dashboard</h1>
        <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={logout}>Logout</button>
      </header>

     <nav className="flex gap-2 p-4 border-b bg-gray-50">
        <button onClick={() => setActiveTab('submissions')} className={`px-3 py-1 rounded ${activeTab === 'submissions' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Submissions</button>
        <button onClick={() => setActiveTab('pending')} className={`px-3 py-1 rounded ${activeTab === 'pending' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Pending Users</button>
        <button onClick={() => setActiveTab('users')} className={`px-3 py-1 rounded ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'bg-white'}`}>All Users</button>
        <button onClick={() => setActiveTab('assign')} className={`px-3 py-1 rounded ${activeTab === 'assign' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Assign Supervisors</button>
        <button onClick={() => setActiveTab('settings')} className={`px-3 py-1 rounded ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Settings</button>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        {error && <div className="text-red-600 mb-4">{error}</div>}

        {/* Submissions Tab */}
        {activeTab === 'submissions' && (
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
              {subs.length === 0 ? (
                <tr><td colSpan="4" className="text-center p-4">No submissions</td></tr>
              ) : (
                subs.map(s => (
					  <tr
					    key={s.id}
					    className="border-b cursor-pointer hover:bg-blue-50 transition-colors"
					    onClick={() => openModal(s, 'submission')}
					  >
					    <td className="p-2 flex items-center gap-2">
					      {s.student ? `${s.student.name} (${s.student.reg_number})` : 'Unknown'}
					    </td>
					
					    <td className="p-2">
					      {s.supervisor ? `${s.supervisor.name}` : '-'}
					    </td>
					
					    <td className="p-2">
					      {s.proposal_type === 'Seminar' || s.proposal_type === 'Project'
					        ? 'Undergraduate'
					        : 'Postgraduate'}
					      {' '}({s.proposal_type})
					    </td>
					
					    <td className="p-2 text-center">
					      <div className="flex justify-center">
					        <CircularSimilarity score={Number(s.similarity_score || 0)} />
					      </div>
					    </td>
					
					    <td className="p-2">{s.lecturer_decision || '-'}</td>
					    <td className="p-2">{s.final_decision || '-'}</td>
					  </tr>
					))
              )}
            </tbody>
          </table>
        )}

        {/* Pending Users Tab */}
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
                  <tr
                    key={u.id}
                    className="border-b cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => openModal(u, 'user')}
                  >
                    <td className="p-2 flex items-center gap-2">
                      {u.name}
                      <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">Click to view</span>
                    </td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2">{u.reg_number || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* All Users Tab */}
        {activeTab === 'users' && (
          <table className="w-full border-collapse border border-gray-300">
            <thead><tr className="bg-gray-100">
              <th className="border p-2">Name</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Role</th>
              <th className="border p-2">Reg/Staff Number</th>
              <th className="border p-2">Approved</th>
            </tr></thead>
            <tbody>
              {allUsers.length === 0 ? (
                <tr><td colSpan="5" className="text-center p-4">No users</td></tr>
              ) : (
                allUsers.map(u => (
                  <tr
                    key={u.id}
                    className="border-b cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => openModal(u, 'user')}
                  >
                    <td className="p-2 flex items-center gap-2">
                      {u.name}
                      <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">Click to view</span>
                    </td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2">{u.reg_number || '-'}</td>
                    <td className="p-2">{u.is_approved ? 'Yes' : 'No'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* Assign Supervisor Tab */}
        {activeTab === "assign" && (
          <div className="max-w-lg mx-auto space-y-4">
            <h2 className="text-lg font-bold mb-2">Assign Supervisor to Student</h2>
            <select
              value={selectedStudent || ""}
              onChange={e => setSelectedStudent(Number(e.target.value))}
              className="w-full p-2 border rounded"
            >
              <option value="">Select Student</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.reg_number})</option>
              ))}
            </select>
            <select
              value={selectedLecturer || ""}
              onChange={e => setSelectedLecturer(Number(e.target.value))}
              className="w-full p-2 border rounded"
            >
              <option value="">Select Supervisor</option>
              {lecturers.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.email})</option>
              ))}
            </select>
            <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={assignSupervisor}>
              Assign
            </button>
          </div>
        )}
      </main>

	      {/* Shared Modal for User / Submission */}
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
                    <button
                      className="bg-green-500 text-white px-3 py-1 rounded"
                      onClick={() => approveUser(selectedUser.id, true)}
                    >
                      Approve
                    </button>
                  )}
                  <button
                    className="bg-red-500 text-white px-3 py-1 rounded"
                    onClick={() => approveUser(selectedUser.id, false)}
                  >
                    Reject
                  </button>
                  <button className="bg-gray-300 px-3 py-1 rounded" onClick={closeModal}>
                    Close
                  </button>
                </div>
              </>
            )}

            {modalType === 'submission' && selectedSubmission && (
              <>
                <h2 className="text-lg font-bold mb-4">Submission Details</h2>
                <p><strong>Title:</strong> {selectedSubmission.proposed_title}</p>
                <p><strong>Type:</strong> {selectedSubmission.proposal_type}</p>
                <p>
				  Similarity Score: {
					Number(selectedSubmission.similarity_score ?? 0).toFixed(2)
				  }
				</p>

                <p><strong>Lecturer Decision:</strong> {selectedSubmission.lecturer_decision}</p>
                <p><strong>Final Decision:</strong> {selectedSubmission.final_decision}</p>
                <div className="mt-4 flex justify-end gap-2">
                  {selectedSubmission.final_decision === 'pending' && (
                    <>
                      <button
                        className="bg-green-600 text-white px-3 py-1 rounded"
                        onClick={() => decideSubmission(selectedSubmission.id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        className="bg-red-600 text-white px-3 py-1 rounded"
                        onClick={() => decideSubmission(selectedSubmission.id, 'reject')}
                      >
                        Reject
                      </button>
					 <button
					  onClick={async () => {
						try {
						  const token = localStorage.getItem("token");
						  const response = await fetch(`${API_URL}/submission/${selectedSubmission.id}/pdf`, {
							headers: {
							  Authorization: `Bearer ${token}`
							}
						  });

						  if (!response.ok) throw new Error("Failed to fetch PDF");

						  const blob = await response.blob();
						  const url = window.URL.createObjectURL(blob);
						  window.open(url, "_blank");
						} catch (err) {
						  console.error(err);
						  alert("Unable to open PDF");
						}
					  }}
					  className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 ml-2"
					>
					  PDF
					</button>

                    </>
                  )}
                  <button className="bg-gray-300 px-3 py-1 rounded" onClick={closeModal}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="max-w-6xl mx-auto p-6">
          <div className="max-w-xl space-y-6">
            <h2 className="text-xl font-bold mb-2">Similarity Settings</h2>

            <div className="border rounded p-4">
              <h3 className="font-semibold mb-2">Undergraduate (Seminar / Project)</h3>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={settings.undergrad_mode === 'title'}
                    onChange={() => setSettings(s => ({ ...s, undergrad_mode: 'title' }))}
                  />
                  Title only
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={settings.undergrad_mode === 'title_plus'}
                    onChange={() => setSettings(s => ({ ...s, undergrad_mode: 'title_plus' }))}
                  />
                  Title + Other inputs
                </label>
              </div>
            </div>

            <div className="border rounded p-4">
              <h3 className="font-semibold mb-2">Postgraduate (Dissertation / Thesis)</h3>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={settings.postgrad_mode === 'title'}
                    onChange={() => setSettings(s => ({ ...s, postgrad_mode: 'title' }))}
                  />
                  Title only
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={settings.postgrad_mode === 'title_plus'}
                    onChange={() => setSettings(s => ({ ...s, postgrad_mode: 'title_plus' }))}
                  />
                  Title + Other inputs
                </label>
              </div>
            </div>

            <button
              onClick={saveSettings}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
