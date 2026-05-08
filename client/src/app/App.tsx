import { FloatingAssistantButton } from "@features/assistant";
import { Navbar } from "@shared/components/layout/Navbar";
import { AppRoutes } from "@app/router";
import "@shared/styles/layout/app-layout.css";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <AppRoutes />
      </main>
      <FloatingAssistantButton />
    </div>
  );
}
