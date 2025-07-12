import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, User, Settings, LogOut, CreditCard, Store } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Header() {
  const { user, isAuthenticated, isLoading } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/">
                <div className="flex items-center space-x-2 cursor-pointer">
                  <TrendingUp className="h-8 w-8 text-blue-600" />
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    StoreScore
                  </h1>
                </div>
              </Link>
            </div>
          </div>
          <nav className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
              <a href="#features" className="text-gray-900 hover:text-primary px-3 py-2 text-sm font-medium">Features</a>
              <a href="#pricing" className="text-gray-500 hover:text-primary px-3 py-2 text-sm font-medium">Pricing</a>
              <a href="#about" className="text-gray-500 hover:text-primary px-3 py-2 text-sm font-medium">About</a>
            </div>
          </nav>
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                {/* Credits Badge */}
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <CreditCard className="h-3 w-3" />
                  <span>{user?.credits || 0} credits</span>
                </Badge>

                {/* Dashboard Link */}
                <Link href="/dashboard">
                  <Button variant="outline" size="sm">
                    Dashboard
                  </Button>
                </Link>

                {/* User Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="flex items-center space-x-2">
                      <User className="h-4 w-4" />
                      <span className="hidden sm:inline">{user?.email?.split('@')[0]}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5 text-sm font-medium">
                      {user?.firstName} {user?.lastName}
                    </div>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {user?.email}
                    </div>
                    <DropdownMenuSeparator />
                    <Link href="/dashboard/stores">
                      <DropdownMenuItem>
                        <Store className="mr-2 h-4 w-4" />
                        My Stores
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/dashboard/analysis">
                      <DropdownMenuItem>
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Analysis History
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Buy Credits
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <Link href="/dashboard/settings">
                      <DropdownMenuItem>
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem onClick={() => window.location.href = '/api/logout'}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <>
                <Button 
                  size="sm"
                  onClick={() => window.location.href = '/api/login'}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Login with Replit
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Replit Auth handles authentication flow */}
    </header>
  );
}
