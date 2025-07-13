import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  ShoppingBag, 
  Palette, 
  Star, 
  MousePointer, 
  FolderTree, 
  FileText,
  ChevronRight,
  Zap,
  TrendingUp,
  Shield,
  Globe
} from "lucide-react";

interface StoreAnalysis {
  id: number;
  overallScore: number;
  designScore: number;
  productScore: number;
  seoScore: number;
  trustScore: number;
  pricingScore: number;
  conversionScore: number;
  suggestions: Array<{
    title: string;
    description: string;
    impact: string;
    category: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export default function GeneralRecommendations() {
  const { storeId } = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Fetch store details
  const { data: stores = [] } = useQuery({
    queryKey: ['/api/stores'],
    enabled: !!user,
  });

  const store = stores.find((s: any) => s.id === parseInt(storeId!));

  // Fetch latest analysis for this store
  const { data: analyses = [] } = useQuery({
    queryKey: ['/api/analyses'],
    enabled: !!user,
  });

  const storeAnalysis = analyses.find((a: StoreAnalysis) => a.userStoreId === parseInt(storeId!)) || analyses[0];

  // Group suggestions by category
  const groupedSuggestions = storeAnalysis?.suggestions?.reduce((acc: any, suggestion: any) => {
    const category = suggestion.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(suggestion);
    return acc;
  }, {}) || {};

  const recommendationCategories = [
    {
      id: 'products',
      title: 'Product Optimization',
      description: 'AI-powered title, description, pricing, and keyword improvements',
      icon: ShoppingBag,
      score: storeAnalysis?.productScore || 0,
      maxScore: 25,
      suggestions: groupedSuggestions.product || [],
      route: `/dashboard/stores/${storeId}/products`,
      actionText: 'Optimize Products',
      color: 'bg-blue-500',
    },
    {
      id: 'design',
      title: 'Design & Branding',
      description: 'Visual improvements, color schemes, and brand consistency',
      icon: Palette,
      score: storeAnalysis?.designScore || 0,
      maxScore: 20,
      suggestions: groupedSuggestions.design || [],
      route: `/dashboard/stores/${storeId}/design`,
      actionText: 'Improve Design',
      color: 'bg-purple-500',
    },
    {
      id: 'trust',
      title: 'Reviews & Trust',
      description: 'Build customer confidence with testimonials and trust signals',
      icon: Star,
      score: storeAnalysis?.trustScore || 0,
      maxScore: 15,
      suggestions: groupedSuggestions.trust || [],
      route: `/dashboard/stores/${storeId}/trust`,
      actionText: 'Build Trust',
      color: 'bg-yellow-500',
    },
    {
      id: 'conversion',
      title: 'Conversion Optimization',
      description: 'Clear CTAs, urgency elements, and conversion improvements',
      icon: MousePointer,
      score: storeAnalysis?.conversionScore || 0,
      maxScore: 10,
      suggestions: groupedSuggestions.conversion || [],
      route: `/dashboard/stores/${storeId}/conversion`,
      actionText: 'Boost Conversions',
      color: 'bg-green-500',
    },
    {
      id: 'seo',
      title: 'Categories & SEO',
      description: 'Product categorization, meta tags, and search optimization',
      icon: FolderTree,
      score: storeAnalysis?.seoScore || 0,
      maxScore: 20,
      suggestions: groupedSuggestions.seo || [],
      route: `/dashboard/stores/${storeId}/seo`,
      actionText: 'Optimize SEO',
      color: 'bg-indigo-500',
    },
    {
      id: 'legal',
      title: 'Legal Pages',
      description: 'Generate return policy, about page, and privacy policy',
      icon: FileText,
      score: 0, // This will be calculated based on existing pages
      maxScore: 10,
      suggestions: [],
      route: `/dashboard/stores/${storeId}/legal`,
      actionText: 'Generate Pages',
      color: 'bg-gray-500',
    },
  ];

  if (!store) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-4">Store not found</h2>
          <Button onClick={() => setLocation('/dashboard/stores')}>
            Back to Stores
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
            <Link href="/dashboard/stores" className="hover:text-primary">Stores</Link>
            <ChevronRight className="h-4 w-4" />
            <span>{store.name}</span>
            <ChevronRight className="h-4 w-4" />
            <span>AI Recommendations</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">AI Recommendations</h1>
          <p className="text-muted-foreground">
            Comprehensive AI-powered optimization suggestions for {store.name}
          </p>
        </div>

        {/* Overall Score Card */}
        {storeAnalysis && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Overall Store Performance</CardTitle>
                  <CardDescription>
                    Your store scores {storeAnalysis.overallScore}/100 with opportunities for improvement
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    {storeAnalysis.overallScore}<span className="text-lg text-muted-foreground">/100</span>
                  </div>
                  <Progress value={storeAnalysis.overallScore} className="w-32 mt-2" />
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Recommendation Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recommendationCategories.map((category) => {
            const scorePercentage = (category.score / category.maxScore) * 100;
            const suggestionsCount = category.suggestions.length;
            
            return (
              <Card key={category.id} className="hover:shadow-lg transition-shadow cursor-pointer group">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-lg ${category.color} bg-opacity-10`}>
                      <category.icon className={`h-6 w-6 text-${category.color.split('-')[1]}-600`} />
                    </div>
                    <Badge variant={scorePercentage < 50 ? 'destructive' : scorePercentage < 80 ? 'secondary' : 'default'}>
                      {category.score}/{category.maxScore}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{category.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {category.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Score Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Score</span>
                      <span className="text-sm text-muted-foreground">{scorePercentage.toFixed(0)}%</span>
                    </div>
                    <Progress value={scorePercentage} className="h-2" />
                  </div>

                  {/* Suggestions Count */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-muted-foreground">
                      {suggestionsCount} {suggestionsCount === 1 ? 'suggestion' : 'suggestions'}
                    </span>
                    {suggestionsCount > 0 && (
                      <div className="flex items-center space-x-1 text-xs">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="text-green-600">Improvement available</span>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <Button 
                    asChild 
                    className="w-full group-hover:bg-primary group-hover:text-primary-foreground"
                    variant={suggestionsCount > 0 ? "default" : "outline"}
                  >
                    <Link href={category.route}>
                      <Zap className="h-4 w-4 mr-2" />
                      {category.actionText}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Wins Section */}
        {storeAnalysis?.suggestions && storeAnalysis.suggestions.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Zap className="h-5 w-5 mr-2 text-yellow-500" />
                Quick Wins
              </CardTitle>
              <CardDescription>
                High-impact recommendations you can implement immediately
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {storeAnalysis.suggestions
                  .filter(s => s.priority === 'critical' || s.priority === 'high')
                  .slice(0, 5)
                  .map((suggestion, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
                      <div className={`p-1 rounded-full ${
                        suggestion.priority === 'critical' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                      }`}>
                        <div className="h-2 w-2 rounded-full bg-current" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{suggestion.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{suggestion.description}</p>
                        <div className="flex items-center justify-between mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {suggestion.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {suggestion.impact}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}