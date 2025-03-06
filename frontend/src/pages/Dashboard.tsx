import React, { useEffect, useState } from 'react';
import {
  LineChart,
  ArrowUpDown,
  DollarSign,
  TrendingUp,
  ChevronRight,
  Clock,
  CheckCircle,
  Plus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import ProfitChart from '../components/ProfitChart';
import { Link } from 'react-router-dom';
import ResponsiveTradeForm from '../components/ResponsiveTradeForm';
import ResponsiveTradeCard from '../components/ResponsiveTradeCard';

interface RateData {
  valrRate: number;
  marketRate: number;
  spread: number;
  lastUpdated: string;
}

interface UserData {
  initialInvestment: number;
  usdPurchased: number;
  defaultWireTransferFee: number;
  defaultMinWireTransferFee: number;
  defaultWithdrawalFee: number;
}

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
  status: 'open' | 'closed';
  createdAt: string;
  closedAt?: string;
}

function Dashboard() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rateData, setRateData] = useState<RateData>({
    valrRate: 0,
    marketRate: 0,
    spread: 0,
    lastUpdated: '',
  });
  const [userData, setUserData] = useState<UserData>({
    initialInvestment: 50000,
    usdPurchased: 2500,
    defaultWireTransferFee: 0.13,
    defaultMinWireTransferFee: 10,
    defaultWithdrawalFee: 30,
  });
  const [currentProfit, setCurrentProfit] = useState({
    profitZAR: 0,
    profitPercentage: 0,
  });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalLifetimeProfit, setTotalLifetimeProfit] = useState(0);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [recentClosedTrades, setRecentClosedTrades] = useState<Trade[]>([]);

  // Trade form states
  const [showNewTradeForm, setShowNewTradeForm] = useState(false);
  const [showCloseTradeForm, setShowCloseTradeForm] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  // Constant Capitec Fee
  const capitecFee = 500;

  useEffect(() => {
    if (!currentUser) return;

    // Fetch current exchange rates
    const ratesRef = ref(database, 'currentRates');
    const unsubscribeRates = onValue(ratesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRateData({
          valrRate: data.valrRate || 0,
          marketRate: data.marketRate || 0,
          spread: ((data.valrRate / data.marketRate) - 1) * 100 || 0,
          lastUpdated: data.lastUpdated || new Date().toISOString(),
        });
      }
    });

    // Fetch user settings
    const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
    const unsubscribeSettings = onValue(userSettingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setUserData({
          initialInvestment: data.initialInvestment || 50000,
          usdPurchased: data.usdPurchased || 2500,
          defaultWireTransferFee: data.defaultWireTransferFee || 0.13,
          defaultMinWireTransferFee: data.defaultMinWireTransferFee || 10,
          defaultWithdrawalFee: data.defaultWithdrawalFee || 30,
        });
      }
    });

    // Fetch trades
    const tradesRef = ref(database, `trades/${currentUser.uid}`);
    const unsubscribeTrades = onValue(tradesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object to array
        const tradesArray = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
          status: data[key].status || 'open', // Default to open if status not set
        }));

        // Sort by date (newest first)
        tradesArray.sort(
          (a, b) =>
            new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
        );

        setTrades(tradesArray);

        // Filter open and closed trades
        const openTradesArr = tradesArray.filter(
          (trade) => trade.status === 'open'
        );
        const closedTradesArr = tradesArray
          .filter((trade) => trade.status === 'closed')
          .slice(0, 5); // Just get the 5 most recent closed trades

        setOpenTrades(openTradesArr);
        setRecentClosedTrades(closedTradesArr);

        // Calculate total lifetime profit from all closed trades
        const totalProfit = tradesArray
          .filter((trade) => trade.status === 'closed')
          .reduce((sum, trade) => sum + trade.profitZAR, 0);
        setTotalLifetimeProfit(totalProfit);
      } else {
        setTrades([]);
        setOpenTrades([]);
        setRecentClosedTrades([]);
        setTotalLifetimeProfit(0);
      }

      setLoading(false);
    });

    return () => {
      unsubscribeRates();
      unsubscribeSettings();
      unsubscribeTrades();
    };
  }, [currentUser]);

  // Calculate current profit for open trades whenever rate data or open trades change
  useEffect(() => {
    // Skip calculation if we don't have the necessary data or no open trades
    if (rateData.valrRate <= 0 || openTrades.length === 0) {
      setCurrentProfit({
        profitZAR: 0,
        profitPercentage: 0,
      });
      return;
    }

    // For simplicity, we'll handle the most recent open trade
    const currentTrade = openTrades[0]; // Most recent open trade

    // Use the trade's stored marketRate if provided, otherwise the global marketRate
    const marketRate = currentTrade.marketRate || rateData.marketRate;
    if (marketRate <= 0) {
      return; // Skip calculation if market rate is invalid
    }

    // Calculate wire transfer fee (percentage or minimum, whichever is higher)
    const wireTransferFee = Math.max(
      (currentTrade.wireTransferFee / 100) * currentTrade.usdPurchased,
      userData.defaultMinWireTransferFee
    );

    // Calculate USD after fee
    const usdAfterFee = currentTrade.usdPurchased - wireTransferFee;

    // Convert back to ZAR at CURRENT VALR rate (live calculation)
    const zarFromUsdc = usdAfterFee * rateData.valrRate;

    // Subtract withdrawal fee and capitec fee
    const finalZAR = zarFromUsdc - currentTrade.withdrawalFee - capitecFee;

    // Calculate profit using the trade's initialZAR
    const profitZAR = finalZAR - currentTrade.initialZAR;
    const profitPercentage = (profitZAR / currentTrade.initialZAR) * 100;

    setCurrentProfit({
      profitZAR,
      profitPercentage,
    });
  }, [rateData, openTrades, userData.defaultMinWireTransferFee, capitecFee]);

  const handleOpenNewTrade = () => {
    setShowNewTradeForm(true);
  };

  const handleOpenCloseTradeForm = (tradeId: string) => {
    setSelectedTradeId(tradeId);
    setShowCloseTradeForm(true);
  };

  const handleTradeFormClosed = () => {
    setShowNewTradeForm(false);
    setShowCloseTradeForm(false);
    setSelectedTradeId(null);
  };

  // Render trade forms
  const renderTradeForms = () => {
    if (showNewTradeForm) {
      return (
        <ResponsiveTradeForm
          onClose={handleTradeFormClosed}
          onTradeAdded={handleTradeFormClosed}
        />
      );
    }

    if (showCloseTradeForm && selectedTradeId) {
      return (
        <ResponsiveTradeForm
          onClose={handleTradeFormClosed}
          onTradeAdded={handleTradeFormClosed}
          tradeId={selectedTradeId}
          isClosingTrade={true}
        />
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400">
          Loading dashboard data...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Dashboard
      </h1>

      {/* Trade forms */}
      {renderTradeForms()}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Profit */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Current Profit (ZAR)
              </p>
              <p
                className={`text-xl sm:text-2xl font-bold ${
                  currentProfit.profitZAR >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                R{' '}
                {currentProfit.profitZAR.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <TrendingUp
              className={`h-6 w-6 sm:h-8 sm:w-8 ${
                currentProfit.profitZAR >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            />
          </div>
          {openTrades.length === 0 && (
            <div className="mt-3 text-center">
              <button
                onClick={handleOpenNewTrade}
                className="text-sm py-1 px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-300 transition-colors"
              >
                Start a New Trade
              </button>
            </div>
          )}
        </div>

        {/* Lifetime Profit */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Lifetime Profit
              </p>
              <p
                className={`text-xl sm:text-2xl font-bold ${
                  totalLifetimeProfit >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                R{' '}
                {totalLifetimeProfit.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <CheckCircle
              className={`h-6 w-6 sm:h-8 sm:w-8 ${
                totalLifetimeProfit >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            />
          </div>
        </div>

        {/* Current Spread */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Current Spread
              </p>
              <p
                className={`text-xl sm:text-2xl font-bold ${
                  rateData.spread > 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {rateData.spread.toFixed(2)}%
              </p>
            </div>
            <ArrowUpDown className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        {/* Open Trades Count */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Open Trades
              </p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {openTrades.length}
              </p>
            </div>
            <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Exchange Rates */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              Exchange Rates
            </h2>
            <span className="text-xs text-gray-500">
              Last updated: {new Date(rateData.lastUpdated).toLocaleString()}
            </span>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                VALR Rate (USDC/ZAR):
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                R {rateData.valrRate.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                Market Rate (ZAR/USD):
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                R {rateData.marketRate.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                Current Spread:
              </span>
              <span
                className={`font-medium ${
                  rateData.spread > 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {rateData.spread.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                Wire Transfer Fee:
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {userData.defaultWireTransferFee}% (min $
                {userData.defaultMinWireTransferFee})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                Withdrawal Fee:
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                R {userData.defaultWithdrawalFee}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                Capitec Fee:
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                R {capitecFee}
              </span>
            </div>
          </div>
        </div>

        {/* Current Investment (Open Trade Info) */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              Current Investment
            </h2>
            {openTrades.length === 0 ? (
              <button
                onClick={handleOpenNewTrade}
                className="text-sm px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center"
              >
                <Plus className="h-4 w-4 mr-1" /> New Trade
              </button>
            ) : (
              <Link
                to="/trades"
                className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 flex items-center"
              >
                View All <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            )}
          </div>

          {openTrades.length === 0 ? (
            <div className="p-4 sm:p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                No open trades. Start a new trade to track your arbitrage profits.
              </p>
              <button
                onClick={handleOpenNewTrade}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md inline-flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" /> New Trade
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  Initial ZAR:
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  R {openTrades[0].initialZAR.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  USD Purchased:
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  $ {openTrades[0].usdPurchased.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  Market Rate:
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  R {openTrades[0].marketRate.toFixed(4)}
                  {openTrades[0].marketRate !== rateData.marketRate && (
                    <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                      (Custom)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  Current ROI:
                </span>
                <span
                  className={`font-medium ${
                    currentProfit.profitPercentage >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {currentProfit.profitPercentage.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  Projected Profit:
                </span>
                <span
                  className={`font-medium ${
                    currentProfit.profitZAR >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  R{' '}
                  {currentProfit.profitZAR.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="pt-3 mt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => handleOpenCloseTradeForm(openTrades[0].id)}
                  className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
                >
                  Close This Trade
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profit History */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Profit History
        </h2>
        <ProfitChart />
      </div>

      {/* Open Trades Section */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            Open Trades
          </h2>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleOpenNewTrade}
              className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center"
            >
              <Plus className="h-4 w-4 mr-1" /> New Trade
            </button>
            <Link
              to="/trades"
              className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 flex items-center"
            >
              View All <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
        </div>

        {openTrades.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            No open trades found. Start a new trade to track your arbitrage profits.
          </p>
        ) : (
          <>
            {/* For desktop screens - show the table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Initial ZAR
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      USD
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Market Rate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Profit
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      ROI
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {openTrades.map((trade) => (
                    <tr key={trade.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(trade.tradeDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {trade.tradeName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        R{' '}
                        {trade.initialZAR.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        ${' '}
                        {trade.usdPurchased.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        R {trade.marketRate.toFixed(4)}
                        {trade.marketRate !== rateData.marketRate && (
                          <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                            (Custom)
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap text-sm ${
                          trade.profitZAR >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        R{' '}
                        {trade.profitZAR.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap text-sm ${
                          trade.profitPercentage >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {trade.profitPercentage.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleOpenCloseTradeForm(trade.id)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Close Trade
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* For mobile screens - show the cards */}
            <div className="md:hidden space-y-4">
              {openTrades.map((trade) => (
                <ResponsiveTradeCard 
                  key={trade.id}
                  trade={trade}
                  onEdit={() => handleEditTrade(trade.id)}
                  onDelete={() => {/* Not implemented in dashboard */}}
                  onClose={handleOpenCloseTradeForm}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Recent Closed Trades Section */}
      {recentClosedTrades.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              Recent Closed Trades
            </h2>
            <Link
              to="/trades"
              className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 flex items-center"
            >
              View All <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </div>

          {/* For desktop screens - show the table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Initial ZAR
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    USD
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Market Rate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Profit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    ROI
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {recentClosedTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(trade.tradeDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {trade.tradeName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      R{' '}
                      {trade.initialZAR.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      ${' '}
                      {trade.usdPurchased.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      R {trade.marketRate.toFixed(4)}
                    </td>
                    <td
                      className={`px-4 py-3 whitespace-nowrap text-sm ${
                        trade.profitZAR >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      R{' '}
                      {trade.profitZAR.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      className={`px-4 py-3 whitespace-nowrap text-sm ${
                        trade.profitPercentage >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {trade.profitPercentage.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* For mobile screens - show the cards */}
          <div className="md:hidden space-y-4">
            {recentClosedTrades.map((trade) => (
              <ResponsiveTradeCard 
                key={trade.id}
                trade={trade}
                onEdit={() => {/* No editing for closed trades */}}
                onDelete={() => {/* Not implemented in dashboard */}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Function for handling editing trades - needed for the ResponsiveTradeCard
const handleEditTrade = (id: string) => {
  // This function isn't fully implemented in the dashboard view
  // but is needed as a prop for ResponsiveTradeCard
  console.log(`Edit trade ${id} requested from dashboard`);
};

export default Dashboard;