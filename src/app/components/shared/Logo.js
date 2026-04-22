import React from 'react';
import styles from './Logo.module.css';

const Logo = ({ variant = 'primary' }) => {
  const logoSrc = variant === 'primary' ? '/images/logo-blue.svg' : '/images/logo-green.svg';
  return (
    <div className={styles.logoContainer}>
      <img src={logoSrc} alt="App Logo" className={styles.logo} />
    </div>
  );
};

export default Logo;