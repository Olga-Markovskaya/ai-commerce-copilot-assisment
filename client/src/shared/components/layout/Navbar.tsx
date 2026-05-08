import { NavLink } from "react-router-dom";
import styles from "@shared/styles/layout/navbar.module.css";

export function Navbar() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <NavLink to="/" className={styles.brand} end>
          Commerce Copilot
        </NavLink>
        <nav className={styles.nav} aria-label="Main">
          <NavLink
            to="/"
            className={({ isActive }) =>
              [styles.link, isActive ? styles.active : ""].filter(Boolean).join(" ")
            }
            end
          >
            Home
          </NavLink>
          <NavLink
            to="/products"
            className={({ isActive }) =>
              [styles.link, isActive ? styles.active : ""].filter(Boolean).join(" ")
            }
          >
            Products
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
