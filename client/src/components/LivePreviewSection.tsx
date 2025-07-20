import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Play, BarChart3, Zap, CheckCircle } from "lucide-react";
import { landingText } from "@/lib/landingText";

export default function LivePreviewSection() {
  return (
    <section className="py-20 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-bold text-gray-900 mb-4"
          >
            {landingText.livePreview.title}
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-600 mb-8"
          >
            {landingText.livePreview.subtitle}
          </motion.p>
        </div>

        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <Card className="overflow-hidden shadow-2xl">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-1">
                <div className="bg-white rounded-lg p-8">
                  {/* Mock Analysis Interface */}
                  <div className="flex items-center justify-center mb-8">
                    <div className="relative">
                      <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
                        <Play className="w-12 h-12 text-blue-600" />
                      </div>
                      <motion.div
                        className="absolute inset-0 border-4 border-blue-500 rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <motion.div 
                      className="text-center"
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 }}
                    >
                      <BarChart3 className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                      <h4 className="font-semibold text-gray-900 mb-2">Store Score</h4>
                      <div className="text-3xl font-bold text-blue-600">73/100</div>
                    </motion.div>

                    <motion.div 
                      className="text-center"
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.4 }}
                    >
                      <Zap className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
                      <h4 className="font-semibold text-gray-900 mb-2">Issues Found</h4>
                      <div className="text-3xl font-bold text-yellow-600">12</div>
                    </motion.div>

                    <motion.div 
                      className="text-center"
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 }}
                    >
                      <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-3" />
                      <h4 className="font-semibold text-gray-900 mb-2">Quick Fixes</h4>
                      <div className="text-3xl font-bold text-green-600">8</div>
                    </motion.div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Top Recommendations:</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        Optimize product titles for better SEO
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        Improve mobile navigation design
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        Add trust badges to checkout page
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}