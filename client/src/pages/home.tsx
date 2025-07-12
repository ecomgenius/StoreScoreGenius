import { useState } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import LoadingSection from "@/components/LoadingSection";
import NewResultsSection from "@/components/NewResultsSection";
// import CTASection from "@/components/CTASection"; // CTA is now built into NewResultsSection
import Footer from "@/components/Footer";

export default function Home() {
  const [currentView, setCurrentView] = useState<'hero' | 'loading' | 'results'>('hero');
  const [analysisResult, setAnalysisResult] = useState(null);

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
