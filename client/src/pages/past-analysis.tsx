import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { History, ExternalLink, TrendingUp, Star, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DashboardLayout from '@/components/DashboardLayout';
import { Link } from 'wouter';

export default function PastAnalysis() {
  const { data: analyses = [], isLoading } = useQuery({
    queryKey: ['/api/analyses'],
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getStoreTypeColor = (type: string) => {
    return type === 'shopify' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
            <History className="mr-3 h-8 w-8" />
            Past Analysis
          </h1>
          <p className="text-gray-600">
            Review your previous store analyses and track improvements over time.
          </p>
        </div>

        {analyses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No analyses yet</h3>
              <p className="text-gray-600 mb-4">
                Start by analyzing your first store to see insights and recommendations.
              </p>
              <Link href="/dashboard">
                <Button>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Analyze Store
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {analyses.map((analysis: any) => (
              <Card key={analysis.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(analysis.overallScore)}`}>
                        {analysis.overallScore}/100
                      </div>
                      <Badge variant="secondary" className={getStoreTypeColor(analysis.storeType)}>
                        {analysis.storeType.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="mr-1 h-4 w-4" />
                      {format(new Date(analysis.createdAt), 'MMM dd, yyyy')}
                    </div>
                  </div>
                  <CardTitle className="text-xl">
                    {analysis.storeType === 'shopify' ? analysis.storeUrl : `eBay: ${analysis.ebayUsername}`}
                  </CardTitle>
                  <CardDescription>
                    {analysis.summary}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-lg font-semibold text-blue-600">{analysis.designScore}/20</div>
                      <div className="text-xs text-gray-500">Design</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-green-600">{analysis.productScore}/25</div>
                      <div className="text-xs text-gray-500">Product</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-purple-600">{analysis.seoScore}/20</div>
                      <div className="text-xs text-gray-500">SEO</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-orange-600">{analysis.trustScore}/15</div>
                      <div className="text-xs text-gray-500">Trust</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-red-600">{analysis.pricingScore}/10</div>
                      <div className="text-xs text-gray-500">Pricing</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-indigo-600">{analysis.conversionScore}/10</div>
                      <div className="text-xs text-gray-500">Conversion</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-gray-600">
                        {analysis.suggestions?.length || 0} AI recommendations
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      {analysis.storeType === 'shopify' && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={analysis.storeUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Visit Store
                          </a>
                        </Button>
                      )}
                      <Link href={`/dashboard/analysis/${analysis.id}`}>
                        <Button size="sm">
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}