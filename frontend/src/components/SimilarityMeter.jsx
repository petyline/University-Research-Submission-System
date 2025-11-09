import React from 'react';
export default function SimilarityMeter({score}){
  const s = Math.round(score);
  let color = 'bg-green-500';
  if(s>=40 && s<70) color='bg-yellow-500';
  if(s>=70) color='bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>Similarity</span><span>{s}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div className={`${color} h-3 rounded-full`} style={{width: `${s}%`}} />
      </div>
    </div>
  )
}
