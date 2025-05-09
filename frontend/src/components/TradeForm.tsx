import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../lib/firebase';
import { ref, push, get, set } from 'firebase/database';
import { X } from 'lucide-react';

interface TradeFormProps {
  onClose: () => void;
  onTradeAdded: () => void;
  tradeId?: string | null;
  isClosingTrade?: boolean;
}

interface UserSettings {
  initialInvestment: number;
  usdPurchased: number;
  defaultWireTransferFee: number;
  defaultMinWireTransferFee: number;
  defaultWithdrawalFee: number;
}

const TradeForm: React.FC<TradeFormProps> = ({
  onClose,
  onTradeAdded,
  tradeId,
  isClosingTrade = false
}) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditMode, setIsEditMode] = useState(!!tradeId);
  const [lastChanged, setLastChanged] = useState<'usd' | 'rate' | null>(null);
  const [userChangedMarketRate, setUserChangedMarketRate] = useState(false);

  // Constants
  const CAPITEC_FEE = 500;

  const [userSettings, setUserSettings] = useState<UserSettings>({
    initialInvestment: 50000,
    usdPurchased: 2500,
    defaultWireTransferFee: 0.13,
    defaultMinWireTransferFee: 10,
    defaultWithdrawalFee: 30
  });

  const [currentRates, setCurrentRates] = useState({
    valrRate: 0,
    marketRate: 0
  });

  const [formData, setFormData] = useState({
    tradeName: '',
    tradeDate: new Date().toISOString().split('T')[0],
    initialZAR: 0,
    usdPurchased: 0,
    valrRate: 0,
    marketRate: 0,
    wireTransferFee: 0,
    withdrawalFee: 0,
    taxPin: '',
    notes: '',
    status: 'open' as 'open' | 'closed'
  });

  // Calculations
  const spread = formData.valrRate > 0 && formData.marketRate > 0
    ? ((formData.valrRate / formData.marketRate) - 1) * 100
    : 0;

  const wireTransferFeeAmount = Math.max(
    (formData.wireTransferFee / 100) * formData.usdPurchased,
    userSettings.defaultMinWireTransferFee
  );

  const usdAfterFee = formData.usdPurchased - wireTransferFeeAmount;
  const zarFromUsdc = usdAfterFee * formData.valrRate;
  const finalZAR = zarFromUsdc - formData.withdrawalFee - CAPITEC_FEE;
  const profitZAR = finalZAR - formData.initialZAR;
  const profitPercentage = formData.initialZAR > 0
    ? (profitZAR / formData.initialZAR) * 100
    : 0;

  useEffect(() => {
    if (!currentUser) return;

    const loadData = async () => {
      try {
        // Load user settings
        const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
        const userSettingsSnap = await get(userSettingsRef);
        if (userSettingsSnap.exists()) {
          const settingsData = userSettingsSnap.val();
          setUserSettings(settingsData);

          if (!isEditMode && !isClosingTrade) {
            setFormData(prev => ({
              ...prev,
              initialZAR: settingsData.initialInvestment || 50000,
              usdPurchased: settingsData.usdPurchased || 2500,
              wireTransferFee: settingsData.defaultWireTransferFee || 0.13,
              withdrawalFee: settingsData.defaultWithdrawalFee || 30
            }));
          }
        }

        // Load current rates
        const ratesRef = ref(database, 'currentRates');
        const ratesSnap = await get(ratesRef);
        if (ratesSnap.exists()) {
          const ratesData = ratesSnap.val();
          setCurrentRates({
            valrRate: ratesData.valrRate || 0,
            marketRate: ratesData.marketRate || 0
          });

          if (!isEditMode && !isClosingTrade) {
            setFormData(prev => ({
              ...prev,
              valrRate: ratesData.valrRate || 0,
              marketRate: userChangedMarketRate ? prev.marketRate : (ratesData.marketRate || 0)
            }));

            // Calculate USD if we have initialZAR and marketRate
            if (!userChangedMarketRate && ratesData.marketRate > 0) {
              const usd = formData.initialZAR / ratesData.marketRate;
              setFormData(prev => ({
                ...prev,
                usdPurchased: usd
              }));
            }
          }
        }

        // Load existing trade data if editing or closing
        if ((isEditMode || isClosingTrade) && tradeId) {
          const tradeRef = ref(database, `trades/${currentUser.uid}/${tradeId}`);
          const tradeSnap = await get(tradeRef);
          
          if (tradeSnap.exists()) {
            const tradeData = tradeSnap.val();
            const ratesData = ratesSnap.exists() ? ratesSnap.val() : { valrRate: 0, marketRate: 0 };

            const closingValrRate = isClosingTrade
              ? (ratesData.valrRate || tradeData.valrRate)
              : tradeData.valrRate;

            const updatedMarketRate = isClosingTrade
              ? (userChangedMarketRate ? formData.marketRate : (ratesData.marketRate || tradeData.marketRate))
              : tradeData.marketRate;

            setFormData({
              tradeName: tradeData.tradeName || '',
              tradeDate: tradeData.tradeDate || new Date().toISOString().split('T')[0],
              initialZAR: tradeData.initialZAR || 0,
              usdPurchased: tradeData.usdPurchased || 0,
              valrRate: closingValrRate || 0,
              marketRate: updatedMarketRate,
              wireTransferFee: tradeData.wireTransferFee || 0,
              withdrawalFee: tradeData.withdrawalFee || userSettings.defaultWithdrawalFee,
              taxPin: tradeData.taxPin || '',
              notes: tradeData.notes || '',
              status: isClosingTrade ? 'closed' : (tradeData.status || 'open')
            });
          } else {
            setError("Trade not found");
            setIsEditMode(false);
          }
        }
      } catch (err) {
        console.error("Failed to load data:", err);
        setError("Failed to load data. Please try again.");
      }
    };

    loadData();
  }, [currentUser, isEditMode, tradeId, userSettings.defaultWithdrawalFee, isClosingTrade, userChangedMarketRate, formData.initialZAR]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Handle non-numeric fields
    if (!['initialZAR', 'usdPurchased', 'marketRate', 'valrRate', 'wireTransferFee', 'withdrawalFee'].includes(name)) {
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    // Parse numeric value
    const parsed = parseFloat(value) || 0;

    // Update form data based on which field changed
    setFormData(prev => {
      const updated = { ...prev, [name]: parsed };

      // Handle market rate changes
      if (name === 'marketRate') {
        setUserChangedMarketRate(true);
        setLastChanged('rate');
        if (parsed > 0 && updated.initialZAR > 0) {
          updated.usdPurchased = updated.initialZAR / parsed;
        }
      }
      
      // Handle USD changes
      else if (name === 'usdPurchased') {
        setLastChanged('usd');
        if (parsed > 0 && updated.initialZAR > 0) {
          updated.marketRate = updated.initialZAR / parsed;
        }
      }
      
      // Handle initial ZAR changes
      else if (name === 'initialZAR') {
        if (parsed > 0) {
          if (lastChanged === 'usd' || lastChanged === null) {
            updated.marketRate = (updated.usdPurchased > 0)
              ? (parsed / updated.usdPurchased)
              : prev.marketRate;
          } else {
            updated.usdPurchased = (updated.marketRate > 0)
              ? (parsed / updated.marketRate)
              : prev.usdPurchased;
          }
        }
      }

      return updated;
    });
  };

  const resetMarketRate = () => {
    if (currentRates.marketRate > 0) {
      setFormData(prev => {
        const marketRate = currentRates.marketRate;
        const usdPurchased = (marketRate > 0 && prev.initialZAR > 0)
          ? (prev.initialZAR / marketRate)
          : prev.usdPurchased;
          
        return {
          ...prev,
          marketRate,
          usdPurchased
        };
      });
      setUserChangedMarketRate(false);
      setLastChanged('rate');
    } else {
      setError("Current market rate is not available");
    }
  };

  const validateForm = () => {
    if (formData.initialZAR <= 0 || formData.usdPurchased <= 0 || 
        formData.valrRate <= 0 || formData.marketRate <= 0) {
      setError("Please fill in all required fields with valid numbers");
      return false;
    }
    if (isClosingTrade && !formData.taxPin) {
      setError("Please enter a tax reference number to complete the trade closure");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setError("You must be logged in to add a trade");
      return;
    }
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const tradeData = {
        userId: currentUser.uid,
        tradeName: formData.tradeName || `Trade on ${formData.tradeDate}`,
        tradeDate: formData.tradeDate,
        initialZAR: formData.initialZAR,
        usdPurchased: formData.usdPurchased,
        valrRate: formData.valrRate,
        marketRate: formData.marketRate,
        spread,
        wireTransferFee: formData.wireTransferFee,
        withdrawalFee: formData.withdrawalFee,
        capitecFee: CAPITEC_FEE,
        usdAfterFee,
        zarFromUsdc,
        finalZAR,
        profitZAR,
        profitPercentage,
        taxPin: formData.taxPin,
        notes: formData.notes,
        status: isClosingTrade ? 'closed' : formData.status,
        updatedAt: new Date().toISOString()
      };

      if (isClosingTrade) {
        tradeData.closedAt = new Date().toISOString();
      }

      if (isEditMode || isClosingTrade) {
        if (!tradeId) throw new Error("Trade ID is missing");

        const existingTradeRef = ref(database, `trades/${currentUser.uid}/${tradeId}`);
        const existingTradeSnap = await get(existingTradeRef);
        const createdAt = existingTradeSnap.exists()
          ? existingTradeSnap.val().createdAt
          : new Date().toISOString();

        await set(ref(database, `trades/${currentUser.uid}/${tradeId}`), {
          ...tradeData,
          createdAt
        });

        if (isClosingTrade) {
          const profitHistoryRef = ref(database, `profitHistory/${currentUser.uid}`);
          await push(profitHistoryRef, {
            timestamp: new Date().toISOString(),
            initialZAR: formData.initialZAR,
            usdPurchased: formData.usdPurchased,
            valrRate: formData.valrRate,
            marketRate: formData.marketRate,
            spread,
            wireTransferFee: formData.wireTransferFee,
            finalZAR,
            profitZAR,
            profitPercentage,
            tradeId
          });
        }
      } else {
        tradeData.createdAt = new Date().toISOString();
        const tradesRef = ref(database, `trades/${currentUser.uid}`);
        await push(tradesRef, tradeData);
      }

      onTradeAdded();
      onClose();
    } catch (err) {
      console.error("Error saving trade:", err);
      setError("Failed to save trade. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {isClosingTrade 
                ? 'Close Trade' 
                : isEditMode 
                  ? 'Edit Trade' 
                  : 'Record New Trade'}
            </h2>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X size={24} />
            </button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name & Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trade Name (Optional)
                </label>
                <input
                  type="text"
                  name="tradeName"
                  value={formData.tradeName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="E.g., January Trade"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trade Date *
                </label>
                <input
                  type="date"
                  name="tradeDate"
                  value={formData.tradeDate}
                  onChange={handleInputChange}
                  required
                  disabled={isClosingTrade}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* ZAR & USD */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Initial ZAR Amount *
                </label>
                <input
                  type="number"
                  name="initialZAR"
                  value={formData.initialZAR || ''}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="any"
                  disabled={isClosingTrade}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  USD Purchased *
                </label>
                <input
                  type="number"
                  name="usdPurchased"
                  value={formData.usdPurchased || ''}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="any"
                  disabled={isClosingTrade}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Rates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  VALR Rate (USDC/ZAR) *
                </label>
                <input
                  type="number"
                  name="valrRate"
                  value={formData.valrRate || ''}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="any"
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                    isClosingTrade ? 'bg-blue-50 dark:bg-blue-900 font-medium' : ''
                  }`}
                />
                {isClosingTrade && (
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    Current VALR rate is being used for closing this trade
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Market Rate (ZAR/USD) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    name="marketRate"
                    value={formData.marketRate || ''}
                    onChange={handleInputChange}
                    required
                    min="0"
                    step="any"
                    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      userChangedMarketRate ? 'border-yellow-400 dark:border-yellow-600' : ''
                    } ${isClosingTrade ? 'bg-blue-50 dark:bg-blue-900 font-medium' : ''}`}
                  />
                  {userChangedMarketRate && (
                    <button
                      type="button"
                      onClick={resetMarketRate}
                      className="absolute right-2 top-2 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                    >
                      Reset
                    </button>
                  )}
                </div>
                {userChangedMarketRate && (
                  <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                    Custom market rate entered (differs from default API rate: {currentRates.marketRate.toFixed(4)})
                  </p>
                )}
              </div>
            </div>

            {/* Fees */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Wire Transfer Fee (%)
                </label>
                <input
                  type="number"
                  name="wireTransferFee"
                  value={formData.wireTransferFee || ''}
                  onChange={handleInputChange}
                  min="0"
                  step="any"
                  disabled={isClosingTrade}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Withdrawal Fee (ZAR)
                </label>
                <input
                  type="number"
                  name="withdrawalFee"
                  value={formData.withdrawalFee || ''}
                  onChange={handleInputChange}
                  min="0"
                  step="any"
                  disabled={isClosingTrade}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Tax Reference */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tax Reference Number {isClosingTrade && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                name="taxPin"
                value={formData.taxPin}
                onChange={handleInputChange}
                required={isClosingTrade}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                  isClosingTrade ? 'bg-yellow-50 dark:bg-yellow-900' : ''
                }`}
                placeholder="For tax reporting purposes"
              />
              {isClosingTrade && !formData.taxPin && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Tax reference number is required to close this trade
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Any additional notes about this trade"
              />
            </div>

            {/* Trade Summary */}
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Trade Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-600 dark:text-gray-400">Spread:</div>
                <div className={`font-medium ${spread > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                  {spread.toFixed(2)}%
                </div>

                <div className="text-gray-600 dark:text-gray-400">Wire Transfer Fee:</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  ${wireTransferFeeAmount.toFixed(2)} ({formData.wireTransferFee}%)
                </div>

                <div className="text-gray-600 dark:text-gray-400">USD After Fee:</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  ${usdAfterFee.toFixed(2)}
                </div>

                <div className="text-gray-600 dark:text-gray-400">ZAR From USDC:</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  R{zarFromUsdc.toFixed(2)}
                </div>

                <div className="text-gray-600 dark:text-gray-400">Capitec Fee:</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  R{CAPITEC_FEE.toFixed(2)}
                </div>

                <div className="text-gray-600 dark:text-gray-400">Final ZAR:</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  R{finalZAR.toFixed(2)}
                </div>

                <div className="text-gray-600 dark:text-gray-400">Profit:</div>
                <div className={`font-medium ${profitZAR > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  R{profitZAR.toFixed(2)} ({profitPercentage.toFixed(2)}%)
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 ${
                  isClosingTrade 
                    ? 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600' 
                    : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                }`}
              >
                {loading 
                  ? 'Saving...' 
                  : isClosingTrade 
                    ? 'Close Trade' 
                    : isEditMode 
                      ? 'Update Trade' 
                      : 'Save Trade'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TradeForm;