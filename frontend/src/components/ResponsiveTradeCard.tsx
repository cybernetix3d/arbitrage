import React, { useState } from 'react';
import { Edit, Trash2, ChevronsDown, ChevronsUp, CheckCircle } from 'lucide-react';

interface Trade {
  id: string;
  tradeName: string;
  tradeDate: string;
  initialZAR: number;
  usdPurchased: number;
  valrRate: number;
  marketRate: number;
  spread: number;
  profitZAR: number;
  profitPercentage: number;
  selectedPin: string;
  status: 'open' | 'closed';
  notes?: string;
}

interface ResponsiveTradeCardProps {
  trade: Trade;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClose?: (id: string) => void;
}

const ResponsiveTradeCard: React.FC<ResponsiveTradeCardProps> = ({
  trade,
  onEdit,
  onDelete,
  onClose
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  
  const handleDeleteClick = () => {
    setIsDeleteConfirming(true);
  };
  
  const handleDeleteConfirm = () => {
    onDelete(trade.id);
    setIsDeleteConfirming(false);
  };
  
  const handleDeleteCancel = () => {
    setIsDeleteConfirming(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
            {trade.tradeName}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(trade.tradeDate).toLocaleDateString()}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            PIN: {trade.selectedPin}
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(trade.id)}
            className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            aria-label="Edit trade"
          >
            <Edit className="h-4 w-4" />
          </button>
          
          {isDeleteConfirming ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDeleteConfirm}
                className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded dark:bg-red-900 dark:text-red-300"
              >
                Confirm
              </button>
              <button
                onClick={handleDeleteCancel}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded dark:bg-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleDeleteClick}
              className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              aria-label="Delete trade"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status indicator */}
      <div className="mb-3">
        <span className={`px-2 py-1 text-xs rounded-full ${
          trade.status === 'open' 
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' 
            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
        }`}>
          {trade.status === 'open' ? 'Open' : 'Closed'}
        </span>
      </div>

      {/* Main info visible by default */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="text-gray-500 dark:text-gray-400">Initial ZAR:</div>
        <div className="text-right text-gray-900 dark:text-white font-medium">
          R {trade.initialZAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div className="text-gray-500 dark:text-gray-400">USD Purchased:</div>
        <div className="text-right text-gray-900 dark:text-white font-medium">
          $ {trade.usdPurchased.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div className="text-gray-500 dark:text-gray-400">Profit:</div>
        <div className={`text-right font-medium ${
          trade.profitZAR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          R {trade.profitZAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div className="text-gray-500 dark:text-gray-400">ROI:</div>
        <div className={`text-right font-medium ${
          trade.profitPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {trade.profitPercentage.toFixed(2)}%
        </div>
      </div>

      {/* Expandable content */}
      <div className="mt-3">
        <button 
          className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronsUp className="h-4 w-4 mr-1" /> Show less
            </>
          ) : (
            <>
              <ChevronsDown className="h-4 w-4 mr-1" /> Show more
            </>
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="text-gray-500 dark:text-gray-400">VALR Rate:</div>
          <div className="text-right text-gray-900 dark:text-white font-medium">
            {trade.valrRate.toFixed(2)}
          </div>

          <div className="text-gray-500 dark:text-gray-400">Market Rate:</div>
          <div className="text-right text-gray-900 dark:text-white font-medium">
            {trade.marketRate.toFixed(2)}
          </div>

          <div className="text-gray-500 dark:text-gray-400">Spread:</div>
          <div className="text-right text-gray-900 dark:text-white font-medium">
            {trade.spread.toFixed(2)}%
          </div>
          
          {trade.notes && (
            <>
              <div className="text-gray-500 dark:text-gray-400 col-span-2 mt-2">Notes:</div>
              <div className="text-gray-900 dark:text-white col-span-2 mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                {trade.notes}
              </div>
            </>
          )}
          
          {trade.status === 'open' && onClose && (
            <div className="col-span-2 mt-3">
              <button
                onClick={() => onClose(trade.id)}
                className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
              >
                Close This Trade
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResponsiveTradeCard;
