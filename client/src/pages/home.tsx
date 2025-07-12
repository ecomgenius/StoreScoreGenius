import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import LoadingSection from "@/components/LoadingSection";
import NewResultsSection from "@/components/NewResultsSection";
// import CTASection from "@/components/CTASection"; // CTA is now built into NewResultsSection
import Footer from "@/components/Footer";

export default function Home() {
  const [currentView, setCurrentView] = useState<'hero' | 'loading' | 'results'>('hero');
  const [analysisResult, setAnalysisResult] = useState(null);
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation('/dashboard');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const handleAnalysisStart = () => {
    setCurrentView('loading');
  };

  const handleAnalysisComplete = (result: any) => {
    setAnalysisResult(result);
    setCurrentView('results');
    
    // Scroll to results section
    setTimeout(() => {
      window.scrollTo({ 
        top: window.innerHeight, 
        behavior: 'smooth' 
      });
    }, 100);
  };

  const handleAnalysisError = () => {
    setCurrentView('hero');
    setAnalysisResult(null);
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      {currentView === 'hero' && (
        <HeroSection 
          onAnalysisStart={handleAnalysisStart}
          onAnalysisComplete={handleAnalysisComplete}
          onAnalysisError={handleAnalysisError}
        />
      )}
      
      {currentView === 'loading' && <LoadingSection />}
      
      {currentView === 'results' && analysisResult && (
        <NewResultsSection analysisResult={analysisResult} />
      )}
      
      <Footer />
    </div>
  );
}
