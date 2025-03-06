import React, { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  textColor?: string;
  onClick?: () => void;
  actionText?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  textColor = 'text-gray-900 dark:text-white',
  onClick,
  actionText
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className={`text-xl sm:text-2xl font-bold ${textColor}`}>
            {value}
          </p>
        </div>
        <div className="text-blue-600 dark:text-blue-400">
          {icon}
        </div>
      </div>
      
      {onClick && actionText && (
        <div className="mt-3 text-center">
          <button
            onClick={onClick}
            className="text-sm py-1 px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-300 transition-colors"
          >
            {actionText}
          </button>
        </div>
      )}
    </div>
  );
};

export default StatCard;