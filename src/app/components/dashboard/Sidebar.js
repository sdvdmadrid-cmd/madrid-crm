import React, { Suspense } from 'react';
import Logo from '../shared/Logo';

const Sidebar = () => {
  return (
    <div className="sidebar">
      <Logo variant="primary" />
      <Suspense fallback={<div className="loader">Loading...</div>}>
        <nav>
          {/* Sidebar items */}
        </nav>
      </Suspense>
    </div>
  );
};

export default Sidebar;