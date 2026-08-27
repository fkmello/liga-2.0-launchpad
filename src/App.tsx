import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLeagueProvider } from "@/contexts/AppLeagueContext";
import { lazy, Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import RequireLeague from "@/components/RequireLeague";
import Login from "./pages/Login";
import Install from "./pages/Install";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Tournaments from "./pages/Tournaments";
import TournamentDetail from "./pages/TournamentDetail";
import ClassicLeague from "./pages/ClassicLeague";
import Admin from "./pages/Admin";
import AdminInviteCodes from "./pages/AdminInviteCodes";
import AdminUsers from "./pages/AdminUsers";
import AdminTournaments from "./pages/AdminTournaments";
import AdminLeague from "./pages/AdminLeague";
import Profile from "./pages/Profile";
import LeagueSelect from "./pages/LeagueSelect";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
// PWAUpdatePrompt desativado temporariamente — kill-switch SW está em uso
// import PWAUpdatePrompt from "./components/PWAUpdatePrompt";

const MatchComparison = lazy(() => import("./pages/MatchComparison"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* <PWAUpdatePrompt /> */}
      <BrowserRouter>
        <AuthProvider>
          <AppLeagueProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/install" element={<Install />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/league-select"
                element={
                  <ProtectedRoute>
                    <LeagueSelect />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <RequireLeague>
                      <Dashboard />
                    </RequireLeague>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tournaments"
                element={
                  <ProtectedRoute>
                    <RequireLeague>
                      <Tournaments />
                    </RequireLeague>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tournaments/:slug"
                element={
                  <ProtectedRoute>
                    <RequireLeague>
                      <TournamentDetail />
                    </RequireLeague>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/match-comparison"
                element={
                  <ProtectedRoute>
                    <RequireLeague>
                      <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
                        <MatchComparison />
                      </Suspense>
                    </RequireLeague>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/league"
                element={
                  <ProtectedRoute>
                    <RequireLeague>
                      <ClassicLeague />
                    </RequireLeague>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminRoute>
                      <Admin />
                    </AdminRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/invite-codes"
                element={
                  <ProtectedRoute>
                    <AdminRoute>
                      <AdminInviteCodes />
                    </AdminRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute>
                    <AdminRoute>
                      <AdminUsers />
                    </AdminRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/tournaments"
                element={
                  <ProtectedRoute>
                    <AdminRoute>
                      <AdminTournaments />
                    </AdminRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/league"
                element={
                  <ProtectedRoute>
                    <AdminRoute>
                      <AdminLeague />
                    </AdminRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <RequireLeague>
                      <Profile />
                    </RequireLeague>
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLeagueProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
