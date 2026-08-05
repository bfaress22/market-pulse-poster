import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { BarChart3, Settings, Sparkles, ImageIcon, LogOut, Wand2, CalendarClock, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/composer", label: "Composer", icon: Wand2 },
  { to: "/queue", label: "Sujets en attente", icon: ListChecks },
  { to: "/schedules", label: "Schedules", icon: CalendarClock },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/image-studio", label: "Image Studio", icon: ImageIcon },
  { to: "/settings", label: "Settings", icon: Settings },
];

const Layout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 flex flex-col border-r border-sidebar-border bg-sidebar-background/80 backdrop-blur-xl">
        <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-primary to-accent blur-md opacity-70" />
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-tight text-sidebar-foreground">AutoPost AI</h1>
            <p className="text-[11px] text-sidebar-foreground/50 uppercase tracking-wider">Workspace</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-gradient-to-r from-primary/15 to-accent/10 text-sidebar-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r bg-gradient-to-b from-primary to-accent" />
                  )}
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          {user && (
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent/40">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-xs font-semibold text-white">
                {user.email?.[0].toUpperCase()}
              </div>
              <p className="text-xs text-sidebar-foreground/80 truncate flex-1">{user.email}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto relative">
        <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
