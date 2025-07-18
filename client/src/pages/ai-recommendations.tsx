import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Zap, AlertCircle, CheckCircle, Clock, ShoppingBag, DollarSign, Tag, FileText, ExternalLink, Link } from 'lucide-react';
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
  const [productFilter, setProductFilter] = useState<'all' | 'optimized' | 'not-optimized'>('not-optimized');
  
  // State for AI suggestion previews
  const [previewingSuggestion, setPreviewingSuggestion] = useState<{
    productId: string;
    type: string;
    suggestion: string;
    original: string;
    product: any;
  } | null>(null);

  // Connect to Shopify mutation
  const connectShopifyMutation = useMutation({
    mutationFn: (data: { shopDomain: string; userStoreId?: number }) => 
      apiRequest('POST', '/api/shopify/connect', data),
    onSuccess: (data: { authUrl: string }) => {
      console.log('OAuth URL received:', data.authUrl);
      console.log('Attempting redirect in same window...');
      
      // Use the exact same approach as working user-stores.tsx
      setTimeout(() => {
        window.location.href = data.authUrl;
      }, 100);
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to initiate Shopify connection.",
        variant: "destructive",
      });
    },
  });

  // Fetch store details
  const { data: store } = useQuery({
    queryKey: ['/api/stores', storeId],
    queryFn: async () => {
      const stores = await apiRequest('GET', '/api/stores');
      return stores.find((s: Store) => s.id === parseInt(storeId!));
    },
    enabled: !!storeId,
  });

  // Fetch store products (remove dependency on recommendations)
  const { data: products = [], isLoading: productsLoading, error: productsError } = useQuery({
    queryKey: ['/api/shopify/products', storeId],
    queryFn: async () => {
      try {
        return await apiRequest('GET', `/api/shopify/products/${storeId}`);
      } catch (error: any) {
        if (error.message?.includes('Store not connected') || error.message?.includes('authentication expired')) {
          return []; // Return empty array if store not connected
        }
        throw error;
      }
    },
    enabled: !!storeId,
    retry: false, // Don't retry on auth errors
  });

  // Generate AI recommendations based on products
  const { data: recommendations = [] } = useQuery({
    queryKey: ['/api/ai-recommendations', storeId],
    queryFn: async () => {
      return await apiRequest('GET', `/api/ai-recommendations/${storeId}`);
    },
    enabled: !!storeId,
  });

  // User credits
  const { data: userCredits } = useQuery({
    queryKey: ['/api/credits'],
    enabled: !!user,
  });

  // Fetch optimized products to show badges and filter lists
  const { data: optimizedProducts = {} } = useQuery({
    queryKey: ['/api/shopify/optimized-products', storeId],
    queryFn: async () => {
      try {
        return await apiRequest('GET', `/api/shopify/optimized-products/${storeId}`);
      } catch (error) {
        return {}; // Return empty object if no optimizations yet
      }
    },
    enabled: !!storeId,
  });

  // Generate AI suggestion preview
  const generateSuggestionMutation = useMutation({
    mutationFn: async ({ productId, recommendationType }: { 
      productId: string; 
      recommendationType: string; 
    }) => {
      return await apiRequest('POST', `/api/shopify/generate-suggestion`, {
        storeId,
        productId,
        recommendationType,
      });
    },
    onSuccess: (data: any) => {
      setPreviewingSuggestion({
        productId: data.product.id,
        type: data.product.type,
        suggestion: data.suggestion,
        original: data.original,
        product: data.product
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate AI suggestion",
        variant: "destructive",
      });
    },
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
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/optimized-products', storeId] });
      setPreviewingSuggestion(null); // Close preview modal
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
      } else if (error.message?.includes('Insufficient permissions') || error.message?.includes('write permissions')) {
        toast({
          title: "Permission Required",
          description: "Your store needs write permissions to update products. Please reconnect your store to enable AI optimizations.",
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
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/optimized-products', storeId] });
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
    const relevantProducts = productOptimizations[type as keyof typeof productOptimizations]?.map(p => p.id) || [];
    
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

  // Filter products based on optimization status
  const getFilteredProducts = (type: string) => {
    if (productFilter === 'all') {
      return products;
    } else if (productFilter === 'optimized') {
      return products.filter((product: Product) => 
        optimizedProducts[product.id]?.[type]
      );
    } else { // not-optimized
      return products.filter((product: Product) => 
        !optimizedProducts[product.id]?.[type]
      );
    }
  };

  // Helper function to check if a product is optimized for a specific type
  const isProductOptimized = (productId: string, type: string) => {
    return optimizedProducts[productId]?.[type] || false;
  };

  // Check if we have an authentication error
  const hasAuthError = productsError?.message?.includes('authentication expired') || 
                      productsError?.message?.includes('AUTH_EXPIRED') ||
                      (products.length === 0 && !productsLoading && store?.isConnected);

  // Create product-based optimization opportunities for each tab, with filtering
  const productOptimizations = {
    title: productFilter === 'optimized' ? getFilteredProducts('title') : 
           productFilter === 'not-optimized' ? getFilteredProducts('title') :
           getFilteredProducts('title').filter(p => 
             p.title && (
               p.title.length < 30 || 
               p.title.length > 70 || 
               !p.title.includes(p.product_type || '') ||
               p.title === p.title.toUpperCase()
             )
           ),
    description: productFilter === 'optimized' ? getFilteredProducts('description') : 
                 productFilter === 'not-optimized' ? getFilteredProducts('description') :
                 getFilteredProducts('description').filter(p => 
                   (
                     !p.body_html || 
                     p.body_html.length < 100 || 
                     !p.body_html.includes('benefits') ||
                     !p.body_html.includes('features')
                   )
                 ),
    pricing: productFilter === 'optimized' ? getFilteredProducts('pricing') : 
             productFilter === 'not-optimized' ? getFilteredProducts('pricing') :
             getFilteredProducts('pricing').filter(p => 
               p.variants?.[0]?.price && // Must have a price
               (
                 parseFloat(p.variants[0].price) % 1 === 0 || // Round numbers might need .99 pricing
                 !p.variants[0].compare_at_price // Missing compare at price for discounts
               )
             ),
    keywords: productFilter === 'optimized' ? getFilteredProducts('keywords') : 
              productFilter === 'not-optimized' ? getFilteredProducts('keywords') :
              getFilteredProducts('keywords').filter(p => 
                (
                  !p.tags || // No tags at all
                  p.tags.length < 5 || // Very few tags
                  !p.tags.includes(',') // Single tag without commas
                )
              )
  };



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

  // Check if store is connected using the correct schema fields
  const isShopifyConnected = store.isConnected || 
                           store.shopifyAccessToken || 
                           store.connectionStatus === 'connected' ||
                           recommendations.length > 0 || 
                           store.aiRecommendationsCount > 0;

  if (!isShopifyConnected) {
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
                  {store.name} • Not Connected
                </p>
              </div>
            </div>
          </div>

          {/* Store Not Connected */}
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center max-w-md">
              <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ExternalLink className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Connect Your Shopify Store</h3>
              <p className="text-muted-foreground mb-6">
                To use AI recommendations, you need to connect your store to Shopify. This allows us to access your products and apply optimizations.
              </p>
              <div className="space-y-3">
                <Button 
                  onClick={() => {
                    // Trigger Shopify OAuth connection for this specific store
                    const shopifyDomain = store.shopifyDomain || store.storeUrl;
                    if (shopifyDomain) {
                      connectShopifyMutation.mutate({
                        shopDomain: shopifyDomain,
                        userStoreId: store.id
                      });
                    } else {
                      setLocation('/dashboard/stores');
                    }
                  }}
                  disabled={connectShopifyMutation.isPending}
                  className="w-full"
                >
                  {connectShopifyMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Connect to Shopify
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setLocation('/dashboard/stores')}
                  className="w-full"
                >
                  Manage All Stores
                </Button>
              </div>
            </div>
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

        {/* Product Optimization Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Object.entries(productOptimizations).map(([type, products]) => (
            <Card key={type} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getRecommendationIcon(type)}
                    <CardTitle className="text-sm capitalize">{type} Optimization</CardTitle>
                  </div>
                  <Badge variant={products.length > 0 ? 'destructive' : 'default'}>
                    {products.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {products.length} products need optimization
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleBulkApply(type)}
                  disabled={applyBulkMutation.isPending || products.length === 0}
                >
                  {products.length > 0 ? `Optimize All (${products.length} credits)` : 'All Optimized'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Authentication Error Banner */}
        {hasAuthError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-800 font-medium">Shopify Connection Expired</h3>
                <p className="text-red-700 text-sm mt-1">
                  Your Shopify store connection has expired. Please reconnect to access your products and continue optimizations.
                </p>
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    connectShopifyMutation.mutate({ 
                      shopDomain: store?.shopifyDomain || '', 
                      userStoreId: store?.id 
                    });
                  }}
                  disabled={connectShopifyMutation.isPending}
                  className="mt-3"
                  size="sm"
                  type="button"
                >
                  {connectShopifyMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link className="h-3 w-3 mr-2" />
                      Reconnect to Shopify
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(productOptimizations).map(([type, products]) => (
                <Card key={type}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getRecommendationIcon(type)}
                        <CardTitle className="text-base capitalize">{type} Optimization</CardTitle>
                      </div>
                      <Badge variant={products.length > 0 ? 'destructive' : 'default'}>
                        {products.length} products
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {products.length > 0 
                        ? `${products.length} products need ${type} improvements`
                        : `All products have optimal ${type} settings`
                      }
                    </p>
                    {products.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Sample products:</div>
                        {products.slice(0, 3).map((product: Product) => (
                          <div key={product.id} className="flex items-center space-x-2 text-sm">
                            <div className="h-6 w-6 bg-gray-100 rounded flex-shrink-0"></div>
                            <span className="truncate">{product.title}</span>
                          </div>
                        ))}
                        {products.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{products.length - 3} more products
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {(['title', 'description', 'pricing', 'keywords'] as const).map((type) => (
            <TabsContent key={type} value={type} className="space-y-4">
              {productsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading products...</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Products for {type.charAt(0).toUpperCase() + type.slice(1)} Optimization</h3>
                        <p className="text-sm text-muted-foreground">
                          {productOptimizations[type].length} products showing in current filter
                        </p>
                      </div>
                      <Button
                        onClick={() => handleBulkApply(type)}
                        disabled={applyBulkMutation.isPending || productOptimizations[type].filter(p => !isProductOptimized(p.id, type)).length === 0}
                        variant="outline"
                      >
                        Optimize All Non-Optimized ({productOptimizations[type].filter(p => !isProductOptimized(p.id, type)).length} credits)
                      </Button>
                    </div>
                    
                    {/* Product Filter */}
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium">Show:</span>
                      <div className="flex gap-2">
                        <Button 
                          variant={productFilter === 'not-optimized' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setProductFilter('not-optimized')}
                        >
                          Need Optimization ({products.filter(p => !isProductOptimized(p.id, type)).length})
                        </Button>
                        <Button 
                          variant={productFilter === 'optimized' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setProductFilter('optimized')}
                        >
                          AI Optimized ({products.filter(p => isProductOptimized(p.id, type)).length})
                        </Button>
                        <Button 
                          variant={productFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setProductFilter('all')}
                        >
                          All Products ({products.length})
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {productOptimizations[type]?.length > 0 ? (
                    <div className="space-y-4">
                      {productOptimizations[type].map((product: Product) => (
                      <Card key={product.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start space-x-4">
                            {/* Product Image */}
                            <div className="flex-shrink-0">
                              {product.images?.[0]?.src ? (
                                <img
                                  src={product.images[0].src}
                                  alt={product.title}
                                  className="h-20 w-20 object-cover rounded-lg border"
                                />
                              ) : (
                                <div className="h-20 w-20 bg-gray-100 rounded-lg border flex items-center justify-center">
                                  <Tag className="h-8 w-8 text-gray-400" />
                                </div>
                              )}
                            </div>
                            
                            {/* Product Info */}
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-semibold text-base truncate">{product.title}</h4>
                                    {isProductOptimized(product.id, type) && (
                                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                        ✓ AI Optimized
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-2">
                                    ${product.variants?.[0]?.price || 'No price'} • {product.product_type || 'Uncategorized'}
                                  </p>
                                  
                                  {/* Current Value */}
                                  <div className="mb-3">
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                      Current {type}:
                                    </span>
                                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm border">
                                      {type === 'description' ? (
                                        <div className="max-h-32 overflow-y-auto">
                                          <p className="break-words whitespace-pre-wrap">
                                            {product.body_html?.replace(/<[^>]*>/g, '') || 'No description'}
                                          </p>
                                        </div>
                                      ) : (
                                        <p className="break-words">
                                          {type === 'title' ? product.title :
                                           type === 'pricing' ? `$${product.variants?.[0]?.price || 'No price'}` :
                                           product.tags || 'No tags'}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Optimization Opportunity */}
                                  <div className="text-xs text-orange-600 mb-3">
                                    <span className="font-medium">Why optimize: </span>
                                    {type === 'title' && 'Title may need SEO optimization for better search visibility'}
                                    {type === 'description' && 'Description could be more detailed and compelling'}
                                    {type === 'pricing' && 'Pricing strategy could be optimized for conversions'}
                                    {type === 'keywords' && 'Tags and keywords need improvement for better categorization'}
                                  </div>
                                </div>
                                
                                {/* Action Buttons */}
                                <div className="ml-4 flex-shrink-0 space-x-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => 
                                      generateSuggestionMutation.mutate({
                                        productId: product.id,
                                        recommendationType: type,
                                      })
                                    }
                                    disabled={generateSuggestionMutation.isPending}
                                  >
                                    {generateSuggestionMutation.isPending ? (
                                      <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1"></div>
                                        Generating...
                                      </>
                                    ) : (
                                      <>
                                        <Zap className="h-3 w-3 mr-1" />
                                        Preview AI Suggestion
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      {productFilter === 'optimized' ? (
                        <>
                          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold mb-2">No Optimized Products</h3>
                          <p className="text-muted-foreground">
                            No products have been optimized for {type} yet. Switch to "Need Optimization" to see available opportunities.
                          </p>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold mb-2">All Products Optimized!</h3>
                          <p className="text-muted-foreground">
                            {products.length > 0 ? 
                              `All ${products.length} products have optimal ${type} settings.` :
                              'Connect your Shopify store to see product optimization opportunities.'
                            }
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* AI Suggestion Preview Modal */}
      <Dialog open={!!previewingSuggestion} onOpenChange={() => setPreviewingSuggestion(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Optimization Preview</DialogTitle>
            <DialogDescription>
              Review the AI-generated improvement before applying it to your product.
            </DialogDescription>
          </DialogHeader>
          {previewingSuggestion && (
            <div className="space-y-4">
              {/* Product Info */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="h-12 w-12 bg-gray-200 rounded flex items-center justify-center">
                  <Tag className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h4 className="font-medium">{previewingSuggestion.product.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    ${previewingSuggestion.product.price || 'No price'} • Product ID: {previewingSuggestion.productId}
                  </p>
                </div>
              </div>

              {/* Before/After Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h5 className="font-medium text-sm text-muted-foreground mb-2">CURRENT</h5>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="max-h-48 overflow-y-auto">
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {previewingSuggestion.original || 'No current value'}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <h5 className="font-medium text-sm text-green-600 mb-2">
                    {previewingSuggestion.type === 'title' ? 'NEW TITLE GENERATED WITH AI' :
                     previewingSuggestion.type === 'description' ? 'NEW DESCRIPTION GENERATED WITH AI' :
                     previewingSuggestion.type === 'pricing' ? 'NEW PRICING GENERATED WITH AI' :
                     'NEW OPTIMIZATION GENERATED WITH AI'}
                  </h5>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="max-h-48 overflow-y-auto">
                      <p className="text-sm font-medium break-words whitespace-pre-wrap">
                        {previewingSuggestion.suggestion}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Benefits */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <h5 className="font-medium text-sm text-blue-800 mb-1">Expected Benefits:</h5>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Improved SEO ranking and search visibility</li>
                  <li>• Better customer engagement and click-through rates</li>
                  <li>• Enhanced product appeal and conversion potential</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setPreviewingSuggestion(null)}
                  disabled={applyRecommendationMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => 
                    applyRecommendationMutation.mutate({
                      productId: previewingSuggestion.productId,
                      recommendationType: previewingSuggestion.type,
                      suggestion: previewingSuggestion.suggestion,
                    })
                  }
                  disabled={applyRecommendationMutation.isPending}
                >
                  {applyRecommendationMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                      Applying...
                    </>
                  ) : (
                    <>
                      <Zap className="h-3 w-3 mr-2" />
                      Apply Optimization (1 credit)
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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