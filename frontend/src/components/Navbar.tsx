import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, X, Home, TrendingUp, Settings, LogOut, LogIn } from 'lucide-react';

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const isActive = (path: string) =>
    location.pathname === path ? 
      'bg-blue-700 text-white' : 
      'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800';

  return (
    <nav className="bg-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <Link to="/" className="text-xl font-bold text-white flex items-center">
            Harbitrage
          </Link>

          {/* Desktop Navigation - Hidden on mobile */}
          <div className="hidden md:flex space-x-4">
            <Link to="/" className={`px-3 py-2 rounded ${isActive('/')}`}>Dashboard</Link>
            <Link to="/trades" className={`px-3 py-2 rounded ${isActive('/trades')}`}>Trades</Link>
            <Link to="/settings" className={`px-3 py-2 rounded ${isActive('/settings')}`}>Settings</Link>
          </div>

          {/* Auth Button - Hidden on mobile */}
          <div className="hidden md:block">
            {currentUser ? (
              <button 
                className="px-4 py-2 bg-red-500 rounded text-white" 
                onClick={logout}
              >
                Logout
              </button>
            ) : (
              <Link to="/login" className="px-4 py-2 bg-blue-600 text-white rounded">
                Login
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="text-gray-300 hover:text-white focus:outline-none"
              aria-label="toggle menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`md:hidden ${isMenuOpen ? 'block' : 'hidden'}`}>
        <div className="px-2 pt-2 pb-3 space-y-1 bg-gray-800">
          <Link 
            to="/" 
            className={`flex items-center px-3 py-2 rounded ${isActive('/')}`}
            onClick={closeMenu}
          >
            <Home className="mr-2 h-5 w-5" />
            <span>Dashboard</span>
          </Link>
          <Link 
            to="/trades" 
            className={`flex items-center px-3 py-2 rounded ${isActive('/trades')}`}
            onClick={closeMenu}
          >
            <TrendingUp className="mr-2 h-5 w-5" />
            <span>Trades</span>
          </Link>
          <Link 
            to="/settings" 
            className={`flex items-center px-3 py-2 rounded ${isActive('/settings')}`}
            onClick={closeMenu}
          >
            <Settings className="mr-2 h-5 w-5" />
            <span>Settings</span>
          </Link>
          
          {/* Mobile Auth Button */}
          <div className="pt-2 border-t border-gray-700">
            {currentUser ? (
              <button 
                className="flex items-center w-full px-3 py-2 rounded text-red-400 hover:bg-gray-700"
                onClick={() => {
                  logout();
                  closeMenu();
                }}
              >
                <LogOut className="mr-2 h-5 w-5" />
                <span>Logout</span>
              </button>
            ) : (
              <Link 
                to="/login" 
                className="flex items-center px-3 py-2 rounded text-blue-400 hover:bg-gray-700"
                onClick={closeMenu}
              >
                <LogIn className="mr-2 h-5 w-5" />
                <span>Login</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;