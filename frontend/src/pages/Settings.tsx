import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../lib/firebase';
import { ref, get, set, update, remove } from 'firebase/database';
import { auth } from '../lib/firebase';
import { updateEmail, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { Save, RotateCw, Check, Mail, Lock, AlertCircle, Plus, Trash2 } from 'lucide-react';

interface PinData {
  allowedAmount: number;
  usedAmount: number;
  allowanceType: string;
  createdAt: string;
  expiresAt: string;
}

function Settings() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [userPins, setUserPins] = useState<Record<string, PinData>>({});
  const [pinForm, setPinForm] = useState({ pinNumber: '', allowedAmount: 0 });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  // User auth details
  const [authFormData, setAuthFormData] = useState({
    displayName: '',
    email: '',
    currentPassword: '',
  });
  
  // App settings and preferences
  const [formData, setFormData] = useState({
    darkMode: false,
    initialInvestment: 50000,
    usdPurchased: 2500,
    defaultWireTransferFee: 0.13,
    defaultMinWireTransferFee: 10,
    defaultWithdrawalFee: 30
  });

  // Annual allowance limits and usage
  const [annualAllowance, setAnnualAllowance] = useState({
    SDAUsed: 0,
    foreignUsed: 0
  });

  const ANNUAL_FOREIGN_ALLOWANCE = 10000000; // R10 million
  const ANNUAL_SDA_ALLOWANCE = 1000000; // R1 million

  // Load user settings from Firebase
  useEffect(() => {
    if (!currentUser) return;
    
    const loadData = async () => {
      try {
        const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
        const userSettingsSnap = await get(userSettingsRef);
        const userData = userSettingsSnap.exists() ? userSettingsSnap.val() : {};
        
        // Get current dark mode setting from HTML element
        const isDarkMode = document.documentElement.classList.contains('dark');
        
        // Set auth form data
        setAuthFormData({
          displayName: currentUser.displayName || '',
          email: currentUser.email || '',
          currentPassword: '',
        });
        
        // Set app settings
        setFormData({
          darkMode: userData.darkMode !== undefined ? userData.darkMode : isDarkMode,
          initialInvestment: userData.initialInvestment || 50000,
          usdPurchased: userData.usdPurchased || 2500,
          defaultWireTransferFee: userData.defaultWireTransferFee || 0.13,
          defaultMinWireTransferFee: userData.defaultMinWireTransferFee || 10,
          defaultWithdrawalFee: userData.defaultWithdrawalFee || 30
        });
        
        // Load user PINs
        const pinsRef = ref(database, `userPins/${currentUser.uid}`);
        const pinsSnap = await get(pinsRef);
        if (pinsSnap.exists()) {
          setUserPins(pinsSnap.val());
        }
        
        // Load annual allowance data
        const allowanceRef = ref(database, `userAnnualAllowance/${currentUser.uid}/${currentYear}`);
        const allowanceSnap = await get(allowanceRef);
        if (allowanceSnap.exists()) {
          setAnnualAllowance(allowanceSnap.val());
        }
        
        setLoading(false);
      } catch (error) {
        console.error("Error loading settings:", error);
        setError("Failed to load settings. Please try again.");
        setLoading(false);
      }
    };
    
    loadData();
  }, [currentUser, currentYear]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    
    // Handle checkbox inputs
    if (type === 'checkbox') {
      const isChecked = (e.target as HTMLInputElement).checked;
      
      // Handle dark mode toggle immediately
      if (name === 'darkMode') {
        setFormData({
          ...formData,
          darkMode: isChecked
        });
        
        // Update the dark mode class immediately
        if (isChecked) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        
        // Also save the dark mode setting immediately
        if (currentUser) {
          const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
          update(userSettingsRef, { darkMode: isChecked })
            .catch(error => console.error("Error saving dark mode setting:", error));
        }
        
        return;
      }
      
      setFormData({
        ...formData,
        [name]: isChecked
      });
      return;
    }
    
    // Handle PIN form inputs
    if (name === 'pinNumber' || name === 'allowedAmount') {
      setPinForm({
        ...pinForm,
        [name]: name === 'allowedAmount' ? parseFloat(value) || 0 : value
      });
      return;
    }
    
    // Handle numeric inputs for trade settings
    if (['initialInvestment', 'usdPurchased', 'defaultWireTransferFee', 'defaultMinWireTransferFee', 'defaultWithdrawalFee'].includes(name)) {
      const parsedValue = parseFloat(value);
      setFormData({
        ...formData,
        [name]: isNaN(parsedValue) ? 0 : parsedValue
      });
      return;
    }
    
    // Handle auth form inputs
    if (['displayName', 'email', 'currentPassword'].includes(name)) {
      setAuthFormData({
        ...authFormData,
        [name]: value
      });
      return;
    }
    
    // Handle other inputs
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const saveAuthSettings = async () => {
    if (!currentUser) return false;
    
    // Update display name in Firebase database
    const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
    await update(userSettingsRef, {
      displayName: authFormData.displayName,
    });
    
    // Update email if changed
    if (authFormData.email !== currentUser.email) {
      if (!authFormData.currentPassword) {
        throw new Error("Current password is required to change email address");
      }
      
      try {
        // Re-authenticate before changing email
        const credential = EmailAuthProvider.credential(
          currentUser.email || '', 
          authFormData.currentPassword
        );
        await reauthenticateWithCredential(currentUser, credential);
        await updateEmail(currentUser, authFormData.email);
        
        // Clear password field after successful update
        setAuthFormData({
          ...authFormData,
          currentPassword: ''
        });
        
        return true;
      } catch (error: any) {
        if (error.code === 'auth/wrong-password') {
          throw new Error("Incorrect password. Please try again.");
        } else if (error.code === 'auth/too-many-requests') {
          throw new Error("Too many failed attempts. Please try again later.");
        } else {
          throw error;
        }
      }
    }
    
    return true;
  };

  const saveAppSettings = async () => {
    if (!currentUser) return false;
    
    // Save app settings to Firebase
    const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
    await update(userSettingsRef, {
      // Dark mode is now saved immediately on toggle
      initialInvestment: formData.initialInvestment,
      usdPurchased: formData.usdPurchased,
      defaultWireTransferFee: formData.defaultWireTransferFee,
      defaultMinWireTransferFee: formData.defaultMinWireTransferFee,
      defaultWithdrawalFee: formData.defaultWithdrawalFee
    });
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      setError("You must be logged in to save settings");
      return;
    }
    
    setSaving(true);
    setError('');
    setSaveSuccess(false);
    
    try {
      // Save auth settings (email, display name)
      await saveAuthSettings();
      
      // Save app settings (trade preferences)
      await saveAppSettings();
      
      // Show success message and hide after 3 seconds
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error saving settings:", error);
      setError(error.message || "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!currentUser || !currentUser.email) {
      setError("No email address available for password reset");
      return;
    }
    
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      setResetEmailSent(true);
      setTimeout(() => setResetEmailSent(false), 5000);
    } catch (error: any) {
      console.error("Error sending password reset:", error);
      setError("Failed to send password reset email: " + error.message);
    }
  };
  
  const handleAddPin = async () => {
    if (!currentUser) {
      setError("You must be logged in to add a PIN");
      return;
    }
    
    if (!pinForm.pinNumber) {
      setError("Please enter a PIN number");
      return;
    }
    
    if (pinForm.allowedAmount <= 0) {
      setError("Please enter a valid allowance amount");
      return;
    }
    
    if (userPins[pinForm.pinNumber]) {
      setError("This PIN already exists");
      return;
    }
    
    setSaving(true);
    setError('');
    
    try {
      const newPinData: PinData = {
        allowedAmount: pinForm.allowedAmount,
        usedAmount: 0,
        allowanceType: "foreign", // Add this line to set the allowance type to "foreign"
        createdAt: new Date().toISOString(),
        expiresAt: new Date(currentYear + 1, 0, 1).toISOString() // Expires next year Jan 1
      };
  
      const pinRef = ref(database, `userPins/${currentUser.uid}/${pinForm.pinNumber}`);
      await set(pinRef, newPinData);
  
      // Update local state to include the new PIN
      setUserPins((prevPins) => ({
        ...prevPins,
        [pinForm.pinNumber]: newPinData
      }));
  
      // Reset the form
      setPinForm({ pinNumber: '', allowedAmount: 0 });
  
      // Show success message
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error adding PIN:", error);
      setError(error.message || "Failed to add PIN. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  
  const handleDeletePin = async (pin: string) => {
    if (!currentUser) {
      setError("You must be logged in to delete a PIN");
      return;
    }
    
    setSaving(true);
    setError('');
    
    try {
      // Check if PIN has been used
      if (userPins[pin].usedAmount > 0) {
        setError(`Cannot delete PIN ${pin} because it has been used in trades. Consider adding a new PIN instead.`);
        setSaving(false);
        return;
      }
      
      // Delete the PIN
      const pinRef = ref(database, `userPins/${currentUser.uid}/${pin}`);
      await remove(pinRef);
      
      // Update local state to remove the deleted PIN
      setUserPins((prevPins) => {
        const updatedPins = { ...prevPins };
        delete updatedPins[pin];
        return updatedPins;
      });
      
      // Reset confirmation
      setConfirmDelete(null);
      
      // Show success message
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error deleting PIN:", error);
      setError(error.message || "Failed to delete PIN. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Account Settings</h1>
        {saveSuccess && (
          <div className="flex items-center text-green-600 dark:text-green-400">
            <Check className="w-5 h-5 mr-1" />
            <span>Settings saved successfully</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-start">
          <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {resetEmailSent && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded flex items-start">
          <Check className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
          <span>Password reset email has been sent to your email address. Please check your inbox.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Profile Information</h2>
          
          <div className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <div className="flex items-center">
                  <Mail className="w-4 h-4 mr-2" />
                  Email Address
                </div>
              </label>
              <input
                type="email"
                name="email"
                value={authFormData.email}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="your.email@example.com"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Changing your email will require you to verify the new address
              </p>
            </div>

            {/* Only show password field if email has changed */}
            {authFormData.email !== currentUser?.email && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <div className="flex items-center">
                    <Lock className="w-4 h-4 mr-2" />
                    Current Password (required to change email)
                  </div>
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  value={authFormData.currentPassword}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Enter your current password"
                  required={authFormData.email !== currentUser?.email}
                />
              </div>
            )}
          </div>
        </div>
        
        {/* Password Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Password</h2>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Password changes are handled securely through Firebase Auth. We'll send you an email with a link to reset your password.
            </p>
            
            <button
              type="button"
              onClick={handlePasswordReset}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600"
            >
              <Lock className="-ml-1 mr-2 h-4 w-4" />
              Send Password Reset Email
            </button>
          </div>
        </div>
        
        {/* Annual Allowances */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Annual Allowances ({currentYear})
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Foreign Investment Allowance
                </h3>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Total Limit:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    R{ANNUAL_FOREIGN_ALLOWANCE.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Used:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    R{annualAllowance.foreignUsed.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Remaining:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    R{(ANNUAL_FOREIGN_ALLOWANCE - annualAllowance.foreignUsed).toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded-full mt-4">
                  <div 
                    className="h-2 bg-green-500 rounded-full" 
                    style={{ width: `${Math.min(100, (annualAllowance.foreignUsed / ANNUAL_FOREIGN_ALLOWANCE) * 100)}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Single Discretionary Allowance
                </h3>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Total Limit:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    R{ANNUAL_SDA_ALLOWANCE.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Used:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    R{annualAllowance.SDAUsed.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Remaining:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    R{(ANNUAL_SDA_ALLOWANCE - annualAllowance.SDAUsed).toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded-full mt-4">
                  <div 
                    className="h-2 bg-green-500 rounded-full" 
                    style={{ width: `${Math.min(100, (annualAllowance.SDAUsed / ANNUAL_SDA_ALLOWANCE) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* PIN Management */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Tax PIN Management
          </h2>
          
          <div className="space-y-6">
            {/* Add PIN form */}
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Add a New PIN
              </h3>
              <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    PIN Number
                  </label>
                  <input
                    type="text"
                    name="pinNumber"
                    value={pinForm.pinNumber}
                    onChange={handleInputChange}
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-600 dark:text-white"
                    placeholder="Enter PIN number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-700 dark:text-gray-300 mb-1">
                    Allowed Amount (ZAR)
                  </label>
                  <input
                    type="number"
                    name="allowedAmount"
                    value={pinForm.allowedAmount || ''}
                    onChange={handleInputChange}
                    min="0"
                    step="1000"
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-600 dark:text-white"
                    placeholder="e.g. 100000"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddPin}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Plus className="-ml-1 mr-2 h-4 w-4" />
                Add PIN
              </button>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                PINs are used to track tax allowances for each foreign investment. Add a PIN for each tax clearance certificate you have.
              </p>
            </div>
            
            {/* Current PINs */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Your PINs
              </h3>
              
              {Object.keys(userPins).length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">
                  No PINs added yet. Add a PIN above to get started.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PIN</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Allowed Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Used Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remaining</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expires</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {Object.entries(userPins).map(([pin, data]) => (
                        <tr key={pin}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {pin}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            R{data.allowedAmount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            R{data.usedAmount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                            R{(data.allowedAmount - data.usedAmount).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {new Date(data.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                            {confirmDelete === pin ? (
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePin(pin)}
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(null)}
                                  className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(pin)}
                                disabled={data.usedAmount > 0}
                                className={`text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 ${
                                  data.usedAmount > 0 ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                Note: PINs that have been used in trades cannot be deleted. Once a PIN has been fully utilized, you can add a new PIN.
              </p>
            </div>
          </div>
        </div>

        {/* Save Settings Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {saving ? (
              <RotateCw className="animate-spin mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}

export default Settings;
