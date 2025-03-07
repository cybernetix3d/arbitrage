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
import { ref, onValue, get, push, update } from 'firebase/database';
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

interface PinData {
  allowedAmount: number;
  usedAmount: number;
  createdAt: string;
  expiresAt: string;
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
  // New states for allowances and PINs
  const [annualAllowance, setAnnualAllowance] = useState({ SDAUsed: 0, foreignUsed: 0 });
  const [pins, setPins] = useState<Record<string, PinData>>({});

  // Trade form states
  const [showNewTradeForm, setShowNewTradeForm] = useState(false);
  const [showCloseTradeForm, setShowCloseTradeForm] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  // Constant Capitec Fee
  const capitecFee = 500;

  useEffect(() => {
    if (!currentUser) return;

    // Fetch current exchange rates (live VALR rate always used)
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
        const tradesArray = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
          status: data[key].status || 'open',
        }));
        tradesArray.sort(
          (a, b) =>
            new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
        );
        setTrades(tradesArray);
        const openTradesArr = tradesArray.filter((trade) => trade.status === 'open');
        const closedTradesArr = tradesArray.filter((trade) => trade.status === 'closed').slice(0, 5);
        setOpenTrades(openTradesArr);
        setRecentClosedTrades(closedTradesArr);
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

  // Fetch annual allowance and PINs
  useEffect(() => {
    if (!currentUser) return;
    const year = new Date().getFullYear();

    const annualRef = ref(database, `userAnnualAllowance/${currentUser.uid}/${year}`);
    const unsubscribeAnnual = onValue(annualRef, (snap) => {
      const data = snap.val() || { SDAUsed: 0, foreignUsed: 0 };
      setAnnualAllowance(data);
    });

    const pinsRef = ref(database, `userPins/${currentUser.uid}`);
    const unsubscribePins = onValue(pinsRef, (snap) => {
      setPins(snap.val() || {});
    });

    return () => {
      unsubscribeAnnual();
      unsubscribePins();
    };
  }, [currentUser]);

  // Recalculate current profit for all open trades using live VALR rate
  useEffect(() => {
    if (rateData.valrRate <= 0 || openTrades.length === 0) {
      setCurrentProfit({ profitZAR: 0, profitPercentage: 0 });
      return;
    }
    
    let totalInitialZAR = 0;
    let totalProfitZAR = 0;
    
    // Loop through all open trades and sum up their profits
    for (const trade of openTrades) {
      const wireTransferFee = Math.max(
        (trade.wireTransferFee / 100) * trade.usdPurchased,
        userData.defaultMinWireTransferFee
      );
      const usdAfterFee = trade.usdPurchased - wireTransferFee;
      
      // Always use live VALR rate for open trades
      const currentValue = usdAfterFee * rateData.valrRate - (trade.withdrawalFee + capitecFee);
      const profit = currentValue - trade.initialZAR;
      
      totalInitialZAR += trade.initialZAR;
      totalProfitZAR += profit;
    }
    
    const profitPercentage = totalInitialZAR > 0 ? (totalProfitZAR / totalInitialZAR) * 100 : 0;
    setCurrentProfit({ 
      profitZAR: totalProfitZAR, 
      profitPercentage 
    });
  }, [rateData.valrRate, openTrades, userData.defaultMinWireTransferFee, capitecFee]);

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

  const renderTradeForms = () => {
    if (showNewTradeForm) {
      return (
        <ResponsiveTradeForm onClose={handleTradeFormClosed} onTradeAdded={handleTradeFormClosed} />
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
        <p className="text-gray-500 dark:text-gray-400">Loading dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      {renderTradeForms()}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Profit */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Current Profit (ZAR)</p>
              <p className={`text-xl sm:text-2xl font-bold ${currentProfit.profitZAR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                R {currentProfit.profitZAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <TrendingUp className={`h-6 w-6 sm:h-8 sm:w-8 ${currentProfit.profitZAR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
          </div>
          {openTrades.length === 0 && (
            <div className="mt-3 text-center">
              <button onClick={handleOpenNewTrade} className="text-sm py-1 px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-300 transition-colors">
                Start a New Trade
              </button>
            </div>
          )}
        </div>
        {/* Lifetime Profit */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Lifetime Profit</p>
              <p className={`text-xl sm:text-2xl font-bold ${totalLifetimeProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                R {totalLifetimeProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <CheckCircle className={`h-6 w-6 sm:h-8 sm:w-8 ${totalLifetimeProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
          </div>
        </div>
        {/* Current Spread */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Current Spread</p>
              <p className={`text-xl sm:text-2xl font-bold ${rateData.spread > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Open Trades</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{openTrades.length}</p>
            </div>
            <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </div>

      {/* Replace your existing Allowance Summary and Exchange Rates sections with this block */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Allowances */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Allowances</h2>
          <div className="mt-4">
            <h3 className="text-md font-medium text-gray-900 dark:text-white">Annual Allowance Remaining</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Foreign: R {(10000000 - annualAllowance.foreignUsed).toLocaleString()}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              SDA: R {(1000000 - annualAllowance.SDAUsed).toLocaleString()}
            </p>
          </div>
          <div className="mt-4">
            <h3 className="text-md font-medium text-gray-900 dark:text-white">Your PIN Allowances</h3>
            {Object.keys(pins).length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">No PINs available</p>
            ) : (
              Object.entries(pins).map(([pin, data]) => (
                <p key={pin} className="text-sm text-gray-600 dark:text-gray-400">
                  PIN {pin}: Remaining R {(data.allowedAmount - data.usedAmount).toLocaleString()}
                </p>
              ))
            )}
          </div>
        </div>

        {/* Exchange Rates */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Exchange Rates</h2>
            <span className="text-xs text-gray-500">
              Last updated: {new Date(rateData.lastUpdated).toLocaleString()}
            </span>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">VALR Rate (USDC/ZAR):</span>
              <span className="font-medium text-gray-900 dark:text-white">
                R {rateData.valrRate.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Market Rate (ZAR/USD):</span>
              <span className="font-medium text-gray-900 dark:text-white">
                R {rateData.marketRate.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Current Spread:</span>
              <span
                className={`font-medium ${
                  rateData.spread > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {rateData.spread.toFixed(2)}%
              </span>
            </div>
          </div>
          
        </div>
      </div>

      {/* Current Investment (Open Trade Info) */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Current Investment</h2>
          {openTrades.length === 0 ? (
            <button onClick={handleOpenNewTrade} className="text-sm px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center">
              <Plus className="h-4 w-4 mr-1" /> New Trade
            </button>
          ) : (
            <Link to="/trades" className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 flex items-center">
              View All <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          )}
        </div>
        {openTrades.length === 0 ? (
          <div className="p-4 sm:p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No open trades. Start a new trade to track your arbitrage profits.
            </p>
            <button onClick={handleOpenNewTrade} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md inline-flex items-center">
              <Plus className="h-4 w-4 mr-2" /> New Trade
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table for Open Trades */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial ZAR</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">USD</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Profit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ROI</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {openTrades.map((trade) => {
                    const wireTransferFee = Math.max(
                      (trade.wireTransferFee / 100) * trade.usdPurchased,
                      userData.defaultMinWireTransferFee
                    );
                    const usdAfterFee = trade.usdPurchased - wireTransferFee;
                    const currentValue = usdAfterFee * rateData.valrRate - (trade.withdrawalFee + capitecFee);
                    const liveProfit = currentValue - trade.initialZAR;
                    const liveROI = trade.initialZAR > 0 ? (liveProfit / trade.initialZAR) * 100 : 0;
                    return (
                      <tr key={trade.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {new Date(trade.tradeDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{trade.tradeName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          R {trade.initialZAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          $ {trade.usdPurchased.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-sm ${liveProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          R {liveProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-sm ${liveROI >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {liveROI.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <button onClick={() => handleOpenCloseTradeForm(trade.id)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                            Close Trade
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile Cards for Open Trades */}
            <div className="md:hidden space-y-4">
              {openTrades.map((trade) => {
                const wireTransferFee = Math.max(
                  (trade.wireTransferFee / 100) * trade.usdPurchased,
                  userData.defaultMinWireTransferFee
                );
                const usdAfterFee = trade.usdPurchased - wireTransferFee;
                const currentValue = usdAfterFee * rateData.valrRate - (trade.withdrawalFee + capitecFee);
                const liveProfit = currentValue - trade.initialZAR;
                const liveROI = trade.initialZAR > 0 ? (liveProfit / trade.initialZAR) * 100 : 0;
                return (
                  <ResponsiveTradeCard
                    key={trade.id}
                    trade={{ ...trade, profitZAR: liveProfit, profitPercentage: liveROI }}
                    onEdit={() => handleEditTrade(trade.id)}
                    onDelete={() => { /* Not implemented in dashboard */ }}
                    onClose={handleOpenCloseTradeForm}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Profit History */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4">Profit History</h2>
        <ProfitChart />
      </div>

      {/* Recent Closed Trades */}
      {recentClosedTrades.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Recent Closed Trades</h2>
            <Link to="/trades" className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 flex items-center">
              View All <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial ZAR</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">USD</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Market Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Profit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ROI</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {recentClosedTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(trade.tradeDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{trade.tradeName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      R {trade.initialZAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      $ {trade.usdPurchased.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      R {trade.marketRate.toFixed(4)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm ${trade.profitZAR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      R {trade.profitZAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm ${trade.profitPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {trade.profitPercentage.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-4">
            {recentClosedTrades.map((trade) => (
              <ResponsiveTradeCard key={trade.id} trade={trade} onEdit={() => {}} onDelete={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const handleEditTrade = (id: string) => {
  console.log(`Edit trade ${id} requested from dashboard`);
};

export default Dashboard;
