import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../lib/firebase';
import { ref, get, set, update } from 'firebase/database';
import { auth } from '../lib/firebase';
import { updateEmail, updatePassword, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { Save, RotateCw, Check, Mail, Lock, User, Moon, AlertCircle, DollarSign, RefreshCw } from 'lucide-react';

function Settings() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

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

  // Load user settings from Firebase
  useEffect(() => {
    if (!currentUser) return;
    
    const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
    get(userSettingsRef).then((snapshot) => {
      const userData = snapshot.exists() ? snapshot.val() : {};
      
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
      
      setLoading(false);
    }).catch((error) => {
      console.error("Error loading settings:", error);
      setError("Failed to load settings. Please try again.");
      setLoading(false);
    });
  }, [currentUser]);

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
                  <User className="w-4 h-4 mr-2" />
                  Display Name
                </div>
              </label>
              <input
                type="text"
                name="displayName"
                value={authFormData.displayName}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Your display name"
              />
            </div>

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
        
        {/* Application Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Application Settings</h2>
          
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="darkMode"
                id="darkMode"
                checked={formData.darkMode}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="darkMode" className="ml-2 flex items-center text-sm text-gray-700 dark:text-gray-300">
                <Moon className="w-4 h-4 mr-2" />
                Dark Mode
              </label>
            </div>
          </div>
        </div>
        
        {/* Trade Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Trade Settings</h2>
          
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <div className="flex items-center">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Default Initial Investment (ZAR)
                  </div>
                </label>
                <input
                  type="number"
                  name="initialInvestment"
                  value={formData.initialInvestment}
                  onChange={handleInputChange}
                  min="0"
                  step="1000"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <div className="flex items-center">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Default USD Purchased
                  </div>
                </label>
                <input
                  type="number"
                  name="usdPurchased"
                  value={formData.usdPurchased}
                  onChange={handleInputChange}
                  min="0"
                  step="100"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <div className="flex items-center">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Default Wire Transfer Fee (%)
                  </div>
                </label>
                <input
                  type="number"
                  name="defaultWireTransferFee"
                  value={formData.defaultWireTransferFee}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <div className="flex items-center">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Minimum Wire Transfer Fee (USD)
                  </div>
                </label>
                <input
                  type="number"
                  name="defaultMinWireTransferFee"
                  value={formData.defaultMinWireTransferFee}
                  onChange={handleInputChange}
                  min="0"
                  step="1"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <div className="flex items-center">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Default Withdrawal Fee (ZAR)
                </div>
              </label>
              <input
                type="number"
                name="defaultWithdrawalFee"
                value={formData.defaultWithdrawalFee}
                onChange={handleInputChange}
                min="0"
                step="1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RotateCw className="animate-spin -ml-1 mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              <>
                <Save className="-ml-1 mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Settings;