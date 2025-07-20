import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Search, ArrowRight, CheckCircle, BarChart3, Zap } from "lucide-react";
import { landingText } from "@/lib/landingText";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
          title: "Analysis Limit Reached",
          description: "Please sign up for an account to continue analyzing stores.",
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
    <section className="relative bg-gradient-to-br from-indigo-600 via-blue-600 to-violet-700 text-white py-24 overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0">
        <motion.div
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%"],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            repeatType: "reverse",
          }}
          className="w-full h-full bg-gradient-to-r from-blue-400/20 to-violet-400/20"
          style={{
            backgroundSize: "400% 400%",
          }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-4xl md:text-6xl font-bold mb-6 leading-tight"
          >
            {landingText.hero.headline}
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xl md:text-2xl mb-12 text-blue-100 max-w-4xl mx-auto leading-relaxed"
          >
            {landingText.hero.subheadline}
          </motion.p>

          {/* Main CTA Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 max-w-3xl mx-auto border border-white/20"
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
                  <div className="flex-1">
                    <Input
                      type="url"
                      placeholder={landingText.hero.placeholder}
                      value={storeUrl}
                      onChange={(e) => setStoreUrl(e.target.value)}
                      className="h-14 text-lg bg-white/90 border-0 text-gray-900 placeholder:text-gray-500"
                    />
                  </div>
                  <Button
                    onClick={handleAnalyze}
                    disabled={analyzeStoreMutation.isPending}
                    size="lg"
                    className="h-14 px-8 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  >
                    <Search className="w-5 h-5 mr-2" />
                    {analyzeStoreMutation.isPending ? 'Analyzing...' : landingText.hero.ctaButton}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="ebay" className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      type="text"
                      placeholder="Enter your eBay username"
                      value={ebayUsername}
                      onChange={(e) => setEbayUsername(e.target.value)}
                      className="h-14 text-lg bg-white/90 border-0 text-gray-900 placeholder:text-gray-500"
                    />
                  </div>
                  <Button
                    onClick={handleAnalyze}
                    disabled={analyzeStoreMutation.isPending}
                    size="lg"
                    className="h-14 px-8 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  >
                    <Search className="w-5 h-5 mr-2" />
                    {analyzeStoreMutation.isPending ? 'Analyzing...' : landingText.hero.ctaButton}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-blue-100 mt-4 flex items-center justify-center space-x-6 text-sm"
            >
              <span className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                Free
              </span>
              <span className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                No sign-up needed
              </span>
              <span className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                Instant results
              </span>
            </motion.p>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
          >
            <div className="flex items-center justify-center space-x-3 text-blue-100">
              <BarChart3 className="w-8 h-8" />
              <div className="text-left">
                <div className="font-semibold text-white">73/100</div>
                <div className="text-sm">Avg Store Score</div>
              </div>
            </div>
            <div className="flex items-center justify-center space-x-3 text-blue-100">
              <Zap className="w-8 h-8" />
              <div className="text-left">
                <div className="font-semibold text-white">10,000+</div>
                <div className="text-sm">Stores Analyzed</div>
              </div>
            </div>
            <div className="flex items-center justify-center space-x-3 text-blue-100">
              <CheckCircle className="w-8 h-8" />
              <div className="text-left">
                <div className="font-semibold text-white">&lt; 30sec</div>
                <div className="text-sm">Analysis Time</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </section>
  );
}
