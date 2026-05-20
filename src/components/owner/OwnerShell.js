
import styles from './OwnerShell.module.css';
import OwnerSidebar from './OwnerSidebar';
import OwnerHeader from './OwnerHeader';

export default function OwnerShell({ children }) {
  return (
    <div className={styles['owner-shell']}>
      <OwnerSidebar />
      <div className={styles['owner-main']}>
        <OwnerHeader />
        <main className={styles['owner-content']}>{children}</main>
      </div>
    </div>
  );
}
