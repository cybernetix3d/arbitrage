import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { ref, onValue } from 'firebase/database';
import { database } from '../lib/firebase';

interface ProfitData {
  timestamp: number;
  profitZAR: number;
  profitPercentage: number;
  spread: number;
  initialZAR?: number;
  usdPurchased?: number;
  valrRate?: number;
  marketRate?: number;
  originalMarketRate?: number;
  markup?: number;
  finalZAR?: number;
  wireTransferFee?: number;
  tradeId?: string;
  id?: string;
  date?: string;
}

const ProfitChart: React.FC = () => {
  const [profitHistory, setProfitHistory] = useState<ProfitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('all');
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    const profitHistoryRef = ref(database, `profitHistory/${currentUser.uid}`);

    const unsubscribe = onValue(profitHistoryRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        try {
          // Convert object to array and ensure proper data format
          const historyArray = Object.keys(data).map(key => {
            const entry = data[key];

            // Ensure all required fields exist and are numbers
            const processedEntry = {
              id: key,
              timestamp: new Date(entry.timestamp).getTime(),
              profitZAR: Number(entry.profitZAR) || 0,
              profitPercentage: Number(entry.profitPercentage) || 0,
              spread: Number(entry.spread) || 0,
              initialZAR: Number(entry.initialZAR) || 0,
              usdPurchased: Number(entry.usdPurchased) || 0,
              valrRate: Number(entry.valrRate) || 0,
              marketRate: Number(entry.marketRate) || 0,
              finalZAR: Number(entry.finalZAR) || 0
            };
            return processedEntry;
          });

          // Sort by timestamp
          historyArray.sort((a, b) => a.timestamp - b.timestamp);

          // Filter based on time range
          const now = new Date().getTime();
          let filteredData = [...historyArray];

          if (timeRange === '7d') {
            const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
            filteredData = historyArray.filter(item => item.timestamp >= sevenDaysAgo);
          } else if (timeRange === '30d') {
            const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
            filteredData = historyArray.filter(item => item.timestamp >= thirtyDaysAgo);
          } else if (timeRange === '90d') {
            const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
            filteredData = historyArray.filter(item => item.timestamp >= ninetyDaysAgo);
          }

          // Format for chart
          const formattedData = filteredData.map(item => ({
            ...item,
            date: new Date(item.timestamp).toLocaleDateString(),
          }));



          setProfitHistory(formattedData);
        } catch (error) {
          console.error("Error processing profit history data:", error);
          setProfitHistory([]);
        }
      } else {
        setProfitHistory([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, timeRange]);

  const handleTimeRangeChange = (range: '7d' | '30d' | '90d' | 'all') => {
    setTimeRange(range);
  };

  if (loading) {
    return <div className="h-64 flex items-center justify-center">Loading chart data...</div>;
  }

  // Check if we have valid data to display
  const hasValidData = profitHistory.length > 0 &&
    profitHistory.some(item =>
      typeof item.profitZAR === 'number' &&
      typeof item.profitPercentage === 'number' &&
      typeof item.spread === 'number'
    );



  if (!hasValidData) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
        <p>No profit history data available.</p>
        <p className="text-sm mt-2">Record trades to start tracking your profit over time.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4 space-x-2">
        <button
          onClick={() => handleTimeRangeChange('7d')}
          className={`px-3 py-1 text-xs rounded-md ${
            timeRange === '7d'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
          }`}
        >
          7D
        </button>
        <button
          onClick={() => handleTimeRangeChange('30d')}
          className={`px-3 py-1 text-xs rounded-md ${
            timeRange === '30d'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
          }`}
        >
          30D
        </button>
        <button
          onClick={() => handleTimeRangeChange('90d')}
          className={`px-3 py-1 text-xs rounded-md ${
            timeRange === '90d'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
          }`}
        >
          90D
        </button>
        <button
          onClick={() => handleTimeRangeChange('all')}
          className={`px-3 py-1 text-xs rounded-md ${
            timeRange === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
          }`}
        >
          All
        </button>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={profitHistory} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#9CA3AF' }}
            tickMargin={10}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#9CA3AF' }}
            tickFormatter={(value) => `R${value.toLocaleString()}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#9CA3AF' }}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              borderColor: '#4B5563',
              color: '#E5E7EB'
            }}
            formatter={(value: number | string, name: string) => {
              if (name === 'profitZAR') return [`R${Number(value).toLocaleString()}`, 'Profit (ZAR)'];
              if (name === 'profitPercentage') return [`${Number(value).toFixed(2)}%`, 'ROI'];
              if (name === 'spread') return [`${Number(value).toFixed(2)}%`, 'Spread'];
              return [value.toString(), name];
            }}
          />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="profitZAR"
            name="Profit (ZAR)"
            stroke="#10B981"
            activeDot={{ r: 8 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="profitPercentage"
            name="ROI"
            stroke="#3B82F6"
            activeDot={{ r: 8 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="spread"
            name="Spread %"
            stroke="#F59E0B"
            activeDot={{ r: 8 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfitChart;
