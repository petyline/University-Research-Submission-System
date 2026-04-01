import React, { useState, useEffect } from 'react';
import SimilarityMeter from './SimilarityMeter';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export default function LecturerPanel({ user, setUser }) {
  const [subs, setSubs] = useState([]);
  const [filteredSubs, setFilteredSubs] = useState([]);   // ⭐ NEW ⭐
  const [filterType, setFilterType] = useState("all");    // ⭐ NEW ⭐

  const [selectedSub, setSelectedSub] = useState(null);
  const [decisionModal, setDecisionModal] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState(null);
  const [caInputs, setCaInputs] = useState({});

  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

  // Fetch submissions
  const fetchSubs = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/submissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed to fetch submissions");

      const data = await res.json();
      setSubs(data);
      applyFilter(data, filterType);   // ⭐ NEW ⭐

      // ⭐ NEW — preload CA values into input state
      const initialCA = {};
      data.forEach(s => {
        initialCA[s.id] = s.ca_score ?? "";
      });
      setCaInputs(initialCA);
    } catch (err) {
      toast.error("Failed to fetch submissions");
      setError("Failed to fetch submissions");
    }
  };

  useEffect(() => { fetchSubs(); }, []);

  // ⭐ NEW ⭐ — Filter Logic
  const applyFilter = (all, type) => {
    if (type === "seminar") {
      setFilteredSubs(all.filter(s => s.proposal_type === "Seminar"));
    } else if (type === "project") {
      setFilteredSubs(all.filter(s => s.proposal_type === "Project"));
    } else {
      setFilteredSubs(all);
    }
  };

  // ⭐ NEW ⭐ — Filter Buttons Handler
  const handleFilterChange = (type) => {
    setFilterType(type);
    applyFilter(subs, type);
  };

  const decide = async (id, decision) => {
    const toastId = toast.loading("Processing...");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/lecturer/decision/${id}?decision=${decision}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const msg = await res.text();
        toast.error(msg, { id: toastId });
        return;
      }

      toast.success(
        decision === "approved" ? "Proposal approved!" : "Proposal rejected!",
        { id: toastId }
      );

      await fetchSubs();
      setDecisionModal(false);
      setModalOpen(false);
      setSelectedSub(null);

    } catch {
      toast.error("Network error", { id: toastId });
    }
  };

  const openModal = (s) => {
    setSelectedSub(s);
    setModalOpen(true);
  };

  const closeModal = () => {
    setSelectedSub(null);
    setModalOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
    navigate("/", { replace: true });
  };

  const highlightText = (text, score) => {
    if (!text) return '';
    const sentences = text.split(/(?<=[.!?])/);
    const highlightCount = Math.ceil((score / 100) * sentences.length);
    return sentences.map((s, idx) => (
      <span key={idx} style={{ backgroundColor: idx < highlightCount ? "#fca5a5" : "transparent" }}>
        {s}{" "}
      </span>
    ));
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <header className="sticky top-0 bg-white shadow flex justify-between items-center px-6 py-3 border-b">
        <h1 className="text-lg font-bold text-blue-700">Lecturer Dashboard</h1>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">👤 {user?.name}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">

        {/* ⭐ FILTER BUTTONS ⭐ */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => handleFilterChange("all")}
            className={`px-3 py-1 rounded ${filterType === "all" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            All
          </button>

          <button
            onClick={() => handleFilterChange("seminar")}
            className={`px-3 py-1 rounded ${filterType === "seminar" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Seminar Only
          </button>

          <button
            onClick={() => handleFilterChange("project")}
            className={`px-3 py-1 rounded ${filterType === "project" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Project Only
          </button>
        </div>

        {/* TABLE */}
        {filteredSubs.length === 0 ? (
          <p className="text-gray-500 text-sm">No submissions to display.</p>
        ) : (
          <table className="w-full border text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">

                {/* ⭐ NEW — NUMBER COLUMN ⭐ */}
                <th className="p-2 border w-12 text-center">#</th>

                <th className="p-2 border">Student</th>
                <th className="p-2 border">Proposal Title</th>

                {/* ⭐ Proposal Type Column ⭐ */}
                <th className="p-2 border">Proposal Type</th>

                <th className="p-2 border">Similarity</th>
                <th className="p-2 border text-center">Decision</th>
                <th className="p-2 border text-center">CA (30)</th>
                <th className="p-2 border text-center">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredSubs.map((s, index) => (
                <tr key={s.id} className="hover:bg-gray-50 border-b">

                  {/* ⭐ NEW — COUNTER VALUE ⭐ */}
                  <td className="p-2 border text-center font-semibold">{index + 1}</td>

                  <td className="p-2 border">{s.student?.name} ({s.student?.reg_number})</td>
                  <td className="p-2 border">{s.proposed_title}</td>

                  <td className="p-2 border">
                    <span className="px-2 py-1 bg-gray-200 rounded text-xs">
                      {s.proposal_type}
                    </span>
                  </td>

                  <td className="p-2 border" style={{ width: 240 }}>
                    <SimilarityMeter score={s.similarity_score} />
                  </td>

                  <td className="p-2 border text-center">{s.final_decision || "-"}</td>

                  <td className="p-2 border text-center">
                    {s.proposal_type === "Seminar" ? (
                      <input
                        type="number"
                        min="0"
                        max="30"
                      
                        value={caInputs[s.id] ?? ""}
                      
                        className="border rounded w-16 p-1 text-center"
                      
                        // ⭐ ENABLE TYPING
                        onChange={(e) => {
                          const val = e.target.value;
                      
                          setCaInputs(prev => ({
                            ...prev,
                            [s.id]: val
                          }));
                        }}
                      
                        // ⭐ SAVE ON BLUR
                        onBlur={async () => {
                      
                          const score = caInputs[s.id];
                      
                          if (score === "") return;
                      
                          const token = localStorage.getItem("token");
                      
                          try {
                            const res = await fetch(
                              `${API_URL}/lecturer/add_ca/${s.id}?score=${score}`,
                              {
                                method: "PUT",
                                headers: {
                                  Authorization: `Bearer ${token}`
                                }
                              }
                            );
                      
                            if (!res.ok) {
                              const msg = await res.text();
                              toast.error(msg);
                              return;
                            }
                      
                            toast.success("CA score saved");
                      
                            fetchSubs(); // refresh from DB
                      
                          } catch {
                            toast.error("Failed to save score");
                          }
                        }}
                      />
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="p-2 border text-center flex gap-2 justify-center">
                    <button
                      className="bg-blue-500 text-white px-3 py-1 rounded"
                      onClick={() => openModal(s)}
                    >
                      View
                    </button>

                    {s.final_decision === "pending" && (
                      <button
                        className="bg-yellow-500 text-white px-3 py-1 rounded"
                        onClick={() => {
                          setSelectedSub(s);
                          setDecisionModal(true);
                        }}
                      >
                        Decide
                      </button>
                    )}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>

      {/* DECISION MODAL */}
      {decisionModal && selectedSub && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 w-96 rounded relative">
            <button className="absolute top-2 right-2" onClick={() => setDecisionModal(false)}>✕</button>
            <h3 className="text-lg font-semibold mb-3">Decide Proposal</h3>
            <p className="text-gray-700 mb-3">{selectedSub.proposed_title}</p>

            <div className="flex gap-3">
              <button
                className="bg-green-600 text-white px-3 py-1 rounded w-full"
                onClick={() => decide(selectedSub.id, "approved")}
              >
                Approve
              </button>
              <button
                className="bg-red-600 text-white px-3 py-1 rounded w-full"
                onClick={() => decide(selectedSub.id, "rejected")}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILS MODAL */}
      {modalOpen && selectedSub && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 max-w-3xl rounded-lg max-h-[90vh] overflow-y-auto relative">
            <button className="absolute top-2 right-2" onClick={closeModal}>✕</button>

            <h2 className="text-lg font-bold mb-4">{selectedSub.proposed_title}</h2>

            <p><b>Background:</b> {highlightText(selectedSub.background, selectedSub.similarity_score)}</p>
            <p><b>Aim:</b> {highlightText(selectedSub.aim, selectedSub.similarity_score)}</p>
            <p><b>Objectives:</b> {highlightText(selectedSub.objectives, selectedSub.similarity_score)}</p>
            <p><b>Methods:</b> {highlightText(selectedSub.methods, selectedSub.similarity_score)}</p>
            <p><b>Expected Results:</b> {highlightText(selectedSub.expected_results, selectedSub.similarity_score)}</p>
            <p><b>Literature Review:</b> {highlightText(selectedSub.literature_review, selectedSub.similarity_score)}</p>

            <button
              className="bg-gray-600 text-white px-3 py-1 rounded mt-4"
              onClick={() =>
                window.open(
                  `${API_URL}/submission/${selectedSub.id}/pdf?token=${localStorage.getItem("token")}`,
                  "_blank"
                )
              }
            >
              PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
