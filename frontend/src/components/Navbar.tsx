import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800';

  return (
    <nav className="bg-gray-800">
      <div className="container mx-auto flex items-center justify-between p-4">
        <Link to="/" className="text-xl font-bold text-white">NumbaGoUp</Link>
        <div className="space-x-4">
          <Link to="/" className={`px-3 py-2 rounded ${isActive('/')}`}>Dashboard</Link>
          <Link to="/trades" className={`px-3 py-2 rounded ${isActive('/trades')}`}>Trades</Link>
          <Link to="/settings" className={`px-3 py-2 rounded ${isActive('/settings')}`}>Settings</Link>
        </div>
        <div>
          {currentUser ? (
            <button className="px-4 py-2 bg-red-500 rounded text-white" onClick={logout}>
              Logout
            </button>
          ) : (
            <Link to="/login" className="px-4 py-2 bg-blue-600 text-white rounded">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
