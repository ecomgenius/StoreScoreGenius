import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ShoppingBag, ChartLine, CreditCard, Info, Zap } from "lucide-react";
import AuthModal from "./AuthModal";

interface HeroSectionProps {
  onAnalysisStart: () => void;
  onAnalysisComplete: (result: any) => void;
  onAnalysisError?: () => void;
}

export default function HeroSection({ onAnalysisStart, onAnalysisComplete, onAnalysisError }: HeroSectionProps) {
  const [activeTab, setActiveTab] = useState<'shopify' | 'ebay'>('shopify');
  const [storeUrl, setStoreUrl] = useState('');
  const [ebayUsername, setEbayUsername] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const analyzeStoreMutation = useMutation({
    mutationFn: async (data: { storeUrl?: string; ebayUsername?: string; storeType: 'shopify' | 'ebay' }) => {
      return await apiRequest('POST', '/api/analyze-store', data);
    },
    onSuccess: (result) => {
      // Invalidate credits if user is authenticated
      if (isAuthenticated) {
        queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      }
      onAnalysisComplete(result);
    },
    onError: (error: any) => {
      // Reset to hero view when error occurs
      if (onAnalysisError) {
        onAnalysisError();
      }
      
      // Handle specific error cases
      if (error.status === 402) {
        toast({
          title: "Insufficient Credits",
          description: "You need more AI credits to run this analysis. Please purchase credits to continue.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze store. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = () => {
    console.log('Analyze button clicked', { activeTab, storeUrl, ebayUsername });
    
    if (activeTab === 'shopify') {
      if (!storeUrl.trim()) {
        toast({
          title: "URL Required",
          description: "Please enter a valid Shopify store URL",
          variant: "destructive",
        });
        return;
      }
      
      // Auto-add https:// if missing
      let normalizedUrl = storeUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      
      // Basic URL validation
      try {
        new URL(normalizedUrl);
        // Update the state with the normalized URL
        setStoreUrl(normalizedUrl);
      } catch {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid URL (e.g., desertcart.ae or https://www.allbirds.com)",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!ebayUsername.trim()) {
        toast({
          title: "Username Required",
          description: "Please enter a valid eBay username",
          variant: "destructive",
        });
        return;
      }
    }

    console.log('Starting analysis...');
    onAnalysisStart();
    
    const analysisData = {
      storeUrl: activeTab === 'shopify' ? (storeUrl.startsWith('http') ? storeUrl : 'https://' + storeUrl) : undefined,
      ebayUsername: activeTab === 'ebay' ? ebayUsername : undefined,
      storeType: activeTab,
    };
    
    console.log('Mutation data:', analysisData);
    analyzeStoreMutation.mutate(analysisData);
  };

  return (
    <section className="relative bg-gradient-to-br from-primary to-blue-700 text-white py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
          Analyze Your Store's Performance with <span className="text-blue-200">AI</span>
        </h1>
        <p className="text-xl md:text-2xl mb-12 text-blue-100 max-w-3xl mx-auto">
          Get instant insights on your Shopify or eBay store. Discover what's working, what needs improvement, and how to boost your sales.
        </p>
        
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-gray-900 max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="flex justify-center space-x-4 mb-6">
              <Button
                onClick={() => setActiveTab('shopify')}
                variant={activeTab === 'shopify' ? 'default' : 'secondary'}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === 'shopify' 
                    ? 'bg-primary text-white hover:bg-blue-700' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <ShoppingBag className="mr-2 h-4 w-4" />
                Shopify Store
              </Button>
              <Button
                onClick={() => setActiveTab('ebay')}
                variant={activeTab === 'ebay' ? 'default' : 'secondary'}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === 'ebay' 
                    ? 'bg-primary text-white hover:bg-blue-700' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <ShoppingBag className="mr-2 h-4 w-4" />
                eBay Store
              </Button>
            </div>
          </div>
          
          {activeTab === 'shopify' ? (
            <div className="space-y-4">
              <Label className="block text-sm font-medium text-gray-700 text-left">
                Enter your Shopify store URL
              </Label>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="url"
                  placeholder="https://yourstore.myshopify.com"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-gray-900"
                />
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzeStoreMutation.isPending}
                  className="px-8 py-3 bg-primary text-white rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <ChartLine className="mr-2 h-4 w-4" />
                  {analyzeStoreMutation.isPending ? 'Analyzing...' : 'Analyze Store'}
                </Button>
              </div>
              <p className="text-sm text-gray-500 text-left">
                Try: https://www.allbirds.com or https://gymshark.com
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Label className="block text-sm font-medium text-gray-700 text-left">
                Enter your eBay username
              </Label>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="text"
                  placeholder="your-ebay-username"
                  value={ebayUsername}
                  onChange={(e) => setEbayUsername(e.target.value)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-gray-900"
                />
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzeStoreMutation.isPending}
                  className="px-8 py-3 bg-primary text-white rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <ChartLine className="mr-2 h-4 w-4" />
                  {analyzeStoreMutation.isPending ? 'Analyzing...' : 'Analyze Store'}
                </Button>
              </div>
              <p className="text-sm text-gray-500 text-left">
                Try: thrift-store-finds or vintage-collectibles
              </p>
            </div>
          )}
        </div>
      </div>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </section>
  );
}
