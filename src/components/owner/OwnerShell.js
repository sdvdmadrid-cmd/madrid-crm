import styles from "./OwnerShell.module.css";
import OwnerHeader from "./OwnerHeader";
import OwnerSidebar from "./OwnerSidebar";

export default function OwnerShell({ children }) {
  return (
    <div className={styles.ownerShell}>
      <OwnerSidebar />
      <div className={styles.ownerMain}>
        <OwnerHeader />
        <main className={styles.ownerContent}>{children}</main>
      </div>
    </div>
  );
}
