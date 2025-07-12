import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search, Zap, TrendingUp, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import DashboardLayout from '@/components/DashboardLayout';
import NewResultsSection from '@/components/NewResultsSection';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('shopify');
  const [storeUrl, setStoreUrl] = useState('');
  const [ebayUsername, setEbayUsername] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const analyzeMutation = useMutation({
    mutationFn: async (data: { storeUrl?: string; ebayUsername?: string; storeType: string }) => {
      return apiRequest('POST', '/api/analyze-store', data);
    },
    onSuccess: (data) => {
      console.log("✅ Dashboard received analysis result:", data);
      setAnalysisResult(data);
      setIsAnalyzing(false);
      toast({
        title: "Analysis Complete",
        description: "Your store analysis is ready!",
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze store. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = () => {
    if (activeTab === 'shopify') {
      if (!storeUrl.trim()) {
        toast({
          title: "URL Required",
          description: "Please enter a Shopify store URL.",
          variant: "destructive",
        });
        return;
      }
      
      const finalUrl = storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`;
      setIsAnalyzing(true);
      analyzeMutation.mutate({
        storeUrl: finalUrl,
        storeType: 'shopify'
      });
    } else {
      if (!ebayUsername.trim()) {
        toast({
          title: "Username Required",
          description: "Please enter an eBay username.",
          variant: "destructive",
        });
        return;
      }
      
      setIsAnalyzing(true);
      analyzeMutation.mutate({
        ebayUsername: ebayUsername.trim(),
        storeType: 'ebay'
      });
    }
  };

  const handleNewAnalysis = () => {
    setAnalysisResult(null);
    setStoreUrl('');
    setEbayUsername('');
    setIsAnalyzing(false);
  };

  if (analysisResult) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="mb-6">
            <Button 
              onClick={handleNewAnalysis}
              variant="outline"
              className="mb-4"
            >
              ← New Analysis
            </Button>
          </div>
          <NewResultsSection analysisResult={analysisResult} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Analyze Your Store</h1>
          <p className="text-gray-600">
            Get AI-powered insights and recommendations to optimize your e-commerce store performance.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Credits Available</CardTitle>
              <Zap className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">25</div>
              <p className="text-xs text-muted-foreground">
                Each analysis costs 1 credit
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Analyses Done</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stores Connected</CardTitle>
              <Shield className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                Ready for optimization
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Analysis Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="mr-2 h-5 w-5" />
              Store Analysis
            </CardTitle>
            <CardDescription>
              Enter your store details to get comprehensive AI-powered analysis and recommendations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="shopify">Shopify Store</TabsTrigger>
                <TabsTrigger value="ebay">eBay Store</TabsTrigger>
              </TabsList>
              
              <TabsContent value="shopify" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Store URL</label>
                  <Input
                    placeholder="yourstore.myshopify.com or custom domain"
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    Enter your Shopify store URL (with or without https://)
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="ebay" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">eBay Username</label>
                  <Input
                    placeholder="your-ebay-username"
                    value={ebayUsername}
                    onChange={(e) => setEbayUsername(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    Enter your eBay store username (case-sensitive)
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <Button 
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full mt-6"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Analyzing Store...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Analyze Store (1 Credit)
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Analysis Results */}
        {analysisResult && (
          <div className="mt-8">
            <NewResultsSection analysisResult={analysisResult.analysisData || analysisResult} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}