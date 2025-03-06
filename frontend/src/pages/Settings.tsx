import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../lib/firebase';
import { ref, get, set } from 'firebase/database';
import { auth } from '../lib/firebase';
import { updateEmail, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { Save, RotateCw, Check, Mail, Lock, User, Moon, AlertCircle } from 'lucide-react';

function Settings() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    darkMode: false
  });

  // Load user settings from Firebase
  useEffect(() => {
    if (!currentUser) return;
    
    const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
    get(userSettingsRef).then((snapshot) => {
      const userData = snapshot.exists() ? snapshot.val() : {};
      
      setFormData({
        displayName: currentUser.displayName || '',
        email: currentUser.email || '',
        darkMode: userData.darkMode || false
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
      setFormData({
        ...formData,
        [name]: (e.target as HTMLInputElement).checked
      });
      return;
    }
    
    // Handle other input types
    setFormData({
      ...formData,
      [name]: value
    });
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
      // Save display name and other preferences to Firebase
      const userSettingsRef = ref(database, `userSettings/${currentUser.uid}`);
      await set(userSettingsRef, {
        displayName: formData.displayName,
        darkMode: formData.darkMode
      });
      
      // Update email if changed
      if (formData.email !== currentUser.email) {
        await updateEmail(currentUser, formData.email);
      }
      
      // Show success message and hide after 3 seconds
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error saving settings:", error);
      if (error.code === 'auth/requires-recent-login') {
        setError("For security reasons, please log out and log back in to change your email.");
      } else {
        setError("Failed to save settings: " + error.message);
      }
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

  // Handle dark mode toggle
  useEffect(() => {
    if (formData.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [formData.darkMode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Account Settings</h1>
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

      <form onSubmit={handleSubmit}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
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
                value={formData.displayName}
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
                value={formData.email}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="your.email@example.com"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Changing your email will require you to verify the new address
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
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
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
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