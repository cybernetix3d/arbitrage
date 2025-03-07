import React, { useState, useEffect } from 'react';
import { Plus, FileDown, Search, Edit, Trash2, X, ChevronDown, Filter, SortDesc, ArrowDown, ArrowUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../lib/firebase';
import { ref, onValue, remove } from 'firebase/database';
import ResponsiveTradeForm from '../components/ResponsiveTradeForm';
import ResponsiveTradeCard from '../components/ResponsiveTradeCard';

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
  selectedPin: string;
  notes: string;
  createdAt: string;
  status: 'open' | 'closed';
  closedAt?: string;
}

type SortField = 'tradeDate' | 'tradeName' | 'profitPercentage' | 'profitZAR' | 'initialZAR';
type SortDirection = 'asc' | 'desc';

function Trades() {
  const { currentUser } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [view, setView] = useState<'card' | 'table'>('card');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [sortField, setSortField] = useState<SortField>('tradeDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [profitFilter, setProfitFilter] = useState({ min: '', max: '' });

  // Load trades from Firebase
  useEffect(() => {
    if (!currentUser) return;

    const tradesRef = ref(database, `trades/${currentUser.uid}`);
    const unsubscribe = onValue(tradesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const tradesArray = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
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
      [
        "Trade Name",
        "Date",
        "Initial ZAR",
        "USD Purchased",
        "VALR Rate",
        "Market Rate",
        "Spread",
        "Wire Fee %",
        "Withdrawal Fee",
        "Final ZAR",
        "Profit ZAR",
        "ROI %",
        "PIN",
        "Notes",
      ].join(","),

      ...filteredAndSortedTrades.map((trade) =>
        [
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
          `"${trade.selectedPin}"`,
          `"${trade.notes.replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `arbitracker-trades-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filter and sort trades
  const filteredAndSortedTrades = trades
    .filter((trade) => {
      // Text search
      const matchesSearch = searchTerm === '' || 
        trade.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trade.selectedPin.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trade.notes.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || trade.status === statusFilter;
      
      // Date filter
      const tradeDate = new Date(trade.tradeDate);
      const matchesStartDate = !dateFilter.start || tradeDate >= new Date(dateFilter.start);
      const matchesEndDate = !dateFilter.end || tradeDate <= new Date(dateFilter.end);
      
      // Profit filter
      const matchesMinProfit = !profitFilter.min || trade.profitPercentage >= parseFloat(profitFilter.min);
      const matchesMaxProfit = !profitFilter.max || trade.profitPercentage <= parseFloat(profitFilter.max);
      
      return matchesSearch && matchesStatus && matchesStartDate && matchesEndDate && matchesMinProfit && matchesMaxProfit;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'tradeDate':
          comparison = new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime();
          break;
        case 'tradeName':
          comparison = a.tradeName.localeCompare(b.tradeName);
          break;
        case 'profitPercentage':
          comparison = a.profitPercentage - b.profitPercentage;
          break;
        case 'profitZAR':
          comparison = a.profitZAR - b.profitZAR;
          break;
        case 'initialZAR':
          comparison = a.initialZAR - b.initialZAR;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const openTrades = filteredAndSortedTrades.filter((trade) => trade.status === 'open');
  const closedTrades = filteredAndSortedTrades.filter((trade) => trade.status === 'closed');

  const getTotalStats = (tradesList: Trade[]) => {
    const total = {
      trades: tradesList.length,
      initialZAR: tradesList.reduce((sum, trade) => sum + trade.initialZAR, 0),
      profitZAR: tradesList.reduce((sum, trade) => sum + trade.profitZAR, 0),
      avgProfitPercent: tradesList.length 
        ? tradesList.reduce((sum, trade) => sum + trade.profitPercentage, 0) / tradesList.length 
        : 0
    };
    return total;
  };

  const openStats = getTotalStats(openTrades);
  const closedStats = getTotalStats(closedTrades);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const tradesPerPage = 10;
  const totalPages = Math.ceil(filteredAndSortedTrades.length / tradesPerPage);
  const currentTrades = filteredAndSortedTrades.slice(
    (currentPage - 1) * tradesPerPage,
    currentPage * tradesPerPage
  );

  // Clear filters
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter({ start: '', end: '' });
    setProfitFilter({ min: '', max: '' });
    setSortField('tradeDate');
    setSortDirection('desc');
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Trades</h1>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setView(view === 'card' ? 'table' : 'card')}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            {view === 'card' ? 'Table View' : 'Card View'}
          </button>
          <button
            onClick={handleExportTrades}
            disabled={filteredAndSortedTrades.length === 0}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            onClick={() => {
              setEditingTradeId(null);
              setShowTradeForm(true);
            }}
            className="inline-flex items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Trade
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <span className="block sm:inline">{error}</span>
          <button className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError('')}>
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Search and filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div className="relative flex-1 w-full sm:w-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search trades..."
              className="pl-10 w-full rounded-md border border-gray-300 py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Advanced filters */}
        {showFilters && (
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md mb-4 border border-gray-100 dark:border-gray-600">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'closed')}
                  className="w-full rounded-md border border-gray-300 py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="all">All Trades</option>
                  <option value="open">Open Trades</option>
                  <option value="closed">Closed Trades</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Range</label>
                <div className="flex space-x-2">
                  <input
                    type="date"
                    value={dateFilter.start}
                    onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                    className="w-1/2 rounded-md border border-gray-300 py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <input
                    type="date"
                    value={dateFilter.end}
                    onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                    className="w-1/2 rounded-md border border-gray-300 py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profit Range (%)</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={profitFilter.min}
                    onChange={(e) => setProfitFilter({ ...profitFilter, min: e.target.value })}
                    className="w-1/2 rounded-md border border-gray-300 py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={profitFilter.max}
                    onChange={(e) => setProfitFilter({ ...profitFilter, max: e.target.value })}
                    className="w-1/2 rounded-md border border-gray-300 py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Showing {filteredAndSortedTrades.length} of {trades.length} trades
              </div>
              <button
                onClick={clearFilters}
                className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
            <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">Open Trades</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Count</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{openStats.trades}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Invested</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">R{openStats.initialZAR.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800">
            <h3 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-2">Closed Trades</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Profit</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">R{closedStats.profitZAR.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg. ROI</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{closedStats.avgProfitPercent.toFixed(2)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Trades list */}
        {loading ? (
          <div className="flex justify-center items-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredAndSortedTrades.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">No trades found</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {trades.length === 0 
                ? "You haven't added any trades yet." 
                : "Try adjusting your filters or search term."}
            </p>
            {trades.length === 0 && (
              <div className="mt-6">
                <button
                  onClick={() => {
                    setEditingTradeId(null);
                    setShowTradeForm(true);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Add Your First Trade
                </button>
              </div>
            )}
          </div>
        ) : view === 'card' ? (
          <div className="space-y-4">
            {currentTrades.map((trade) => (
              <ResponsiveTradeCard 
                key={trade.id} 
                trade={trade} 
                onEdit={handleEditTrade} 
                onDelete={() => setDeleteConfirm(trade.id)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('tradeName')}>
                    <div className="flex items-center">
                      Trade Name
                      {sortField === 'tradeName' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('tradeDate')}>
                    <div className="flex items-center">
                      Date
                      {sortField === 'tradeDate' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('initialZAR')}>
                    <div className="flex items-center justify-end">
                      Initial ZAR
                      {sortField === 'initialZAR' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    USD
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('profitZAR')}>
                    <div className="flex items-center justify-end">
                      Profit ZAR
                      {sortField === 'profitZAR' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('profitPercentage')}>
                    <div className="flex items-center justify-end">
                      ROI %
                      {sortField === 'profitPercentage' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {currentTrades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{trade.tradeName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{trade.selectedPin}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">{new Date(trade.tradeDate).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                      R{trade.initialZAR.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                      ${trade.usdPurchased.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <span className={trade.profitZAR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        R{trade.profitZAR.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <span className={trade.profitPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {trade.profitPercentage.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        trade.status === 'open' 
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      }`}>
                        {trade.status.charAt(0).toUpperCase() + trade.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEditTrade(trade.id)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(trade.id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6 mt-4">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Showing <span className="font-medium">{(currentPage - 1) * tradesPerPage + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * tradesPerPage, filteredAndSortedTrades.length)}
                  </span>{' '}
                  of <span className="font-medium">{filteredAndSortedTrades.length}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // Show pages around current page
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else {
                      const startPage = Math.max(1, currentPage - 2);
                      const endPage = Math.min(totalPages, startPage + 4);
                      pageNum = startPage + i;
                      if (pageNum > endPage) return null;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-900 dark:border-blue-500 dark:text-blue-200'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
            <div className="flex sm:hidden justify-between w-full">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 overflow-y-auto z-50">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75 dark:bg-gray-900 dark:opacity-80"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 sm:mx-0 sm:h-10 sm:w-10">
                    <Trash2 className="h-6 w-6 text-red-600 dark:text-red-300" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Delete Trade</h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Are you sure you want to delete this trade? This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => handleDeleteTrade(deleteConfirm)}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm dark:bg-red-700 dark:hover:bg-red-600"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trade form modal */}
      {showTradeForm && <ResponsiveTradeForm onClose={() => setShowTradeForm(false)} onTradeAdded={() => setShowTradeForm(false)} tradeId={editingTradeId} />}
    </div>
  );
}

export default Trades;