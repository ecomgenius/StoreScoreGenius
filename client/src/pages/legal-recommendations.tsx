import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { ArrowLeft, Shield, Eye, Zap, FileText, Scale, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LegalSuggestion {
  id: string;
  type: 'privacy' | 'terms' | 'returns' | 'shipping' | 'cookies' | 'gdpr';
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

interface LegalRecommendations {
  legalScore: number;
  suggestions: LegalSuggestion[];
}

export default function LegalRecommendationsPage() {
  const params = useParams();
  const storeId = params.storeId;
  const { user } = useAuth();
  const { toast } = useToast();
  const [previewingSuggestion, setPreviewingSuggestion] = useState<LegalSuggestion | null>(null);

  const { data: recommendations, isLoading } = useQuery<LegalRecommendations>({
    queryKey: [`/api/legal-recommendations/${storeId}`],
    enabled: !!storeId
  });

  const { data: userCredits } = useQuery<{ credits: number }>({
    queryKey: ['/api/credits'],
    enabled: !!user
  });

  const applyMutation = useMutation({
    mutationFn: async (data: { suggestionId: string; changes: any }) => {
      console.log('Applying legal recommendation:', data);
      return apiRequest('POST', `/api/apply-legal-recommendation`, {
        storeId: parseInt(storeId!),
        suggestionId: data.suggestionId,
        changes: data.changes
      });
    },
    onSuccess: (data) => {
      console.log('Legal recommendation applied successfully:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      queryClient.invalidateQueries({ queryKey: [`/api/legal-recommendations/${storeId}`] });
      toast({
        title: "Success!",
        description: "Legal page optimization has been applied successfully.",
      });
    },
    onError: (error: any) => {
      console.error('Legal recommendation application error:', error);
      const errorMessage = error?.message || error?.error || 'Failed to apply legal recommendation';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
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
      case 'privacy': return <Shield className="h-4 w-4" />;
      case 'terms': return <FileText className="h-4 w-4" />;
      case 'returns': return <Scale className="h-4 w-4" />;
      case 'shipping': return <ArrowLeft className="h-4 w-4" />;
      case 'cookies': return <Lock className="h-4 w-4" />;
      case 'gdpr': return <Shield className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading legal recommendations...</p>
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
            <h1 className="text-2xl font-bold tracking-tight">Legal Pages</h1>
            <p className="text-muted-foreground">
              Ensure legal compliance and protect your business
            </p>
          </div>
        </div>

        {/* Legal Score */}
        {recommendations && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Legal Compliance Score</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <div className="text-3xl font-bold text-blue-600">
                  {recommendations.legalScore}/15
                </div>
                <div className="flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${(recommendations.legalScore / 15) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Current legal compliance level
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
                <p className="text-sm text-blue-600">Each legal page optimization costs 1 credit</p>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {userCredits?.credits || 0}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legal Recommendations */}
        {recommendations?.suggestions && recommendations.suggestions.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Legal Compliance Recommendations</h2>
            
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
                            {suggestion.type.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-800 mb-1">Legal Protection:</p>
                    <p className="text-sm text-amber-700">{suggestion.impact}</p>
                  </div>

                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">
                        Preview legal document before applying
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
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No legal recommendations available</h3>
                <p className="text-muted-foreground">
                  Run a store analysis first to get legal compliance suggestions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview Modal */}
        <Dialog open={!!previewingSuggestion} onOpenChange={() => setPreviewingSuggestion(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Legal Document Preview</DialogTitle>
              <DialogDescription>
                Preview the legal document or policy that will be created.
              </DialogDescription>
            </DialogHeader>
            {previewingSuggestion && (
              <div className="space-y-6">
                {/* Legal Info */}
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="p-2 rounded-lg bg-blue-100">
                    {getTypeIcon(previewingSuggestion.type)}
                  </div>
                  <div>
                    <h4 className="font-medium">{previewingSuggestion.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {previewingSuggestion.type.toUpperCase()} compliance
                    </p>
                  </div>
                </div>

                {/* Before/After Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-sm text-muted-foreground mb-3">CURRENT STATUS</h5>
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg min-h-[200px]">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Current State:</div>
                        <p className="text-sm text-gray-700">
                          {previewingSuggestion.suggestions.current}
                        </p>
                        
                        {/* Visual representation based on type */}
                        {previewingSuggestion.type === 'privacy' && (
                          <div className="mt-3">
                            <div className="text-xs text-gray-500 mb-2">Missing legal protection:</div>
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                                <span className="text-xs">No privacy policy</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                                <span className="text-xs">GDPR non-compliant</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {previewingSuggestion.type === 'terms' && (
                          <div className="mt-3">
                            <div className="text-xs text-gray-500 mb-2">Missing legal terms:</div>
                            <div className="p-2 bg-white border rounded text-xs text-red-600">
                              ⚠️ No terms of service found
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-sm text-green-600 mb-3">COMPLIANT SOLUTION</h5>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg min-h-[200px]">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-green-800">Recommended:</div>
                        <p className="text-sm text-green-700 font-medium">
                          {previewingSuggestion.suggestions.recommended}
                        </p>
                        
                        {/* Visual representation based on type */}
                        {previewingSuggestion.type === 'privacy' && (
                          <div className="mt-3">
                            <div className="text-xs text-green-600 mb-2">Legal compliance achieved:</div>
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span className="text-xs">GDPR compliant</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span className="text-xs">CCPA compliant</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span className="text-xs">User rights protected</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {previewingSuggestion.type === 'terms' && (
                          <div className="mt-3">
                            <div className="text-xs text-green-600 mb-2">Legal document sample:</div>
                            <div className="p-2 bg-white border rounded text-xs">
                              <div className="font-medium mb-1">Terms of Service</div>
                              <div className="text-gray-600">1. Acceptance of Terms...</div>
                              <div className="text-gray-600">2. Use License...</div>
                              <div className="text-gray-600">3. Disclaimer...</div>
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

                {/* Legal Protection */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h5 className="font-medium text-sm text-blue-800 mb-1">Legal Protection:</h5>
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