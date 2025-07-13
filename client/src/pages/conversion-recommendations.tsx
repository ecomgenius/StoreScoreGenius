import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { ArrowLeft, TrendingUp, Eye, Zap, ShoppingCart, Target, MousePointer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ConversionSuggestion {
  id: string;
  type: 'checkout' | 'cta' | 'urgency' | 'social-proof' | 'forms' | 'cart';
  title: string;
  description: string;
  impact: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  suggestions: {
    current: string;
    recommended: string;
    implementation: string;
  };
}

interface ConversionRecommendations {
  conversionScore: number;
  suggestions: ConversionSuggestion[];
}

export default function ConversionRecommendationsPage() {
  const params = useParams();
  const storeId = params.storeId;
  const { user } = useAuth();
  const [previewingSuggestion, setPreviewingSuggestion] = useState<ConversionSuggestion | null>(null);

  const { data: recommendations, isLoading } = useQuery<ConversionRecommendations>({
    queryKey: [`/api/conversion-recommendations/${storeId}`],
    enabled: !!storeId
  });

  const { data: userCredits } = useQuery<{ credits: number }>({
    queryKey: ['/api/credits'],
    enabled: !!user
  });

  const applyMutation = useMutation({
    mutationFn: async (data: { suggestionId: string; changes: any }) => {
      return apiRequest('POST', `/api/apply-conversion-recommendation`, {
        storeId: parseInt(storeId!),
        suggestionId: data.suggestionId,
        changes: data.changes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversion-recommendations/${storeId}`] });
    }
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'checkout': return <ShoppingCart className="h-4 w-4" />;
      case 'cta': return <MousePointer className="h-4 w-4" />;
      case 'urgency': return <Target className="h-4 w-4" />;
      case 'social-proof': return <TrendingUp className="h-4 w-4" />;
      case 'forms': return <Target className="h-4 w-4" />;
      case 'cart': return <ShoppingCart className="h-4 w-4" />;
      default: return <TrendingUp className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading conversion recommendations...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Link href={`/dashboard/stores/${storeId}/recommendations`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Recommendations
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Conversion Optimization</h1>
            <p className="text-muted-foreground">
              Improve your store's conversion rate and increase sales
            </p>
          </div>
        </div>

        {/* Conversion Score */}
        {recommendations && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <span>Conversion Score</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <div className="text-3xl font-bold text-blue-600">
                  {recommendations.conversionScore}/10
                </div>
                <div className="flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${(recommendations.conversionScore / 10) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Current conversion optimization level
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Credits Info */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-blue-800">Available Credits</p>
                <p className="text-sm text-blue-600">Each conversion optimization costs 1 credit</p>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {userCredits?.credits || 0}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversion Recommendations */}
        {recommendations?.suggestions && recommendations.suggestions.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Conversion Rate Optimization</h2>
            
            {recommendations.suggestions.map((suggestion) => (
              <Card key={suggestion.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-lg bg-blue-100">
                        {getTypeIcon(suggestion.type)}
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-lg">{suggestion.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {suggestion.description}
                        </CardDescription>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge className={getPriorityColor(suggestion.priority)}>
                            {suggestion.priority.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">
                            {suggestion.type.replace('-', ' ').toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-800 mb-1">Expected Impact:</p>
                    <p className="text-sm text-amber-700">{suggestion.impact}</p>
                  </div>

                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">
                        Preview conversion improvements before applying
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setPreviewingSuggestion(suggestion)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => applyMutation.mutate({
                          suggestionId: suggestion.id,
                          changes: suggestion.suggestions
                        })}
                        disabled={applyMutation.isPending || (userCredits?.credits || 0) < 1}
                      >
                        {applyMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                            Applying...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4 mr-2" />
                            Apply (1 credit)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No conversion recommendations available</h3>
                <p className="text-muted-foreground">
                  Run a store analysis first to get conversion optimization suggestions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview Modal */}
        <Dialog open={!!previewingSuggestion} onOpenChange={() => setPreviewingSuggestion(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Conversion Preview</DialogTitle>
              <DialogDescription>
                Preview how this optimization will improve your conversion rate.
              </DialogDescription>
            </DialogHeader>
            {previewingSuggestion && (
              <div className="space-y-6">
                {/* Conversion Info */}
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="p-2 rounded-lg bg-blue-100">
                    {getTypeIcon(previewingSuggestion.type)}
                  </div>
                  <div>
                    <h4 className="font-medium">{previewingSuggestion.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {previewingSuggestion.type.replace('-', ' ').toUpperCase()} optimization
                    </p>
                  </div>
                </div>

                {/* Before/After Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-sm text-muted-foreground mb-3">CURRENT</h5>
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg min-h-[200px]">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Current State:</div>
                        <p className="text-sm text-gray-700">
                          {previewingSuggestion.suggestions.current}
                        </p>
                        
                        {/* Visual representation based on type */}
                        {previewingSuggestion.type === 'cta' && (
                          <div className="mt-3">
                            <div className="text-xs text-gray-500 mb-2">Current button:</div>
                            <button className="px-4 py-2 bg-gray-400 text-white rounded text-sm">
                              Add to Cart
                            </button>
                          </div>
                        )}
                        
                        {previewingSuggestion.type === 'urgency' && (
                          <div className="mt-3">
                            <div className="text-xs text-gray-500 mb-2">Current messaging:</div>
                            <div className="p-2 bg-white border rounded text-sm">
                              Regular product listing
                            </div>
                          </div>
                        )}

                        {previewingSuggestion.type === 'checkout' && (
                          <div className="mt-3">
                            <div className="text-xs text-gray-500 mb-2">Current checkout:</div>
                            <div className="space-y-2">
                              <input className="w-full p-2 border rounded text-xs" placeholder="Name" disabled />
                              <input className="w-full p-2 border rounded text-xs" placeholder="Email" disabled />
                              <input className="w-full p-2 border rounded text-xs" placeholder="Address" disabled />
                              <input className="w-full p-2 border rounded text-xs" placeholder="City" disabled />
                              <button className="w-full p-2 bg-gray-400 text-white rounded text-xs">Complete Order</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-sm text-green-600 mb-3">OPTIMIZED</h5>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg min-h-[200px]">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-green-800">Recommended:</div>
                        <p className="text-sm text-green-700 font-medium">
                          {previewingSuggestion.suggestions.recommended}
                        </p>
                        
                        {/* Visual representation based on type */}
                        {previewingSuggestion.type === 'cta' && (
                          <div className="mt-3">
                            <div className="text-xs text-green-600 mb-2">Optimized button:</div>
                            <button className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold shadow-lg">
                              🔥 Buy Now - Save 25%!
                            </button>
                          </div>
                        )}
                        
                        {previewingSuggestion.type === 'urgency' && (
                          <div className="mt-3">
                            <div className="text-xs text-green-600 mb-2">Urgency messaging:</div>
                            <div className="p-2 bg-white border border-orange-300 rounded text-sm">
                              <div className="text-red-600 font-medium">⏰ Only 3 left in stock!</div>
                              <div className="text-orange-600 text-xs">8 people viewing this right now</div>
                            </div>
                          </div>
                        )}

                        {previewingSuggestion.type === 'checkout' && (
                          <div className="mt-3">
                            <div className="text-xs text-green-600 mb-2">Streamlined checkout:</div>
                            <div className="space-y-2">
                              <input className="w-full p-2 border-2 border-blue-300 rounded text-xs" placeholder="Email (Auto-fill available)" disabled />
                              <button className="w-full p-1 bg-blue-100 text-blue-800 rounded text-xs">🔒 Express Checkout with PayPal</button>
                              <div className="text-center text-xs text-gray-500">or</div>
                              <button className="w-full p-3 bg-green-500 text-white rounded-lg text-sm font-semibold">Complete Order - 30 Day Guarantee</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Implementation Details */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h5 className="font-medium text-sm mb-2">Implementation Guide:</h5>
                  <p className="text-sm text-gray-700">
                    {previewingSuggestion.suggestions.implementation}
                  </p>
                </div>

                {/* Impact & Benefits */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h5 className="font-medium text-sm text-blue-800 mb-1">Expected Impact:</h5>
                  <p className="text-sm text-blue-700">{previewingSuggestion.impact}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setPreviewingSuggestion(null)}
                  >
                    Close Preview
                  </Button>
                  <Button 
                    onClick={() => {
                      applyMutation.mutate({
                        suggestionId: previewingSuggestion.id,
                        changes: previewingSuggestion.suggestions
                      });
                      setPreviewingSuggestion(null);
                    }}
                    disabled={applyMutation.isPending || (userCredits?.credits || 0) < 1}
                  >
                    {applyMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                        Applying...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Apply Changes (1 credit)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}