import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Upload from "./pages/Upload";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import UserManagement from "./pages/UserManagement";
import DashboardLayout from "./components/DashboardLayout";
import Export from "./pages/Export";
import AuditLog from "./pages/AuditLog";
import PatientMerge from "./pages/PatientMerge";
import ProcessingHistory from "./pages/ProcessingHistory";
import QuickUpload from "./pages/QuickUpload";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/upload" component={Upload} />
        <Route path="/patients" component={Patients} />
        <Route path="/patients/:id" component={PatientDetail} />
        <Route path="/admin/users" component={UserManagement} />
        <Route path="/admin/export" component={Export} />
        <Route path="/admin/audit-log" component={AuditLog} />
        <Route path="/admin/merge" component={PatientMerge} />
        <Route path="/processing-history" component={ProcessingHistory} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Switch>
            {/* QuickUpload is outside DashboardLayout - works with token auth, no login needed */}
            <Route path="/quick-upload" component={QuickUpload} />
            <Route>
              <Router />
            </Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
