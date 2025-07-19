import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Megaphone, Store, ShoppingBag, Zap, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import DashboardLayout from '@/components/DashboardLayout';

interface Store {
  id: number;
  name: string;
  storeUrl: string;
  shopifyDomain: string;
  lastAnalysisScore: number;
  aiRecommendationsCount: number;
  isConnected: boolean;
}

interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  handle: string;
  images: Array<{ src: string }>;
  variants: Array<{ price: string; title: string }>;
  product_type: string;
  tags: string;
}

interface GeneratedAd {
  headline: string;
  primary_text: string;
  call_to_action: string;
  image_url?: string;
  platform_format: string;
  style_description: string;
  dalle_prompt?: string;
  error?: string;
}

export default function AdCreator() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Flow state management
  const [currentStep, setCurrentStep] = useState<'store' | 'product' | 'create'>('store');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isWholeStore, setIsWholeStore] = useState(false);
  
  // Ad creation form state
  const [platform, setPlatform] = useState<string>('');
  const [adStyle, setAdStyle] = useState<string>('');
  const [format, setFormat] = useState<string>('');
  const [variants, setVariants] = useState<number>(3);
  const [targetAudience, setTargetAudience] = useState<string>('');
  
  // Generated ads state
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([]);

  // Fetch user stores
  const { data: stores, isLoading: storesLoading } = useQuery({
    queryKey: ['/api/stores'],
    enabled: !!user,
  });

  // Fetch products for selected store
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/shopify/products', selectedStore?.id],
    enabled: !!selectedStore && currentStep === 'product',
  });

  // Fetch user credits
  const { data: userCredits } = useQuery({
    queryKey: ['/api/credits'],
    enabled: !!user,
  });

  // Generate ads mutation
  const generateAdsMutation = useMutation({
    mutationFn: (data: {
      storeId: number;
      productId?: string;
      isWholeStore: boolean;
      platform: string;
      adStyle: string;
      format: string;
      variants: number;
      targetAudience: string;
    }) => apiRequest('POST', '/api/generate-ads', data),
    onSuccess: (data: { ads: GeneratedAd[]; creditsUsed: number }) => {
      console.log('Debug - Ads generation response:', data);
      setGeneratedAds(data.ads);
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      toast({
        title: "Ads Generated Successfully",
        description: `Generated ${data.ads.length} ad variations using ${data.creditsUsed} credits`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate ads",
        variant: "destructive",
      });
    },
  });

  const handleStoreSelect = (store: Store) => {
    setSelectedStore(store);
    setCurrentStep('product');
  };

  const handleProductSelect = (product: Product | null, wholeStore: boolean = false) => {
    setSelectedProduct(product);
    setIsWholeStore(wholeStore);
    setCurrentStep('create');
  };

  const handleGenerateAds = () => {
    if (!selectedStore || !platform || !adStyle || !format || !targetAudience) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Clear previous ads before generating new ones
    setGeneratedAds([]);

    generateAdsMutation.mutate({
      storeId: selectedStore.id,
      productId: selectedProduct?.id,
      isWholeStore,
      platform,
      adStyle,
      format,
      variants,
      targetAudience,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Ad content copied successfully",
    });
  };

  const downloadImage = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Download Started",
        description: `${filename} is being downloaded`,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download image",
        variant: "destructive",
      });
    }
  };

  const generateVariants = () => {
    if (!selectedStore || !platform || !adStyle || !format || !targetAudience) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Generate new variants with same settings
    setGeneratedAds([]);
    handleGenerateAds();
  };

  const resetFlow = () => {
    setCurrentStep('store');
    setSelectedStore(null);
    setSelectedProduct(null);
    setIsWholeStore(false);
    setGeneratedAds([]);
    setPlatform('');
    setAdStyle('');
    setFormat('');
    setVariants(3);
    setTargetAudience('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {currentStep !== 'store' && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (currentStep === 'product') setCurrentStep('store');
                  else if (currentStep === 'create') setCurrentStep('product');
                }}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold flex items-center space-x-2">
                <Megaphone className="h-6 w-6 text-blue-600" />
                <span>AI Ad Creator</span>
              </h1>
              <p className="text-muted-foreground">
                Create powerful converting ads with AI
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

        {/* Progress Steps */}
        <div className="flex items-center space-x-4 mb-8">
          <div className={`flex items-center space-x-2 ${currentStep === 'store' ? 'text-blue-600' : currentStep === 'product' || currentStep === 'create' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'store' ? 'bg-blue-100 text-blue-600' : currentStep === 'product' || currentStep === 'create' ? 'bg-green-100 text-green-600' : 'bg-gray-100'}`}>
              1
            </div>
            <span className="text-sm font-medium">Select Store</span>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-400" />
          <div className={`flex items-center space-x-2 ${currentStep === 'product' ? 'text-blue-600' : currentStep === 'create' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'product' ? 'bg-blue-100 text-blue-600' : currentStep === 'create' ? 'bg-green-100 text-green-600' : 'bg-gray-100'}`}>
              2
            </div>
            <span className="text-sm font-medium">Select Product</span>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-400" />
          <div className={`flex items-center space-x-2 ${currentStep === 'create' ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'create' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'}`}>
              3
            </div>
            <span className="text-sm font-medium">Create Ads</span>
          </div>
        </div>

        {/* Step 1: Store Selection */}
        {currentStep === 'store' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Select a Store</h2>
            {storesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading stores...</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stores?.map((store: Store) => (
                  <Card key={store.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStoreSelect(store)}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Store className="h-5 w-5 text-blue-600" />
                          <CardTitle className="text-base">{store.name}</CardTitle>
                        </div>
                        <Badge variant={store.isConnected ? 'default' : 'secondary'}>
                          {store.isConnected ? 'Connected' : 'Disconnected'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2">{store.storeUrl}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Score: {store.lastAnalysisScore}/100</span>
                        <Button size="sm" variant="outline">
                          Select Store
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Product Selection */}
        {currentStep === 'product' && selectedStore && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Select Product or Whole Store</h2>
            <p className="text-muted-foreground">Choose a specific product or create ads for your entire store</p>
            
            {/* Whole Store Option */}
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleProductSelect(null, true)}>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Store className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Whole Store Ads</CardTitle>
                    <CardDescription>Create general marketing ads for your entire store</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Product Selection */}
            {productsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading products...</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products?.slice(0, 12).map((product: Product) => (
                  <Card key={product.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleProductSelect(product)}>
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          {product.images?.[0]?.src ? (
                            <img
                              src={product.images[0].src}
                              alt={product.title}
                              className="h-16 w-16 object-cover rounded-lg border"
                            />
                          ) : (
                            <div className="h-16 w-16 bg-gray-100 rounded-lg border flex items-center justify-center">
                              <ShoppingBag className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{product.title}</h4>
                          <p className="text-sm text-muted-foreground">${product.variants?.[0]?.price || 'No price'}</p>
                          <p className="text-xs text-muted-foreground">{product.product_type || 'Uncategorized'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Ad Creation */}
        {currentStep === 'create' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Create Your Ads</h2>
                <p className="text-muted-foreground">
                  {isWholeStore 
                    ? `Creating ads for ${selectedStore?.name}` 
                    : `Creating ads for "${selectedProduct?.title}"`
                  }
                </p>
              </div>
              <Button onClick={resetFlow} variant="outline">
                Start Over
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Form */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Ad Configuration</CardTitle>
                    <CardDescription>Configure your ad parameters</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Platform Selection */}
                    <div>
                      <Label htmlFor="platform">Platform *</Label>
                      <Select value={platform} onValueChange={setPlatform}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="facebook">Facebook</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="google">Google Ads</SelectItem>
                          <SelectItem value="pinterest">Pinterest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Ad Style */}
                    <div>
                      <Label>Ad Style *</Label>
                      <RadioGroup value={adStyle} onValueChange={setAdStyle} className="mt-2">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="emotional" id="emotional" />
                          <Label htmlFor="emotional">Emotional</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="curiosity" id="curiosity" />
                          <Label htmlFor="curiosity">Curiosity-based</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="problem-solution" id="problem-solution" />
                          <Label htmlFor="problem-solution">Problem → Solution</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="scarcity" id="scarcity" />
                          <Label htmlFor="scarcity">Scarcity/Urgency</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="social-proof" id="social-proof" />
                          <Label htmlFor="social-proof">Social Proof</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Format */}
                    <div>
                      <Label htmlFor="format">Format *</Label>
                      <Select value={format} onValueChange={setFormat}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short">Short (under 100 words)</SelectItem>
                          <SelectItem value="medium">Medium (100-200 words)</SelectItem>
                          <SelectItem value="long">Long-form (200+ words)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Number of Variants */}
                    <div>
                      <Label htmlFor="variants">Number of Variants</Label>
                      <Select value={variants.toString()} onValueChange={(v) => setVariants(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 variant</SelectItem>
                          <SelectItem value="2">2 variants</SelectItem>
                          <SelectItem value="3">3 variants</SelectItem>
                          <SelectItem value="4">4 variants</SelectItem>
                          <SelectItem value="5">5 variants</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Target Audience */}
                    <div>
                      <Label htmlFor="audience">Target Audience *</Label>
                      <Textarea
                        id="audience"
                        placeholder="Describe your target audience (e.g., women aged 25-45 interested in skincare, fitness enthusiasts, tech-savvy professionals...)"
                        value={targetAudience}
                        onChange={(e) => setTargetAudience(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <Button 
                      onClick={handleGenerateAds} 
                      disabled={generateAdsMutation.isPending || !platform || !adStyle || !format || !targetAudience}
                      className="w-full"
                    >
                      {generateAdsMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Generating Ads...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Generate Ads (1 credit)
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Generated Ads */}
              <div className="space-y-4">
                {generatedAds.length > 0 && (
                  <>
                    <h3 className="text-lg font-semibold">Generated Ads</h3>
                    {generatedAds.map((ad, index) => (
                      <Card key={index} className="overflow-hidden">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base">Ad Variant {index + 1}</CardTitle>
                              <Badge variant="secondary" className="mt-1">
                                {ad.platform_format || `${platform} Format`}
                              </Badge>
                            </div>
                            <div className="flex space-x-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => copyToClipboard(`HEADLINE: ${ad.headline}\n\nPRIMARY TEXT: ${ad.primary_text}\n\nCALL TO ACTION: ${ad.call_to_action}\n\nPLATFORM: ${ad.platform_format}\n\nSTYLE: ${ad.style_description}\n\nIMAGE URL: ${ad.image_url || 'Generation failed'}\n\nDALL-E PROMPT: ${ad.dalle_prompt || 'Not available'}`)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy All
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* AI-Generated Visual Ad */}
                          {ad.image_url ? (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium text-muted-foreground">AI-GENERATED VISUAL AD</Label>
                                <div className="flex space-x-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => downloadImage(ad.image_url!, `${platform}_ad_${index + 1}.png`)}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Download
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(ad.image_url, '_blank')}
                                  >
                                    View Full Size
                                  </Button>
                                </div>
                              </div>
                              <div 
                                className="relative border rounded-lg overflow-hidden bg-gray-100"
                                style={{
                                  aspectRatio: platform === 'TikTok' ? '9/16' : 
                                             platform === 'Pinterest' ? '2/3' :
                                             platform === 'Instagram' ? '1/1' : '1.91/1',
                                  maxHeight: '400px'
                                }}
                              >
                                <img 
                                  src={ad.image_url} 
                                  alt={`AI-generated ${platform} ad`}
                                  className="w-full h-full object-contain"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', 
                                      '<div class="flex items-center justify-center h-full text-muted-foreground">Failed to load image</div>'
                                    );
                                  }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {ad.style_description}
                              </p>
                            </div>
                          ) : ad.error ? (
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-muted-foreground">IMAGE GENERATION FAILED</Label>
                              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <p className="text-sm text-red-600">{ad.error}</p>
                                <p className="text-xs text-red-500 mt-1">
                                  DALL-E Prompt: {ad.dalle_prompt}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-muted-foreground">GENERATING VISUAL AD...</Label>
                              <div className="bg-gray-100 border rounded-lg p-8 text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                <p className="text-sm text-muted-foreground">Creating your AI-powered visual ad...</p>
                              </div>
                            </div>
                          )}

                          {/* Ad Copy Section */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground">HEADLINE</Label>
                              <p className="font-semibold text-sm">{ad.headline}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {ad.headline.length} characters
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground">CALL TO ACTION</Label>
                              <Button size="sm" className="mt-1 w-full">
                                {ad.call_to_action}
                              </Button>
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs font-medium text-muted-foreground">PRIMARY TEXT</Label>
                            <p className="text-sm leading-relaxed">{ad.primary_text}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {ad.primary_text.length} characters
                            </p>
                          </div>

                          {/* DALL-E Prompt Reference */}
                          {ad.dalle_prompt && (
                            <div className="space-y-2 border-t pt-3">
                              <Label className="text-xs font-medium text-muted-foreground">AI GENERATION DETAILS</Label>
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-600">
                                  <span className="font-medium">DALL-E 3 Prompt:</span> {ad.dalle_prompt}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Generate More Variants */}
                          <div className="flex justify-center pt-3 border-t">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={generateVariants}
                              disabled={generateAdsMutation.isPending}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              Generate More Variants
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}