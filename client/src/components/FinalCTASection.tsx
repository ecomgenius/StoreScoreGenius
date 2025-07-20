import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Search } from "lucide-react";
import { landingText } from "@/lib/landingText";

interface FinalCTASectionProps {
  onAnalysisStart: () => void;
}

export default function FinalCTASection({ onAnalysisStart }: FinalCTASectionProps) {
  const [storeUrl, setStoreUrl] = useState('');

  const handleAnalyze = () => {
    // This will use the same logic as the hero section
    onAnalysisStart();
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
            className="max-w-md mx-auto"
          >
            <div className="flex flex-col sm:flex-row gap-4">
              <Input
                type="url"
                placeholder={landingText.hero.placeholder}
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                className="flex-1 h-12 text-gray-900"
              />
              <Button 
                onClick={handleAnalyze}
                size="lg"
                className="bg-white text-blue-600 hover:bg-gray-100 h-12 px-8 font-semibold"
              >
                <Search className="w-4 h-4 mr-2" />
                {landingText.hero.ctaButton}
              </Button>
            </div>
            <p className="text-sm mt-4 opacity-75">
              {landingText.hero.microcopy}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Sticky Bottom CTA */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1 }}
        className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50 p-4"
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="hidden sm:block">
            <p className="font-semibold text-gray-900">Start analyzing your store now</p>
            <p className="text-sm text-gray-500">Free analysis • Instant results</p>
          </div>
          <Button 
            onClick={handleAnalyze}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8"
          >
            {landingText.finalCta.sticky}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </motion.div>
    </>
  );
}