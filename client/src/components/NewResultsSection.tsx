import { useEffect, useState } from "react";
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Palette, 
  Package, 
  Search, 
  Shield, 
  DollarSign, 
  Target,
  Star,
  TrendingUp,
  Users,
  Award
} from "lucide-react";

interface NewResultsSectionProps {
  analysisResult: {
    overallScore: number;
    strengths: string[];
    warnings: string[];
    critical: string[];
    
    designScore: number;
    productScore: number;
    seoScore: number;
    trustScore: number;
    pricingScore: number;
    conversionScore: number;
    
    designAnalysis: {
      mobileResponsive: boolean;
      pageSpeed: number;
      navigationClarity: boolean;
      brandingConsistency: boolean;
      score: number;
    };
    
    productAnalysis: {
      productCount: number;
      highQualityImages: boolean;
      detailedDescriptions: number;
      structuredTitles: boolean;
      trendingProducts: boolean;
      score: number;
    };
    
    seoAnalysis: {
      metaTitlesPresent: boolean;
      keywordOptimization: boolean;
      categoriesUsed: boolean;
      cleanUrls: boolean;
      score: number;
    };
    
    trustAnalysis: {
      returnPolicy: boolean;
      aboutPage: boolean;
      contactInfo: boolean;
      sslSecurity: boolean;
      socialProof: number;
      score: number;
    };
    
    pricingAnalysis: {
      competitive: boolean;
      priceRange: 'low' | 'medium' | 'high';
      valuePerception: 'underpriced' | 'fair' | 'overpriced';
      score: number;
    };
    
    conversionAnalysis: {
      clearCtas: boolean;
      reviewsDisplayed: boolean;
      promotions: boolean;
      supportOptions: boolean;
      score: number;
    };
    
    suggestions: Array<{
      title: string;
      description: string;
      impact: string;
      category: 'design' | 'product' | 'seo' | 'trust' | 'pricing' | 'conversion';
      priority: 'low' | 'medium' | 'high' | 'critical';
    }>;
    
    summary: string;
    storeRecap: {
      mainCategories: Array<{
        name: string;
        viralScore: number;
        demandScore: number;
        description: string;
      }>;
      storeSize: 'small' | 'medium' | 'large' | 'enterprise';
      estimatedProducts: string;
      targetAudience: string;
      businessModel: string;
      competitiveAdvantage: string;
    };
  };
}

