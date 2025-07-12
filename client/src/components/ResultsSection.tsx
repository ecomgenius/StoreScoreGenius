import { useEffect, useState } from "react";
import { Palette, Package, Shield, Gauge, Lightbulb, ArrowUp, Smartphone, Star, Tag } from "lucide-react";

interface ResultsSectionProps {
  analysisResult: {
    overallScore: number;
    designScore: number;
    catalogScore: number;
    trustScore: number;
    performanceScore: number;
    suggestions: Array<{
      title: string;
      description: string;
      impact: string;
      category: 'design' | 'catalog' | 'trust' | 'performance';
    }>;
    summary: string;
  };
}

export default function ResultsSection({ analysisResult }: ResultsSectionProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    // Animate the score circle
    const timer = setTimeout(() => {
      setAnimatedScore(analysisResult.overallScore);
    }, 500);

    return () => clearTimeout(timer);
  }, [analysisResult.overallScore]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'design': return <Palette className="text-white text-sm" />;
      case 'catalog': return <Package className="text-white text-sm" />;
      case 'trust': return <Shield className="text-white text-sm" />;
      case 'performance': return <Gauge className="text-white text-sm" />;
      default: return <ArrowUp className="text-white text-sm" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'design': return 'bg-secondary';
      case 'catalog': return 'bg-primary';
      case 'trust': return 'bg-accent';
      case 'performance': return 'bg-secondary';
      default: return 'bg-secondary';
    }
  };

  // Calculate stroke dash offset for circle animation
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Overall Score */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">Your Store Analysis Results</h2>
          <div className="flex justify-center mb-8">
            <div className="relative w-48 h-48">
              <svg className="transform -rotate-90 w-full h-full" viewBox="0 0 100 100">
                <circle 
                  cx="50" 
                  cy="50" 
                  r="40" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  fill="transparent" 
                  className="text-gray-200"
                />
                <circle 
                  cx="50" 
                  cy="50" 
                  r="40" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="text-secondary transition-all duration-2000"
                  style={{ 
                    strokeDashoffset: dashOffset,
                    transition: 'stroke-dashoffset 2s ease-in-out'
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl font-bold text-gray-900">{animatedScore}</div>
                  <div className="text-sm text-gray-500">Overall Score</div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {analysisResult.summary}
          </p>
        </div>

        {/* Detailed Scores */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <div className="bg-gray-50 rounded-xl p-6 text-center">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Palette className="text-white text-xl" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Store Design</h3>
            <div className="text-3xl font-bold text-secondary mb-2">{analysisResult.designScore}</div>
            <p className="text-sm text-gray-600">Visual appeal & layout</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-6 text-center">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="text-white text-xl" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Product Catalog</h3>
            <div className="text-3xl font-bold text-primary mb-2">{analysisResult.catalogScore}</div>
            <p className="text-sm text-gray-600">Product variety & quality</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-6 text-center">
            <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="text-white text-xl" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Trust Signals</h3>
            <div className="text-3xl font-bold text-accent mb-2">{analysisResult.trustScore}</div>
            <p className="text-sm text-gray-600">Reviews & credibility</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-6 text-center">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Gauge className="text-white text-xl" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Performance</h3>
            <div className="text-3xl font-bold text-secondary mb-2">{analysisResult.performanceScore}</div>
            <p className="text-sm text-gray-600">Speed & mobile-ready</p>
          </div>
        </div>

        {/* AI Suggestions */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 mb-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Lightbulb className="text-accent mr-3" />
            AI-Powered Improvement Suggestions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {analysisResult.suggestions.map((suggestion, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-start">
                  <div className={`w-8 h-8 ${getCategoryColor(suggestion.category)} rounded-full flex items-center justify-center mr-4 mt-1`}>
                    {getCategoryIcon(suggestion.category)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">{suggestion.title}</h4>
                    <p className="text-gray-600 text-sm mb-3">{suggestion.description}</p>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(suggestion.category)} text-white`}>
                      {suggestion.impact}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
