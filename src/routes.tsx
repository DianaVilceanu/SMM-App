import type { ReactNode } from "react";
import { registerRoutes } from "./router";
import { Overview } from "./studio/pages/Overview";
import { BrandDetail, BrandsList } from "./studio/pages/Brands";
import { Calendar } from "./studio/pages/Calendar";
import { Analytics } from "./studio/pages/Analytics";
import { NotWorking, Working } from "./studio/pages/Working";
import { Trends } from "./studio/pages/Trends";
import { Ideas } from "./studio/pages/Ideas";
import { Experiments } from "./studio/pages/Experiments";
import { Reports } from "./studio/pages/Reports";
import { Import } from "./studio/pages/Import";
import { Settings } from "./studio/pages/Settings";

const TABLE: Record<string, () => ReactNode> = {
  "/studio": () => <Overview />,
  "/studio/brands": () => <BrandsList />,
  "/studio/calendar": () => <Calendar />,
  "/studio/analytics": () => <Analytics />,
  "/studio/working": () => <Working />,
  "/studio/not-working": () => <NotWorking />,
  "/studio/trends": () => <Trends />,
  "/studio/ideas": () => <Ideas />,
  "/studio/experiments": () => <Experiments />,
  "/studio/reports": () => <Reports />,
  "/studio/import": () => <Import />,
  "/studio/settings": () => <Settings />,
};

registerRoutes((path) => {
  if (path.startsWith("/studio/brands/")) {
    const id = path.slice("/studio/brands/".length);
    return <BrandDetail key={id} brandId={id} />;
  }
  return (TABLE[path] ?? TABLE["/studio"]!)();
});
