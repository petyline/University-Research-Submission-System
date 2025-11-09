import React, { useState, useEffect } from 'react';
import SimilarityMeter from './SimilarityMeter';
import { useNavigate } from 'react-router-dom';

export default function LecturerPanel({ user, setUser }) {
  const [subs, setSubs] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

  const fetchSubs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch submissions");
      const data = await res.json();
      setSubs(data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch submissions");
    }
  };

  useEffect(() => { fetchSubs(); }, []);

  const decide = async (id, decision) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/lecturer/decision/${id}?decision=${decision}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to send decision');
      fetchSubs();
      if (modalOpen) closeModal();
    } catch (err) {
      console.error(err);
      alert('Failed to submit decision. Check console.');
    }
  };

  const openModal = (submission) => {
    setSelectedSub(submission);
    setModalOpen(true);
  };

  const closeModal = () => {
    setSelectedSub(null);
    setModalOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/', { replace: true });
  };

  // Highlight function: splits text by sentences and highlights some proportion
  const highlightText = (text, score) => {
    if (!text) return '';
    const sentences = text.split(/(?<=[.!?])/); // split by punctuation
    const highlightCount = Math.ceil((score / 100) * sentences.length);
    return sentences.map((s, idx) => (
      <span key={idx} style={{ backgroundColor: idx < highlightCount ? '#fca5a5' : 'transparent' }}>
        {s}{" "}
      </span>
    ));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white shadow flex justify-between items-center px-6 py-3 border-b">
        <h1 className="text-lg font-bold text-blue-700">Lecturer Dashboard</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">👤 {user?.name || 'Lecturer'}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Table */}
      <main className="max-w-6xl mx-auto p-6 mt-10">
        {error && <div className="text-red-600 mb-4">{error}</div>}
        <h2 className="text-xl font-bold mb-4 text-gray-800">Student Submissions</h2>

        {subs.length === 0 ? (
          <p className="text-gray-500 text-sm">No submissions available.</p>
        ) : (
          <table className="w-full border text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border">Student</th>
                <th className="p-2 border">Proposal Title</th>
                <th className="p-2 border">Similarity</th>
                <th className="p-2 border text-center">Decision</th>
                <th className="p-2 border text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 border-b">
                  <td className="p-2 border">{s.student?.name} ({s.student?.reg_number})</td>
                  <td className="p-2 border">{s.proposed_title}</td>
                  <td className="p-2 border" style={{ width: 240 }}>
                    <SimilarityMeter score={s.similarity_score} />
                  </td>
                  <td className="p-2 border text-center">{s.final_decision || '-'}</td>
                  <td className="p-2 border text-center">
                    <button
                      className="bg-blue-500 text-white px-3 py-1 rounded"
                      onClick={() => openModal(s)}
                    >
                      View Proposal
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>

      {/* Modal with Highlights */}
      {modalOpen && selectedSub && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full relative overflow-y-auto max-h-[90vh]">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
              onClick={closeModal}
            >
              ✕
            </button>
            <h2 className="text-lg font-bold mb-4">{selectedSub.proposed_title}</h2>
            <p><b>Background:</b> {highlightText(selectedSub.background, selectedSub.similarity_score)}</p>
            <p><b>Aim:</b> {highlightText(selectedSub.aim, selectedSub.similarity_score)}</p>
            <p><b>Objectives:</b> {highlightText(selectedSub.objectives, selectedSub.similarity_score)}</p>
            <p><b>Methods:</b> {highlightText(selectedSub.methods, selectedSub.similarity_score)}</p>
            <p><b>Expected Results:</b> {highlightText(selectedSub.expected_results, selectedSub.similarity_score)}</p>
            <p><b>Literature Review:</b> {highlightText(selectedSub.literature_review, selectedSub.similarity_score)}</p>
            <div className="mt-4 flex gap-2">
              {selectedSub.final_decision ? (
                <b>{selectedSub.final_decision}</b>
              ) : (
                <>
                  <button
                    className="bg-green-500 text-white px-3 py-1 rounded"
                    onClick={() => decide(selectedSub.id, 'approved')}
                  >
                    Approve
                  </button>
                  <button
                    className="bg-red-500 text-white px-3 py-1 rounded"
                    onClick={() => decide(selectedSub.id, 'rejected')}
                  >
                    Reject
                  </button>
				  <button
					  onClick={() =>
						window.open(`${API_URL}/submission/${selectedSub.id}/pdf?token=${localStorage.getItem("token")}`, "_blank")
					  }
					  className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 ml-2"
					>
					  PDF
					</button>

                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
