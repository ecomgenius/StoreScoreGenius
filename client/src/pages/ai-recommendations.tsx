import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Zap, AlertCircle, CheckCircle, Clock, ShoppingBag, DollarSign, Tag, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import DashboardLayout from '@/components/DashboardLayout';

interface AIRecommendation {
  id: string;
  type: 'title' | 'description' | 'pricing' | 'keywords';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  affectedProducts: Product[];
  suggestion: string;
}

interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  handle: string;
  images: Array<{ src: string }>;
  variants: Array<{ price: string; title: string }>;
}

interface Store {
  id: number;
  name: string;
  storeUrl: string;
  shopifyDomain: string;
  lastAnalysisScore: number;
  aiRecommendationsCount: number;
}

export default function AIRecommendations() {
  const { storeId } = useParams<{ storeId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkType, setBulkType] = useState<string>('');
  const [expandedRecommendation, setExpandedRecommendation] = useState<string | null>(null);

  // Fetch store details
  const { data: store } = useQuery({
    queryKey: ['/api/stores', storeId],
    queryFn: async () => {
      const stores = await apiRequest('GET', '/api/stores');
      return stores.find((s: Store) => s.id === parseInt(storeId!));
    },
    enabled: !!storeId,
  });

  // Fetch store products
  const { data: products = [] } = useQuery({
    queryKey: ['/api/shopify/products', storeId],
    queryFn: async () => {
      return await apiRequest('GET', `/api/shopify/products/${storeId}`);
    },
    enabled: !!storeId,
  });

  // Generate AI recommendations based on products
  const { data: recommendations = [] } = useQuery({
    queryKey: ['/api/ai-recommendations', storeId],
    queryFn: async () => {
      return await apiRequest('GET', `/api/ai-recommendations/${storeId}`);
    },
    enabled: !!storeId && products.length > 0,
  });

  // User credits
  const { data: userCredits } = useQuery({
    queryKey: ['/api/credits'],
    enabled: !!user,
  });

  // Apply single recommendation
  const applyRecommendationMutation = useMutation({
    mutationFn: async ({ productId, recommendationType, suggestion }: { 
      productId: string; 
      recommendationType: string; 
      suggestion: string; 
    }) => {
      return await apiRequest('POST', `/api/shopify/apply-recommendation`, {
        storeId,
        productId,
        recommendationType,
        suggestion,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products', storeId] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-recommendations', storeId] });
      toast({
        title: "Recommendation Applied",
        description: "Product has been updated successfully",
      });
    },
    onError: (error: any) => {
      if (error.message?.includes('Insufficient credits')) {
        toast({
          title: "Insufficient Credits",
          description: "You need more AI credits to apply recommendations",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to Apply",
          description: error.message || "Failed to update product",
          variant: "destructive",
        });
      }
    },
  });

  // Apply bulk recommendations
  const applyBulkMutation = useMutation({
    mutationFn: async ({ recommendationType, productIds }: { 
      recommendationType: string; 
      productIds: string[]; 
    }) => {
      return await apiRequest('POST', `/api/shopify/apply-bulk-recommendations`, {
        storeId,
        recommendationType,
        productIds,
      });
    },
    onSuccess: (data: { appliedCount: number; creditsUsed: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products', storeId] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-recommendations', storeId] });
      setShowBulkModal(false);
      setSelectedProducts([]);
      toast({
        title: "Bulk Update Complete",
        description: `Updated ${data.appliedCount} products using ${data.creditsUsed} credits`,
      });
    },
    onError: (error: any) => {
      setShowBulkModal(false);
      toast({
        title: "Bulk Update Failed",
        description: error.message || "Failed to update products",
        variant: "destructive",
      });
    },
  });

  const handleBulkApply = (type: string) => {
    const relevantProducts = recommendations
      .filter((rec: AIRecommendation) => rec.type === type)
      .flatMap((rec: AIRecommendation) => rec.affectedProducts.map(p => p.id));
    
    if (relevantProducts.length === 0) {
      toast({
        title: "No Products Found",
        description: `No products found for ${type} improvements`,
        variant: "destructive",
      });
      return;
    }

    setBulkType(type);
    setSelectedProducts(relevantProducts);
    setShowBulkModal(true);
  };

  const confirmBulkApply = () => {
    applyBulkMutation.mutate({
      recommendationType: bulkType,
      productIds: selectedProducts,
    });
  };

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'title': return <Tag className="h-4 w-4" />;
      case 'description': return <FileText className="h-4 w-4" />;
      case 'pricing': return <DollarSign className="h-4 w-4" />;
      case 'keywords': return <Tag className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const groupedRecommendations = recommendations.reduce((acc: Record<string, AIRecommendation[]>, rec: AIRecommendation) => {
    if (!acc[rec.type]) acc[rec.type] = [];
    acc[rec.type].push(rec);
    return acc;
  }, {});

  if (!store) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Store Not Found</h3>
            <p className="text-muted-foreground mb-4">The requested store could not be found.</p>
            <Button onClick={() => setLocation('/dashboard/stores')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Stores
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              onClick={() => setLocation('/dashboard/stores')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Stores</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">AI Recommendations</h1>
              <p className="text-muted-foreground">
                {store.name} • Score: {store.lastAnalysisScore}/100
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Available Credits</p>
              <p className="text-2xl font-bold">{userCredits?.credits || 0}</p>
            </div>
            <Zap className="h-6 w-6 text-yellow-500" />
          </div>
        </div>

        {/* Recommendations Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Object.entries(groupedRecommendations).map(([type, recs]) => (
            <Card key={type} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getRecommendationIcon(type)}
                    <CardTitle className="text-sm capitalize">{type} Issues</CardTitle>
                  </div>
                  <Badge variant={getPriorityColor(recs[0]?.priority || 'medium')}>
                    {recs.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {recs.reduce((total, rec) => total + rec.affectedProducts.length, 0)} products affected
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleBulkApply(type)}
                  disabled={applyBulkMutation.isPending}
                >
                  Fix All ({recs.reduce((total, rec) => total + rec.affectedProducts.length, 0)} credits)
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Detailed Recommendations */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">All Recommendations</TabsTrigger>
            <TabsTrigger value="title">Titles</TabsTrigger>
            <TabsTrigger value="description">Descriptions</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="keywords">Keywords</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {recommendations.map((rec: AIRecommendation) => (
              <Card key={rec.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      {getRecommendationIcon(rec.type)}
                      <div>
                        <CardTitle className="text-base">{rec.title}</CardTitle>
                        <CardDescription className="mt-1">{rec.description}</CardDescription>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge variant={getPriorityColor(rec.priority)}>{rec.priority}</Badge>
                          <Badge variant="outline">{rec.impact}</Badge>
                          <Badge variant="secondary">{rec.affectedProducts.length} products</Badge>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => 
                        setExpandedRecommendation(
                          expandedRecommendation === rec.id ? null : rec.id
                        )
                      }
                    >
                      {expandedRecommendation === rec.id ? 'Hide' : 'Show'} Products
                    </Button>
                  </div>
                </CardHeader>
                
                {expandedRecommendation === rec.id && (
                  <CardContent>
                    <div className="space-y-3">
                      {rec.affectedProducts.map((product) => (
                        <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            {product.images?.[0] && (
                              <img
                                src={product.images[0].src}
                                alt={product.title}
                                className="h-12 w-12 object-cover rounded"
                              />
                            )}
                            <div>
                              <p className="font-medium">{product.title}</p>
                              <p className="text-sm text-muted-foreground">
                                ${product.variants?.[0]?.price || product.price}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => 
                              applyRecommendationMutation.mutate({
                                productId: product.id,
                                recommendationType: rec.type,
                                suggestion: rec.suggestion,
                              })
                            }
                            disabled={applyRecommendationMutation.isPending}
                          >
                            Apply (1 credit)
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </TabsContent>

          {(['title', 'description', 'pricing', 'keywords'] as const).map((type) => (
            <TabsContent key={type} value={type} className="space-y-4">
              {groupedRecommendations[type]?.map((rec: AIRecommendation) => (
                <Card key={rec.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{rec.title}</CardTitle>
                        <CardDescription className="mt-1">{rec.description}</CardDescription>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge variant={getPriorityColor(rec.priority)}>{rec.priority}</Badge>
                          <Badge variant="outline">{rec.impact}</Badge>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleBulkApply(type)}
                        disabled={applyBulkMutation.isPending}
                      >
                        Fix All ({rec.affectedProducts.length} credits)
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              )) || (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Issues Found</h3>
                  <p className="text-muted-foreground">
                    All {type} optimizations are up to standard!
                  </p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Bulk Confirmation Modal */}
      <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Update</DialogTitle>
            <DialogDescription>
              This action will update all selected {bulkType} fields. You won't see individual previews.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Products to update:</span>
                <span>{selectedProducts.length}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Credits required:</span>
                <span>{selectedProducts.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Available credits:</span>
                <span>{userCredits?.credits || 0}</span>
              </div>
            </div>
            {(userCredits?.credits || 0) < selectedProducts.length && (
              <div className="flex items-center space-x-2 p-3 bg-destructive/10 rounded-lg">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive">
                  Insufficient credits. You need {selectedProducts.length - (userCredits?.credits || 0)} more credits.
                </span>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowBulkModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={confirmBulkApply}
                disabled={
                  applyBulkMutation.isPending || 
                  (userCredits?.credits || 0) < selectedProducts.length
                }
              >
                {applyBulkMutation.isPending ? 'Applying...' : 'Apply Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}