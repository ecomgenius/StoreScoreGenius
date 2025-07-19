import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import PastAnalysis from "@/pages/past-analysis";
import AnalysisDetail from "@/pages/analysis-detail";
import UserStores from "@/pages/user-stores";
import Settings from "@/pages/settings";
import AIRecommendations from "@/pages/ai-recommendations";
import GeneralRecommendations from "@/pages/general-recommendations";
import DesignRecommendations from "@/pages/design-recommendations";
import SEORecommendations from "@/pages/seo-recommendations";
import LegalRecommendations from "@/pages/legal-recommendations";
import ConversionRecommendations from "@/pages/conversion-recommendations";
import TrustRecommendations from "@/pages/trust-recommendations";
import BuyCredits from "@/pages/buy-credits";
import SubscriptionOnboarding from "@/pages/subscription-onboarding";
import { AuthProvider } from "@/hooks/useAuth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/analysis" component={PastAnalysis} />
      <Route path="/dashboard/analysis/:id" component={AnalysisDetail} />
      <Route path="/analysis/:id" component={AnalysisDetail} />
      <Route path="/dashboard/stores" component={UserStores} />
      <Route path="/dashboard/stores/:storeId/recommendations" component={GeneralRecommendations} />
      <Route path="/recommendations/:storeId" component={GeneralRecommendations} />
      <Route path="/dashboard/stores/:storeId/products" component={AIRecommendations} />
      <Route path="/dashboard/stores/:storeId/design" component={DesignRecommendations} />
      <Route path="/dashboard/stores/:storeId/seo" component={SEORecommendations} />
      <Route path="/dashboard/stores/:storeId/legal" component={LegalRecommendations} />
      <Route path="/dashboard/stores/:storeId/conversion" component={ConversionRecommendations} />
      <Route path="/dashboard/stores/:storeId/trust" component={TrustRecommendations} />
      <Route path="/dashboard/settings" component={Settings} />
      <Route path="/dashboard/credits" component={BuyCredits} />
      <Route path="/subscription-onboarding" component={SubscriptionOnboarding} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