export default function NewResultsSection({ analysisResult }: NewResultsSectionProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(analysisResult.overallScore);
    }, 500);
    return () => clearTimeout(timer);
  }, [analysisResult.overallScore]);

  // Helper functions
  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'design': return <Palette className="w-4 h-4" />;
      case 'product': return <Package className="w-4 h-4" />;
      case 'seo': return <Search className="w-4 h-4" />;
      case 'trust': return <Shield className="w-4 h-4" />;
      case 'pricing': return <DollarSign className="w-4 h-4" />;
      case 'conversion': return <Target className="w-4 h-4" />;
      default: return <Star className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Overall Score Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-100 rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="relative w-32 h-32 mx-auto mb-6">
            <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
              <path
                d="m18,2.0845 a 15.9155,15.9155 0 0,1 0,31.831 a 15.9155,15.9155 0 0,1 0,-31.831"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="2"
              />
              <path
                d="m18,2.0845 a 15.9155,15.9155 0 0,1 0,31.831 a 15.9155,15.9155 0 0,1 0,-31.831"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray={`${animatedScore}, 100`}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold text-gray-900">{animatedScore}</span>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Overall Store Score</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Strengths */}
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center mb-4">
              <CheckCircle className="w-6 h-6 text-green-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">What's Working Well</h3>
            </div>
            <ul className="space-y-2">
              {analysisResult.strengths.map((strength, index) => (
                <li key={index} className="text-sm text-gray-600 flex items-start">
                  <span className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  {strength}
                </li>
              ))}
            </ul>
          </div>

          {/* Warnings */}
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">Needs Improvement</h3>
            </div>
            <ul className="space-y-2">
              {analysisResult.warnings.map((warning, index) => (
                <li key={index} className="text-sm text-gray-600 flex items-start">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  {warning}
                </li>
              ))}
            </ul>
          </div>

          {/* Critical */}
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center mb-4">
              <XCircle className="w-6 h-6 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">Critical Issues</h3>
            </div>
            <ul className="space-y-2">
              {analysisResult.critical.map((critical, index) => (
                <li key={index} className="text-sm text-gray-600 flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  {critical}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Detailed Category Scores */}
      <div className="bg-white rounded-2xl p-8 shadow-lg">
        <h3 className="text-2xl font-bold text-gray-900 mb-8">Detailed Analysis</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Design & UX */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Palette className="w-6 h-6 text-purple-500 mr-3" />
                <h4 className="font-semibold text-gray-900">Design & UX</h4>
              </div>
              <span className={`text-2xl font-bold ${getScoreColor(analysisResult.designScore, 20)}`}>
                {analysisResult.designScore}/20
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Mobile Responsive:</span>
                <span className={analysisResult.analysisData?.designAnalysis?.mobileResponsive ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.designAnalysis?.mobileResponsive ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Page Speed:</span>
                <span className={(analysisResult.analysisData?.designAnalysis?.pageSpeed || 0) < 3 ? 'text-green-600' : 'text-yellow-600'}>
                  {analysisResult.analysisData?.designAnalysis?.pageSpeed || 'N/A'}s
                </span>
              </div>
              <div className="flex justify-between">
                <span>Navigation:</span>
                <span className={analysisResult.analysisData?.designAnalysis?.navigationClarity ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.designAnalysis?.navigationClarity ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Branding:</span>
                <span className={analysisResult.analysisData?.designAnalysis?.brandingConsistency ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.designAnalysis?.brandingConsistency ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>

          {/* Product Analysis */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Package className="w-6 h-6 text-blue-500 mr-3" />
                <h4 className="font-semibold text-gray-900">Product Analysis</h4>
              </div>
              <span className={`text-2xl font-bold ${getScoreColor(analysisResult.productScore, 25)}`}>
                {analysisResult.productScore}/25
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Product Count:</span>
                <span className="text-gray-600">{analysisResult.analysisData?.productAnalysis?.productCount || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>High Quality Images:</span>
                <span className={analysisResult.analysisData?.productAnalysis?.highQualityImages ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.productAnalysis?.highQualityImages ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Detailed Descriptions:</span>
                <span className="text-gray-600">{analysisResult.analysisData?.productAnalysis?.detailedDescriptions || 0}%</span>
              </div>
              <div className="flex justify-between">
                <span>Structured Titles:</span>
                <span className={analysisResult.analysisData?.productAnalysis?.structuredTitles ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.productAnalysis?.structuredTitles ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>

          {/* SEO & Listings */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Search className="w-6 h-6 text-green-500 mr-3" />
                <h4 className="font-semibold text-gray-900">SEO & Listings</h4>
              </div>
              <span className={`text-2xl font-bold ${getScoreColor(analysisResult.seoScore, 20)}`}>
                {analysisResult.seoScore}/20
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Meta Titles:</span>
                <span className={analysisResult.analysisData?.seoAnalysis?.metaTitlesPresent ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.seoAnalysis?.metaTitlesPresent ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Keywords:</span>
                <span className={analysisResult.analysisData?.seoAnalysis?.keywordOptimization ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.seoAnalysis?.keywordOptimization ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Categories:</span>
                <span className={analysisResult.analysisData?.seoAnalysis?.categoriesUsed ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.seoAnalysis?.categoriesUsed ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Clean URLs:</span>
                <span className={analysisResult.analysisData?.seoAnalysis?.cleanUrls ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.seoAnalysis?.cleanUrls ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>

          {/* Trust Signals */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Shield className="w-6 h-6 text-indigo-500 mr-3" />
                <h4 className="font-semibold text-gray-900">Trust Signals</h4>
              </div>
              <span className={`text-2xl font-bold ${getScoreColor(analysisResult.trustScore, 15)}`}>
                {analysisResult.trustScore}/15
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Return Policy:</span>
                <span className={analysisResult.analysisData?.trustAnalysis?.returnPolicy ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.trustAnalysis?.returnPolicy ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>About Page:</span>
                <span className={analysisResult.analysisData?.trustAnalysis?.aboutPage ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.trustAnalysis?.aboutPage ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Contact Info:</span>
                <span className={analysisResult.analysisData?.trustAnalysis?.contactInfo ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.trustAnalysis?.contactInfo ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Social Proof:</span>
                <span className="text-gray-600">{analysisResult.analysisData?.trustAnalysis?.socialProof || 0}★</span>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <DollarSign className="w-6 h-6 text-yellow-500 mr-3" />
                <h4 className="font-semibold text-gray-900">Pricing</h4>
              </div>
              <span className={`text-2xl font-bold ${getScoreColor(analysisResult.pricingScore, 10)}`}>
                {analysisResult.pricingScore}/10
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Competitive:</span>
                <span className={analysisResult.analysisData?.pricingAnalysis?.competitive ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.pricingAnalysis?.competitive ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Price Range:</span>
                <span className="text-gray-600 capitalize">{analysisResult.analysisData?.pricingAnalysis?.priceRange || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Value Perception:</span>
                <span className="text-gray-600 capitalize">{analysisResult.analysisData?.pricingAnalysis?.valuePerception || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Conversion */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Target className="w-6 h-6 text-red-500 mr-3" />
                <h4 className="font-semibold text-gray-900">Conversion</h4>
              </div>
              <span className={`text-2xl font-bold ${getScoreColor(analysisResult.conversionScore, 10)}`}>
                {analysisResult.conversionScore}/10
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Clear CTAs:</span>
                <span className={analysisResult.analysisData?.conversionAnalysis?.clearCtas ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.conversionAnalysis?.clearCtas ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Reviews Displayed:</span>
                <span className={analysisResult.analysisData?.conversionAnalysis?.reviewsDisplayed ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.conversionAnalysis?.reviewsDisplayed ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Promotions:</span>
                <span className={analysisResult.analysisData?.conversionAnalysis?.promotions ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.conversionAnalysis?.promotions ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Support Options:</span>
                <span className={analysisResult.analysisData?.conversionAnalysis?.supportOptions ? 'text-green-600' : 'text-red-600'}>
                  {analysisResult.analysisData?.conversionAnalysis?.supportOptions ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <TrendingUp className="text-purple-600 mr-3" />
          AI-Powered Recommendations
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {analysisResult.suggestions.map((suggestion, index) => (
            <div key={index} className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <div className={`w-8 h-8 ${getPriorityColor(suggestion.priority)} rounded-full flex items-center justify-center mr-3`}>
                    {getCategoryIcon(suggestion.category)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{suggestion.title}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(suggestion.priority)} text-white`}>
                      {suggestion.priority.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-gray-600 text-sm mb-3">{suggestion.description}</p>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 capitalize">{suggestion.category}</span>
                <span className="text-sm font-medium text-green-600">{suggestion.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Store Recap */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <Award className="text-blue-600 mr-3" />
          Store Intelligence Recap
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Store Overview */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-4">Store Overview</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Store Size:</span>
                  <span className="font-medium capitalize">{analysisResult.analysisData?.storeRecap?.storeSize || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Est. Products:</span>
                  <span className="font-medium">{analysisResult.analysisData?.storeRecap?.estimatedProducts || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Business Model:</span>
                  <span className="font-medium">{analysisResult.analysisData?.storeRecap?.businessModel || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-4">Target Audience</h4>
              <p className="text-gray-600">{analysisResult.analysisData?.storeRecap?.targetAudience || 'N/A'}</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-4">Competitive Advantage</h4>
              <p className="text-gray-600">{analysisResult.analysisData?.storeRecap?.competitiveAdvantage || 'N/A'}</p>
            </div>
          </div>

          {/* Product Categories */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Star className="w-5 h-5 text-yellow-500 mr-2" />
                Main Product Categories
              </h4>
              <div className="space-y-4">
                {(analysisResult.analysisData?.storeRecap?.mainCategories || []).map((category, index) => (
                  <div key={index} className="border-l-4 border-blue-500 pl-4">
                    <div className="flex justify-between items-start mb-2">
                      <h5 className="font-medium text-gray-900">{category.name}</h5>
                      <div className="flex space-x-3 text-sm">
                        <span className="text-purple-600">
                          Viral: {category.viralScore}/10
                        </span>
                        <span className="text-green-600">
                          Demand: {category.demandScore}/10
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{category.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-center text-white">
        <h3 className="text-2xl font-bold mb-4">Ready to Optimize Your Store?</h3>
        <p className="text-indigo-100 mb-6 max-w-2xl mx-auto">
          Register now to apply AI suggestions automatically by connecting your Shopify or eBay store. 
          Get real-time optimization recommendations and track your improvements.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="bg-white text-indigo-600 px-8 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors">
            Connect Shopify Store
          </button>
          <button className="bg-purple-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-purple-800 transition-colors">
            Connect eBay Store
          </button>
        </div>
        <p className="text-indigo-200 text-sm mt-4">
          Free 7-day trial • No credit card required
        </p>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Analysis Summary</h3>
        <p className="text-gray-600 max-w-3xl mx-auto">{analysisResult.summary}</p>
      </div>
    </div>
  );
}