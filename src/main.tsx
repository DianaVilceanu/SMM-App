import { createRoot } from "react-dom/client";
import "./styles.css";
import "./routes";
import { StudioShell } from "./studio/components/Shell";

createRoot(document.getElementById("root")!).render(<StudioShell />);
