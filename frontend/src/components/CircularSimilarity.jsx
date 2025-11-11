// src/components/CircularSimilarity.jsx
import React from "react";

export default function CircularSimilarity({ value }) {
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
          className={color}
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
}
