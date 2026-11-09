import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BathroomViewer } from "@/components/bathroom/BathroomViewer";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="h-svh w-full">
      <BathroomViewer />
    </div>
  </StrictMode>,
);
