import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { landingText } from "@/lib/landingText";

interface FinalCTASectionProps {
  onAnalysisStart: () => void;
  onAnalysisComplete: (result: any) => void;
  onAnalysisError?: () => void;
}

export default function FinalCTASection({ onAnalysisStart, onAnalysisComplete, onAnalysisError }: FinalCTASectionProps) {
  const [activeTab, setActiveTab] = useState<'shopify' | 'ebay'>('shopify');
  const [storeUrl, setStoreUrl] = useState('');
  const [ebayUsername, setEbayUsername] = useState('');
  const [showSticky, setShowSticky] = useState(false);
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Show sticky CTA when user scrolls past hero section but hide when footer is visible
  useEffect(() => {
    const handleScroll = () => {
      const heroHeight = window.innerHeight; // Approximate hero section height
      const scrollPosition = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Show sticky after hero section
      const shouldShowAfterHero = scrollPosition > heroHeight;
      
      // Hide when footer section is visible (last 800px of page)
      const footerThreshold = documentHeight - windowHeight - 800;
      const shouldHideForFooter = scrollPosition > footerThreshold;
      
      setShowSticky(shouldShowAfterHero && !shouldHideForFooter);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const analyzeStoreMutation = useMutation({
    mutationFn: async (data: { storeUrl?: string; ebayUsername?: string; storeType: 'shopify' | 'ebay' }) => {
      return await apiRequest('POST', '/api/analyze-store', data);
    },
    onSuccess: (result) => {
      if (isAuthenticated) {
        queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      }
      onAnalysisComplete(result);
    },
    onError: (error: any) => {
      if (onAnalysisError) {
        onAnalysisError();
      }
      
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
    if (!storeUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a valid Shopify store URL",
        variant: "destructive",
      });
      return;
    }
    
    let normalizedUrl = storeUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    try {
      new URL(normalizedUrl);
      setStoreUrl(normalizedUrl);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., desertcart.ae or https://www.allbirds.com)",
        variant: "destructive",
      });
      return;
    }

    onAnalysisStart();
    
    const analysisData = {
      storeUrl: normalizedUrl,
      storeType: 'shopify' as const,
    };
    
    analyzeStoreMutation.mutate(analysisData);
  };

  return (
    <>
      {/* Main CTA Section */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-purple-700 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-bold mb-6"
          >
            Ready to Boost Your Sales?
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl mb-8 opacity-90"
          >
            Join thousands of sellers who've improved their stores with AI-powered insights.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl mx-auto"
          >
            <Tabs defaultValue="shopify" className="w-full" onValueChange={(value) => setActiveTab(value as 'shopify' | 'ebay')}>
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-white/20">
                <TabsTrigger value="shopify" className="text-white data-[state=active]:bg-white data-[state=active]:text-gray-900">
                  Shopify Store
                </TabsTrigger>
                <TabsTrigger value="ebay" className="text-white data-[state=active]:bg-white data-[state=active]:text-gray-900">
                  eBay Store
                </TabsTrigger>
              </TabsList>

              <TabsContent value="shopify" className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Input
                    type="url"
                    placeholder={landingText.hero.placeholder}
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                    className="flex-1 h-12 text-gray-900 bg-white/90"
                  />
                  <Button 
                    onClick={handleAnalyze}
                    disabled={analyzeStoreMutation.isPending}
                    size="lg"
                    className="bg-white text-blue-600 hover:bg-gray-100 h-12 px-8 font-semibold"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    {analyzeStoreMutation.isPending ? 'Analyzing...' : landingText.hero.ctaButton}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="ebay" className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Input
                    type="text"
                    placeholder="Enter your eBay username"
                    value={ebayUsername}
                    onChange={(e) => setEbayUsername(e.target.value)}
                    className="flex-1 h-12 text-gray-900 bg-white/90"
                  />
                  <Button 
                    onClick={handleAnalyze}
                    disabled={analyzeStoreMutation.isPending}
                    size="lg"
                    className="bg-white text-blue-600 hover:bg-gray-100 h-12 px-8 font-semibold"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    {analyzeStoreMutation.isPending ? 'Analyzing...' : landingText.hero.ctaButton}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <p className="text-sm mt-4 opacity-75 text-center">
              {landingText.hero.microcopy}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Sticky Bottom CTA - Only show when scrolled past hero */}
      {showSticky && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50 p-4"
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="hidden sm:block">
              <p className="font-semibold text-gray-900">Start analyzing your store now</p>
              <p className="text-sm text-gray-500">Free analysis • Instant results</p>
            </div>
            <div className="flex flex-1 max-w-md gap-2">
              <Input
                type="url"
                placeholder={landingText.hero.placeholder}
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                className="flex-1 h-10"
              />
              <Button 
                onClick={handleAnalyze}
                disabled={analyzeStoreMutation.isPending}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 h-10 whitespace-nowrap"
              >
                <Search className="w-4 h-4 mr-1" />
                {analyzeStoreMutation.isPending ? 'Analyzing...' : 'Analyze'}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}