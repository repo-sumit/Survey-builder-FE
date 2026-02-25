import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation = () => {
  const location = useLocation();

  return (
    <nav className="navigation">
      <div className="nav-container">
        <h1 className="nav-title">FMB Survey Builder</h1>
        <div className="nav-links">
          <Link 
            to="/" 
            className={location.pathname === '/' ? 'nav-link active' : 'nav-link'}
          >
            Surveys
          </Link>
          <Link 
            to="/import" 
            className={location.pathname === '/import' ? 'nav-link active' : 'nav-link'}
          >
            Import
          </Link>
          <Link 
            to="/validate-upload" 
            className={location.pathname === '/validate-upload' ? 'nav-link active' : 'nav-link'}
          >
            Validate Upload
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
