import React from 'react';
import { KpiData } from '../types/dashboard';

interface KpiCardProps extends KpiData {
  theme: 'light' | 'dark';
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, theme }) => {
  const cardClasses = `p-4 md:p-6 rounded-xl shadow-lg transition-all duration-300 transform hover:-translate-y-1 w-full text-center ${
    theme === 'dark' 
      ? 'bg-slate-800 border border-slate-700 hover:bg-slate-700/50' 
      : 'bg-white border border-gray-200 hover:bg-gray-50'
  }`;
  const titleClasses = `text-sm font-medium ${
    theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
  }`;
  const valueClasses = `text-3xl font-bold mt-2 ${
    theme === 'dark' ? 'text-sky-400' : 'text-sky-600'
  }`;

  return (
    <div className={cardClasses}>
      <h3 className={titleClasses}>{title}</h3>
      <p className={valueClasses}>{value}</p>
    </div>
  );
};

export default KpiCard; 