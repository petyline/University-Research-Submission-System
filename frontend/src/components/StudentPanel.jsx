// src/components/StudentPanel.jsx
import ChangePassword from "./ChangePassword";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function StudentPanel({ user, setUser }) {
  const [proposalType, setProposalType] = useState("Seminar – Undergraduate");
  const [title, setTitle] = useState("");
  const [background, setBackground] = useState("");
  const [aim, setAim] = useState("");
  const [objectives, setObjectives] = useState("");
  const [methods, setMethods] = useState("");
  const [expectedResults, setExpectedResults] = useState("");
  const [literatureReview, setLiteratureReview] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState("submissions"); // add 'password' as possible tab later
  const [showMenu, setShowMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [supervisor, setSupervisor] = useState(null);



  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
  const student_id = user?.id;
  const token = localStorage.getItem("token");

  const toBackendEnum = (label) => {
    if (label.startsWith("Seminar")) return "Seminar";
    if (label.startsWith("Project")) return "Project";
    if (label.startsWith("Dissertation")) return "Dissertation";
    if (label.startsWith("Thesis")) return "Thesis";
    return "Seminar";
  };

  useEffect(() => {
    // Fetch Supervisor
    const fetchSupervisor = async () => {
      try {
        const res = await fetch(`${API_URL}/student_supervisor/${student_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
    
        if (res.ok) {
          const data = await res.json();
          setSupervisor(data);   // expected: {name, email, department}
        } else {
          setSupervisor(null);
        }
      } catch (err) {
        console.error("Supervisor fetch error:", err);
      }
    };

    const fetchSubmissions = async () => {
      try {
        const res = await fetch(`${API_URL}/student_submissions/${student_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch proposals");
        const data = await res.json();
        setSubmissions(data);
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };
    if (student_id) fetchSubmissions(); fetchSupervisor();
  }, [student_id, API_URL, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const required = [title, background, aim, objectives, methods, expectedResults, literatureReview];
    if (required.some((v) => !v || !v.trim())) {
      alert("❌ Please fill in all fields.");
      return;
    }

    const payload = {
      student_id,
      proposal_type: toBackendEnum(proposalType),
      proposed_title: title,
      background,
      aim,
      objectives,
      methods,
      expected_results: expectedResults,
      literature_review: literatureReview,
    };

    try {
      const endpoint = editingId ? `${API_URL}/update_submission/${editingId}` : `${API_URL}/submit`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text();
        console.error("Backend response:", t);
        alert("❌ Submission failed — check console.");
        return;
      }

      const data = await res.json();
      alert(
        editingId
          ? "✅ Proposal updated successfully!"
          : `✅ Submitted successfully! Similarity: ${data.similarity_score || data.similarity}%`
      );

      setEditingId(null);
      setTitle(""); setBackground(""); setAim(""); setObjectives(""); setMethods(""); setExpectedResults(""); setLiteratureReview("");

      const refreshed = await fetch(`${API_URL}/student_submissions/${student_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (refreshed.ok) setSubmissions(await refreshed.json());
    } catch (err) {
      console.error("Submit error:", err);
      alert("❌ Failed to connect to backend.");
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    // map backend enum back to label (display only)
    const label =
      item.proposal_type === "Seminar" ? "Seminar – Undergraduate" :
      item.proposal_type === "Project" ? "Project – Undergraduate" :
      item.proposal_type === "Dissertation" ? "Dissertation – Postgraduate" :
      "Thesis – Postgraduate";
    setProposalType(label);
    setTitle(item.proposed_title);
    setBackground(item.background || "");
    setAim(item.aim || "");
    setObjectives(item.objectives || "");
    setMethods(item.methods || "");
    setExpectedResults(item.expected_results || "");
    setLiteratureReview(item.literature_review || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleView = (item) => {
    setSelectedSubmission(item);
    setShowModal(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
    navigate("/", { replace: true });
  };

  // Same proportional sentence-highlighting as LecturerPanel
  const highlightText = (text, score) => {
    if (!text) return '';
    const sentences = text.split(/(?<=[.!?])/);
    const highlightCount = Math.ceil(((score || 0) / 100) * sentences.length);
    return sentences.map((s, idx) => (
      <span key={idx} style={{ backgroundColor: idx < highlightCount ? '#fde2e2' : 'transparent' }}>
        {s}{" "}
      </span>
    ));
  };

  const statusBadge = (status) => {
    const s = (status || "pending").toLowerCase();
    const cls =
      s.includes("approved") ? "bg-green-100 text-green-800" :
      s.includes("rejected") ? "bg-red-100 text-red-800" :
      "bg-yellow-100 text-yellow-800";
    const label =
      s === "approved" ? "Approved" :
      s === "rejected" ? "Rejected" :
      "Pending Review";
    return <span className={`px-2 py-1 text-xs font-semibold rounded ${cls}`}>{label}</span>;
  };

  const SimilarityMeter = ({ value }) => {
    const percent = Math.max(0, Math.min(100, value || 0));
    const color =
      percent >= 75 ? "stroke-red-500" :
      percent >= 50 ? "stroke-yellow-500" :
      "stroke-green-500";
    return (
      <div className="relative w-12 h-12">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="24" cy="24" r="20" className="stroke-gray-200" strokeWidth="4" fill="none" />
          <circle
            cx="24" cy="24" r="20"
            className={`${color}`}
            strokeWidth="4" fill="none"
            strokeDasharray={`${(percent / 100) * 125.6} 125.6`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700">
          {percent}%
        </div>
      </div>
    );
  };

return (
  <div className="min-h-screen bg-gray-50">

    {/* Header */}
    <header className="sticky top-0 z-10 bg-white shadow flex justify-between items-center px-6 py-3 border-b">
      <h1 className="text-lg font-bold text-blue-700">Student Dashboard</h1>

      <div className="flex items-center gap-4 text-sm relative">

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 transition"
          >
            👤 {user?.name || "Student"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-4 h-4 transform transition-transform ${
                showMenu ? "rotate-180" : "rotate-0"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-md z-50">
              <button
                onClick={() => setShowPasswordModal(true)}
                className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100"
              >
                Change Password
              </button>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* New Proposal */}
        <button
          onClick={() => {
            setEditingId(null);
            setTitle("");
            setBackground("");
            setAim("");
            setObjectives("");
            setMethods("");
            setExpectedResults("");
            setLiteratureReview("");
          }}
          className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
        >
          New Proposal
        </button>
      </div>
    </header>
    {/* Supervisor Info Panel */}
    <section className="max-w-3xl mx-auto mt-6 p-4 bg-white rounded-lg shadow border">
      <h2 className="text-lg font-semibold text-blue-700 mb-2">Assigned Supervisor</h2>
    
      {supervisor ? (
        <div className="space-y-1 text-gray-700">
          <p><strong>Name:</strong> {supervisor.name}</p>
          <p><strong>Email:</strong> {supervisor.email}</p>
          <p><strong>Department:</strong> {supervisor.department}</p>
          <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs rounded">
            Assigned
          </span>
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          No supervisor assigned yet.
          <span className="ml-2 inline-block px-3 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
            Pending Assignment
          </span>
        </div>
      )}
    </section>

    {/* Form */}
    <main className="max-w-3xl mx-auto p-6 bg-white rounded shadow mt-10">
      <h2 className="text-xl font-bold mb-4 text-gray-800">
        {editingId ? "Edit Proposal" : "Submit New Proposal"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          Proposal Type
          <select
            value={proposalType}
            onChange={(e) => setProposalType(e.target.value)}
            className="w-full p-2 border rounded mt-1"
          >
            <option>Seminar – Undergraduate</option>
            <option>Project – Undergraduate</option>
            <option>Dissertation – Postgraduate</option>
            <option>Thesis – Postgraduate</option>
          </select>
        </label>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Proposed Title"
          className="w-full p-2 border rounded"
          required
        />

        <textarea value={background} onChange={(e) => setBackground(e.target.value)} placeholder="Background" className="w-full p-2 border rounded" required />
        <textarea value={aim} onChange={(e) => setAim(e.target.value)} placeholder="Aim" className="w-full p-2 border rounded" required />
        <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} placeholder="Objectives" className="w-full p-2 border rounded" required />
        <textarea value={methods} onChange={(e) => setMethods(e.target.value)} placeholder="Methods" className="w-full p-2 border rounded" required />
        <textarea value={expectedResults} onChange={(e) => setExpectedResults(e.target.value)} placeholder="Expected Results" className="w-full p-2 border rounded" required />
        <textarea value={literatureReview} onChange={(e) => setLiteratureReview(e.target.value)} placeholder="Literature Review (150–300 words)" className="w-full p-2 border rounded h-32" required />

        <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
          {editingId ? "Update Proposal" : "Submit Proposal"}
        </button>
      </form>
    </main>

    {/* Submissions Table */}
    <section className="max-w-5xl mx-auto mt-8 bg-white rounded shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">My Submitted Proposals</h3>

      {submissions.length === 0 ? (
        <p className="text-gray-500 text-sm">No proposals submitted yet.</p>
      ) : (
        <table className="w-full text-sm border border-gray-200">
          <thead>
            <tr className="bg-gray-100 text-left text-gray-700">
              <th className="p-2 border">Type</th>
              <th className="p-2 border">Title</th>
              <th className="p-2 border text-center">Similarity</th>
              <th className="p-2 border text-center">Status</th>
              <th className="p-2 border text-center">Action</th>
            </tr>
          </thead>

          <tbody>
            {submissions.map((item) => (
              <tr key={item.id} className="hover:bg-blue-50 transition">
                <td className="p-2 border">{item.proposal_type}</td>
                <td className="p-2 border">{item.proposed_title}</td>
                <td className="p-2 border text-center">
                  <SimilarityMeter value={item.similarity_score || 0} />
                </td>
                <td className="p-2 border text-center">
                  {statusBadge(item.final_decision || "pending")}
                </td>
                <td className="p-2 border text-center space-x-3">
                  <button onClick={() => handleView(item)} className="text-green-600 hover:underline">View</button>
                  <button onClick={() => handleEdit(item)} className="text-blue-600 hover:underline">Edit</button>
                  <button
                    onClick={() =>
                      window.open(`${API_URL}/submission/${item.id}/pdf?token=${token}`, "_blank")
                    }
                    className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
                  >
                    Download PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>

    {/* View Submission Modal */}
    {showModal && selectedSubmission && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-3xl w-full relative overflow-y-auto max-h-[85vh]">
          <button onClick={() => setShowModal(false)} className="absolute top-2 right-3 text-gray-600 hover:text-black">✕</button>

          <h3 className="text-lg font-semibold mb-3 text-gray-800">
            {selectedSubmission.proposed_title}
          </h3>

          <div className="space-y-4 text-sm text-gray-700">
            {[
              ["Background", selectedSubmission.background],
              ["Aim", selectedSubmission.aim],
              ["Objectives", selectedSubmission.objectives],
              ["Methods", selectedSubmission.methods],
              ["Expected Results", selectedSubmission.expected_results],
              ["Literature Review", selectedSubmission.literature_review],
            ].map(([label, content]) => (
              <div key={label}>
                <h4 className="font-semibold text-blue-700 mb-1">{label}</h4>
                <div className="bg-gray-50 border rounded p-2">
                  {highlightText(content || "", selectedSubmission.similarity_score || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* Change Password Modal */}
    {showPasswordModal && (
      <div
        className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowPasswordModal(false);
        }}
      >
        <div className="bg-white rounded-lg shadow-lg p-6 w-96 relative">
          <button
            onClick={() => setShowPasswordModal(false)}
            className="absolute top-2 right-3 text-gray-500 hover:text-black"
          >
            ✕
          </button>

          <ChangePassword API_URL={API_URL} token={token} />
        </div>
      </div>
    )}

  </div>
);
}
