import React, { useState, useEffect } from 'react';
import { Plus, FileDown, Search, Edit, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../lib/firebase';
import { ref, onValue, remove } from 'firebase/database';
import TradeForm from '../components/TradeForm';

interface Trade {
  id: string;
  tradeName: string;
  tradeDate: string;
  initialZAR: number;
  usdPurchased: number;
  valrRate: number;
  marketRate: number;
  spread: number;
  wireTransferFee: number;
  withdrawalFee: number;
  finalZAR: number;
  profitZAR: number;
  profitPercentage: number;
  taxPin: string;
  notes: string;
  createdAt: string;
}

function Trades() {
  const { currentUser } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load trades from Firebase
  useEffect(() => {
    if (!currentUser) return;
    
    const tradesRef = ref(database, `trades/${currentUser.uid}`);
    const unsubscribe = onValue(tradesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object to array
        const tradesArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        
        // Sort by date (newest first)
        tradesArray.sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime());
        
        setTrades(tradesArray);
      } else {
        setTrades([]);
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [currentUser]);

  const handleDeleteTrade = async (id: string) => {
    if (!currentUser) return;
    
    try {
      await remove(ref(database, `trades/${currentUser.uid}/${id}`));
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting trade:", err);
      setError("Failed to delete trade. Please try again.");
    }
  };

  const handleEditTrade = (id: string) => {
    setEditingTradeId(id);
    setShowTradeForm(true);
  };

  const handleExportTrades = () => {
    if (trades.length === 0) return;
    
    const csvContent = [
      // CSV Header
      ["Trade Name", "Date", "Initial ZAR", "USD Purchased", "VALR Rate", "Market Rate", 
      "Spread", "Wire Fee %", "Withdrawal Fee", "Final ZAR", "Profit ZAR", "ROI %", "Tax Ref", "Notes"].join(","),
      
      // CSV Data rows
      ...trades.map(trade => [
        `"${trade.tradeName}"`,
        trade.tradeDate,
        trade.initialZAR,
        trade.usdPurchased,
        trade.valrRate,
        trade.marketRate,
        trade.spread,
        trade.wireTransferFee,
        trade.withdrawalFee,
        trade.finalZAR,
        trade.profitZAR,
        trade.profitPercentage,
        `"${trade.taxPin}"`,
        `"${trade.notes.replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");
    
    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `arbitracker-trades-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter trades based on search term
  const filteredTrades = trades.filter(trade => 
    trade.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trade.taxPin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trade.notes.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Trades</h1>
        <div className="flex space-x-3">
          <button 
            onClick={handleExportTrades}
            disabled={trades.length === 0}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            <FileDown className="h-5 w-5 mr-2" />
            Export
          </button>
          <button 
            onClick={() => {
              setEditingTradeId(null);
              setShowTradeForm(true);
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <Plus className="h-5 w-5 mr-2" />
            New Trade
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <span className="block sm:inline">{error}</span>
          <button 
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setError('')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="flex mb-4">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
            placeholder="Search trades by name, tax reference, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500 dark:text-gray-400">Loading trades...</p>
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {trades.length === 0 
              ? "No trades recorded yet. Click 'New Trade' to add your first trade." 
              : "No trades matching your search criteria."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial ZAR</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">USD</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">VALR Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Market Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Profit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ROI</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(trade.tradeDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {trade.tradeName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      R {trade.initialZAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      $ {trade.usdPurchased.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {trade.valrRate.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {trade.marketRate.toFixed(2)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${trade.profitZAR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      R {trade.profitZAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${trade.profitPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {trade.profitPercentage.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditTrade(trade.id)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {deleteConfirm === trade.id ? (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleDeleteTrade(trade.id)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(trade.id)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showTradeForm && (
        <TradeForm 
          onClose={() => setShowTradeForm(false)} 
          onTradeAdded={() => {
            setShowTradeForm(false);
            setEditingTradeId(null);
          }}
          tradeId={editingTradeId}
        />
      )}
    </div>
  );
}

export default Trades;