import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Palette, 
  ChevronRight, 
  Zap, 
  Eye,
  Smartphone,
  Monitor,
  Brush,
  Type,
  Image,
  Layout,
  CheckCircle,
  RefreshCw
} from "lucide-react";

interface DesignSuggestion {
  id: string;
  type: 'colors' | 'fonts' | 'layout' | 'images' | 'mobile';
  title: string;
  description: string;
  impact: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggestions: {
    current?: string;
    recommended: string;
    cssChanges?: string;
    preview?: string;
  };
}

export default function DesignRecommendations() {
  const { storeId } = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [previewingSuggestion, setPreviewingSuggestion] = useState<DesignSuggestion | null>(null);
  const [regeneratingColors, setRegeneratingColors] = useState(false);

  // Fetch store details
  const { data: stores = [] } = useQuery({
    queryKey: ['/api/stores'],
    enabled: !!user,
  });

  const store = stores.find((s: any) => s.id === parseInt(storeId!));

  // Fetch user credits
  const { data: userCredits } = useQuery({
    queryKey: ['/api/credits'],
    enabled: !!user,
  });

  // Fetch design recommendations
  const { data: designAnalysis, isLoading } = useQuery({
    queryKey: ['/api/design-recommendations', storeId],
    queryFn: async () => {
      return await apiRequest('GET', `/api/design-recommendations/${storeId}`);
    },
    enabled: !!storeId && !!user,
  });

  // Apply design suggestion mutation
  const applyDesignMutation = useMutation({
    mutationFn: async ({ suggestionId, changes }: { suggestionId: string; changes: any }) => {
      return await apiRequest('POST', '/api/shopify/apply-design', {
        storeId,
        suggestionId,
        changes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      queryClient.invalidateQueries({ queryKey: ['/api/design-recommendations', storeId] });
      toast({
        title: "Design Applied",
        description: "Your store design has been updated successfully",
      });
    },
    onError: (error: any) => {
      // Check if it's a permission error
      if (error.message?.includes('theme permissions') || error.message?.includes('needsReconnect')) {
        toast({
          title: "Permissions Required",
          description: "Please reconnect your store to grant theme editing permissions. Go to Store Management and click 'Reconnect'.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to Apply Design",
          description: error.message || "Failed to update store design",
          variant: "destructive",
        });
      }
    },
  });

  // Generate new color palette mutation
  const generateNewColorsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/design-recommendations/generate-colors', {
        storeId,
      });
    },
    onSuccess: (newColorSuggestion) => {
      // Update the color suggestion in the current data
      queryClient.invalidateQueries({ queryKey: ['/api/design-recommendations', storeId] });
      toast({
        title: "New Colors Generated",
        description: "Fresh color palette suggestions have been created",
      });
      setRegeneratingColors(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Generate Colors",
        description: error.message || "Failed to generate new color palette",
        variant: "destructive",
      });
      setRegeneratingColors(false);
    },
  });

  const designCategories = [
    {
      id: 'colors',
      title: 'Color Scheme',
      description: 'Optimize brand colors and visual hierarchy',
      icon: Palette,
      color: 'bg-purple-500',
    },
    {
      id: 'fonts',
      title: 'Typography',
      description: 'Improve readability and brand consistency',
      icon: Type,
      color: 'bg-blue-500',
    },
    {
      id: 'layout',
      title: 'Layout & Spacing',
      description: 'Enhance visual flow and user experience',
      icon: Layout,
      color: 'bg-green-500',
    },
    {
      id: 'images',
      title: 'Visual Assets',
      description: 'Optimize product images and visual content',
      icon: Image,
      color: 'bg-orange-500',
    },
    {
      id: 'mobile',
      title: 'Mobile Experience',
      description: 'Ensure perfect mobile responsiveness',
      icon: Smartphone,
      color: 'bg-indigo-500',
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
            <Link href={`/dashboard/stores/${storeId}/recommendations`} className="hover:text-primary">
              {store.name}
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span>Design Recommendations</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Design & Branding</h1>
          <p className="text-muted-foreground">
            AI-powered design improvements for {store.name}
          </p>
        </div>

        {/* Current Design Score */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Design Performance Score</CardTitle>
                <CardDescription>
                  Your store's visual appeal and user experience rating
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">
                  {designAnalysis?.designScore || 0}<span className="text-lg text-muted-foreground">/20</span>
                </div>
                <Progress value={(designAnalysis?.designScore || 0) * 5} className="w-32 mt-2" />
              </div>
            </div>
          </CardHeader>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Analyzing your store design...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Design Categories */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {designCategories.map((category) => {
                const categorySuggestions = designAnalysis?.suggestions?.filter(
                  (s: DesignSuggestion) => s.type === category.id
                ) || [];
                
                return (
                  <Card key={category.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${category.color} bg-opacity-10`}>
                          <category.icon className="h-5 w-5 text-current" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{category.title}</CardTitle>
                          <CardDescription className="text-sm">
                            {category.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Badge variant={categorySuggestions.length > 0 ? 'destructive' : 'default'}>
                          {categorySuggestions.length} {categorySuggestions.length === 1 ? 'issue' : 'issues'}
                        </Badge>
                        {categorySuggestions.length === 0 && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Design Suggestions */}
            {designAnalysis?.suggestions && designAnalysis.suggestions.length > 0 ? (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">Design Improvements</h2>
                
                {designAnalysis.suggestions.map((suggestion: DesignSuggestion, index: number) => {
                  const category = designCategories.find(c => c.id === suggestion.type);
                  
                  return (
                    <Card key={suggestion.id} className="overflow-hidden">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            {category && (
                              <div className={`p-2 rounded-lg ${category.color} bg-opacity-10 mt-1`}>
                                <category.icon className="h-4 w-4 text-current" />
                              </div>
                            )}
                            <div>
                              <CardTitle className="text-lg">{suggestion.title}</CardTitle>
                              <CardDescription>{suggestion.description}</CardDescription>
                              <div className="flex items-center space-x-2 mt-2">
                                <Badge variant={
                                  suggestion.priority === 'critical' ? 'destructive' :
                                  suggestion.priority === 'high' ? 'secondary' : 'default'
                                }>
                                  {suggestion.priority} priority
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {suggestion.impact}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      
                      <CardContent>
                        {/* Before/After Preview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <h4 className="font-medium text-sm text-muted-foreground mb-2">CURRENT</h4>
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                              <p className="text-sm">{suggestion.suggestions.current || 'Current design element'}</p>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm text-green-600 mb-2">RECOMMENDED</h4>
                            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                              <p className="text-sm font-medium">{suggestion.suggestions.recommended}</p>
                            </div>
                          </div>
                        </div>

                        {/* Preview Button */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              Preview changes before applying
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            {/* Show generate new colors button only for color suggestions */}
                            {suggestion.type === 'colors' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setRegeneratingColors(true);
                                  generateNewColorsMutation.mutate();
                                }}
                                disabled={generateNewColorsMutation.isPending || regeneratingColors}
                              >
                                {generateNewColorsMutation.isPending || regeneratingColors ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-2"></div>
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    New Colors
                                  </>
                                )}
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setPreviewingSuggestion(suggestion)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Preview
                            </Button>
                            <Button 
                              onClick={() => 
                                applyDesignMutation.mutate({
                                  suggestionId: suggestion.id,
                                  changes: suggestion.suggestions
                                })
                              }
                              disabled={applyDesignMutation.isPending || (userCredits?.credits || 0) < 1}
                              size="sm"
                            >
                              {applyDesignMutation.isPending ? (
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
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Great Design!</h3>
                  <p className="text-muted-foreground">
                    Your store design is optimized and doesn't need immediate improvements.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Design Preview Modal */}
      <Dialog open={!!previewingSuggestion} onOpenChange={() => setPreviewingSuggestion(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Design Preview</DialogTitle>
            <DialogDescription>
              Preview how this design change will look on your store.
            </DialogDescription>
          </DialogHeader>
          {previewingSuggestion && (
            <div className="space-y-6">
              {/* Design Info */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className={`p-2 rounded-lg bg-opacity-10 ${
                  previewingSuggestion.type === 'colors' ? 'bg-purple-500' :
                  previewingSuggestion.type === 'fonts' ? 'bg-blue-500' :
                  previewingSuggestion.type === 'layout' ? 'bg-green-500' :
                  previewingSuggestion.type === 'images' ? 'bg-orange-500' :
                  'bg-indigo-500'
                }`}>
                  {previewingSuggestion.type === 'colors' ? <Palette className="h-5 w-5" /> :
                   previewingSuggestion.type === 'fonts' ? <Type className="h-5 w-5" /> :
                   previewingSuggestion.type === 'layout' ? <Layout className="h-5 w-5" /> :
                   previewingSuggestion.type === 'images' ? <Image className="h-5 w-5" /> :
                   <Smartphone className="h-5 w-5" />}
                </div>
                <div>
                  <h4 className="font-medium">{previewingSuggestion.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {previewingSuggestion.type.charAt(0).toUpperCase() + previewingSuggestion.type.slice(1)} optimization
                  </p>
                </div>
              </div>

              {/* Before/After Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h5 className="font-medium text-sm text-muted-foreground mb-3">CURRENT DESIGN</h5>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg min-h-[200px]">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Current State:</div>
                      <p className="text-sm text-gray-700">
                        {previewingSuggestion.suggestions.current || 'Current design element'}
                      </p>
                      
                      {/* Visual representation based on type */}
                      {previewingSuggestion.type === 'colors' && (
                        <div className="mt-3">
                          <div className="text-xs text-gray-500 mb-2">Current color scheme:</div>
                          <div className="flex space-x-2">
                            <div className="w-8 h-8 bg-gray-400 rounded border"></div>
                            <div className="w-8 h-8 bg-gray-300 rounded border"></div>
                            <div className="w-8 h-8 bg-gray-200 rounded border"></div>
                          </div>
                        </div>
                      )}
                      
                      {previewingSuggestion.type === 'fonts' && (
                        <div className="mt-3">
                          <div className="text-xs text-gray-500 mb-2">Current typography:</div>
                          <div className="space-y-1">
                            <div className="text-base font-bold">Heading Example</div>
                            <div className="text-sm">Body text example with current font</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h5 className="font-medium text-sm text-green-600 mb-3">IMPROVED DESIGN</h5>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg min-h-[200px]">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-green-800">Recommended:</div>
                      <p className="text-sm text-green-700 font-medium">
                        {previewingSuggestion.suggestions.recommended}
                      </p>
                      
                      {/* Visual representation based on type */}
                      {previewingSuggestion.type === 'colors' && (
                        <div className="mt-3">
                          <div className="text-xs text-green-600 mb-2">Improved color scheme:</div>
                          <div className="space-y-2">
                            {/* Show actual color palette if available */}
                            {(previewingSuggestion.suggestions as any).colorPalette ? (
                              <div className="space-y-3">
                                <div className="flex space-x-2">
                                  {Object.entries((previewingSuggestion.suggestions as any).colorPalette).map(([colorType, hexColor]: [string, any]) => (
                                    <div key={colorType} className="text-center">
                                      <div 
                                        className="w-12 h-12 rounded border shadow-sm mb-1" 
                                        style={{ backgroundColor: hexColor }}
                                      ></div>
                                      <div className="text-xs text-gray-600 capitalize">{colorType}</div>
                                      <div className="text-xs text-gray-500 font-mono">{hexColor}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="p-3 border rounded bg-white">
                                  <div className="space-y-2">
                                    <div 
                                      className="text-white px-4 py-2 rounded text-sm font-medium text-center"
                                      style={{ backgroundColor: (previewingSuggestion.suggestions as any).colorPalette.primary }}
                                    >
                                      Add to Cart
                                    </div>
                                    <div 
                                      className="px-4 py-2 rounded text-sm text-center border"
                                      style={{ 
                                        color: (previewingSuggestion.suggestions as any).colorPalette.accent,
                                        borderColor: (previewingSuggestion.suggestions as any).colorPalette.accent
                                      }}
                                    >
                                      View Details
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              // Fallback generic color preview
                              <div className="space-y-2">
                                <div className="flex space-x-2">
                                  <div className="w-8 h-8 bg-blue-600 rounded border shadow-sm"></div>
                                  <div className="w-8 h-8 bg-blue-500 rounded border shadow-sm"></div>
                                  <div className="w-8 h-8 bg-blue-400 rounded border shadow-sm"></div>
                                </div>
                                <div className="p-2 border rounded bg-white">
                                  <div className="bg-blue-600 text-white px-3 py-1 rounded text-xs">Add to Cart</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {previewingSuggestion.type === 'fonts' && (
                        <div className="mt-3">
                          <div className="text-xs text-green-600 mb-2">Improved typography:</div>
                          <div className="p-2 border rounded bg-white space-y-1">
                            <div className="text-base font-bold font-serif">Premium Product Title</div>
                            <div className="text-sm font-sans text-gray-600">Clear, readable product description text</div>
                            <div className="text-lg font-semibold text-green-600">$99.99</div>
                          </div>
                        </div>
                      )}
                      
                      {previewingSuggestion.type === 'layout' && (
                        <div className="mt-3">
                          <div className="text-xs text-green-600 mb-2">Improved layout:</div>
                          <div className="p-2 border rounded bg-white">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="bg-gray-100 h-8 rounded flex items-center justify-center">Header</div>
                              <div className="bg-blue-100 h-8 rounded flex items-center justify-center">Product</div>
                              <div className="bg-green-100 h-8 rounded flex items-center justify-center">CTA</div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {previewingSuggestion.type === 'images' && (
                        <div className="mt-3">
                          <div className="text-xs text-green-600 mb-2">Improved image layout:</div>
                          <div className="p-2 border rounded bg-white">
                            <div className="grid grid-cols-2 gap-1">
                              <div className="bg-gradient-to-br from-blue-100 to-blue-200 h-12 rounded border flex items-center justify-center text-xs">
                                HD Image
                              </div>
                              <div className="bg-gradient-to-br from-green-100 to-green-200 h-12 rounded border flex items-center justify-center text-xs">
                                Detail View
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {(previewingSuggestion.title.toLowerCase().includes('trust') || 
                        previewingSuggestion.title.toLowerCase().includes('security') ||
                        previewingSuggestion.title.toLowerCase().includes('badge') ||
                        previewingSuggestion.suggestions.recommended.toLowerCase().includes('security') ||
                        previewingSuggestion.suggestions.recommended.toLowerCase().includes('testimonial') ||
                        previewingSuggestion.suggestions.recommended.toLowerCase().includes('badge')) && (
                        <div className="mt-3">
                          <div className="text-xs text-green-600 mb-2">Trust signals preview:</div>
                          <div className="p-2 border rounded bg-white space-y-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <div className="w-2 h-1 bg-white rounded"></div>
                              </div>
                              <span className="text-xs font-medium">SSL Secured</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-4 h-4 bg-blue-500 rounded flex items-center justify-center">
                                <div className="w-2 h-1 bg-white rounded"></div>
                              </div>
                              <span className="text-xs">PayPal Protected</span>
                            </div>
                            <div className="border-t pt-2">
                              <div className="text-xs text-gray-600">"Great product, fast shipping!" - Sarah M.</div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {previewingSuggestion.title.toLowerCase().includes('mobile') && (
                        <div className="mt-3">
                          <div className="text-xs text-green-600 mb-2">Mobile optimization:</div>
                          <div className="w-16 mx-auto">
                            <div className="bg-black rounded-lg p-1">
                              <div className="bg-white rounded text-xs p-2 space-y-1">
                                <div className="bg-gray-100 h-2 rounded"></div>
                                <div className="bg-blue-100 h-4 rounded"></div>
                                <div className="bg-green-100 h-3 rounded w-1/2"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {(previewingSuggestion.title.toLowerCase().includes('button') ||
                        previewingSuggestion.title.toLowerCase().includes('cta') ||
                        previewingSuggestion.title.toLowerCase().includes('conversion') ||
                        previewingSuggestion.suggestions.recommended.toLowerCase().includes('button') ||
                        previewingSuggestion.suggestions.recommended.toLowerCase().includes('checkout')) && (
                        <div className="mt-3">
                          <div className="text-xs text-green-600 mb-2">Conversion elements:</div>
                          <div className="p-2 border rounded bg-white space-y-2">
                            <div className="flex space-x-2">
                              <div className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md">
                                Buy Now - 20% Off!
                              </div>
                              <div className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md">
                                Add to Cart
                              </div>
                            </div>
                            <div className="border-t pt-2">
                              <div className="text-xs text-red-600 font-medium">🔥 Only 3 left in stock!</div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {(previewingSuggestion.title.toLowerCase().includes('form') ||
                        previewingSuggestion.title.toLowerCase().includes('input') ||
                        previewingSuggestion.suggestions.recommended.toLowerCase().includes('form') ||
                        previewingSuggestion.suggestions.recommended.toLowerCase().includes('field')) && (
                        <div className="mt-3">
                          <div className="text-xs text-green-600 mb-2">Form improvements:</div>
                          <div className="p-2 border rounded bg-white space-y-2">
                            <div className="space-y-1">
                              <input 
                                type="text" 
                                placeholder="Your email address" 
                                className="w-full px-2 py-1 border rounded text-xs"
                                disabled
                              />
                              <div className="bg-blue-500 text-white px-3 py-1 rounded text-xs text-center">
                                Get 10% Discount
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Technical Details */}
              {previewingSuggestion.suggestions.cssChanges && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h5 className="font-medium text-sm mb-2">Implementation Details:</h5>
                  <code className="text-xs bg-white p-2 rounded border block">
                    {previewingSuggestion.suggestions.cssChanges}
                  </code>
                </div>
              )}

              {/* Impact & Benefits */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h5 className="font-medium text-sm text-blue-800 mb-1">Expected Impact:</h5>
                <p className="text-sm text-blue-700">{previewingSuggestion.impact}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between pt-4">
                <div className="flex items-center space-x-2">
                  {/* Generate New Colors button for color suggestions */}
                  {previewingSuggestion.type === 'colors' && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setRegeneratingColors(true);
                        generateNewColorsMutation.mutate();
                      }}
                      disabled={generateNewColorsMutation.isPending || regeneratingColors}
                    >
                      {generateNewColorsMutation.isPending || regeneratingColors ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-2"></div>
                          Generating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Generate New Colors
                        </>
                      )}
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setPreviewingSuggestion(null)}
                  >
                    Close Preview
                  </Button>
                  <Button 
                    onClick={() => {
                      applyDesignMutation.mutate({
                        suggestionId: previewingSuggestion.id,
                        changes: previewingSuggestion.suggestions
                      });
                      setPreviewingSuggestion(null);
                    }}
                    disabled={applyDesignMutation.isPending || (userCredits?.credits || 0) < 1}
                  >
                    {applyDesignMutation.isPending ? (
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}