import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, BarChart3, Zap, CheckCircle, Bot, TrendingUp, ArrowRight, Store } from "lucide-react";
import { landingText } from "@/lib/landingText";

const steps = [
  {
    id: 'connect',
    title: 'Connect Your Store',
    description: 'No login needed, just your public store URL'
  },
  {
    id: 'analyze',
    title: 'Instant Store Analysis',
    description: 'AI scans your store in under 30 seconds'
  },
  {
    id: 'alex',
    title: 'Meet Alex - Your AI Manager',
    description: '24/7 personalized guidance and recommendations'
  },
  {
    id: 'boost',
    title: 'Boost & Fix',
    description: 'Watch your conversion potential grow'
  }
];

export default function LivePreviewSection() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [animatedScore, setAnimatedScore] = useState(58);
  const [animatedIssues, setAnimatedIssues] = useState(0);
  const [typingText, setTypingText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState([]);

  const fullUrl = 'your-store.myshopify.com';

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length);
    }, 4000); // 4 seconds per step

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Step-specific animations
  useEffect(() => {
    setAnimatedScore(58);
    setAnimatedIssues(0);
    setTypingText('');
    setShowSuggestions([]);

    if (currentStep === 0) {
      // Step 1: Typing animation
      const typing = setTimeout(() => {
        let i = 0;
        const typeInterval = setInterval(() => {
          if (i <= fullUrl.length) {
            setTypingText(fullUrl.substring(0, i));
            i++;
          } else {
            clearInterval(typeInterval);
          }
        }, 100);
      }, 500);

      return () => clearTimeout(typing);
    }

    if (currentStep === 1) {
      // Step 2: Score and issues animation
      setTimeout(() => {
        const scoreInterval = setInterval(() => {
          setAnimatedScore(prev => {
            if (prev < 73) return prev + 1;
            clearInterval(scoreInterval);
            return 73;
          });
        }, 100);

        const issuesInterval = setInterval(() => {
          setAnimatedIssues(prev => {
            if (prev < 12) return prev + 1;
            clearInterval(issuesInterval);
            return 12;
          });
        }, 150);

        // Show suggestions one by one
        const suggestions = ['SEO Optimization', 'Mobile Design', 'Trust Badges'];
        suggestions.forEach((suggestion, index) => {
          setTimeout(() => {
            setShowSuggestions(prev => [...prev, suggestion]);
          }, 2000 + (index * 500));
        });
      }, 1000);
    }
  }, [currentStep]);

  return (
    <section className="py-20 bg-gradient-to-br from-blue-50 to-indigo-50 relative overflow-hidden">
      {/* Background animation */}
      <motion.div
        className="absolute inset-0 opacity-10"
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%"],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: "reverse",
        }}
        style={{
          backgroundImage: "radial-gradient(circle, #4463ff 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
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

          {/* Step Indicators */}
          <div className="flex justify-center space-x-4 mb-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                className={`flex flex-col items-center cursor-pointer ${
                  index === currentStep ? 'text-blue-600' : 'text-gray-400'
                }`}
                onClick={() => {
                  setCurrentStep(index);
                  setIsPlaying(false);
                  setTimeout(() => setIsPlaying(true), 1000);
                }}
                whileHover={{ scale: 1.05 }}
              >
                <div className={`w-3 h-3 rounded-full mb-2 transition-all duration-300 ${
                  index === currentStep ? 'bg-blue-600 scale-125' : 'bg-gray-300'
                }`} />
                <span className="text-xs font-medium hidden sm:block">{step.title}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <Card className="overflow-hidden shadow-2xl bg-white">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-1">
                <div className="bg-white rounded-lg p-8">
                  
                  <AnimatePresence mode="wait">
                    {/* Step 1: Connect Store */}
                    {currentStep === 0 && (
                      <motion.div
                        key="connect"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.5 }}
                        className="text-center"
                      >
                        <motion.div 
                          className="flex justify-center mb-6"
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        >
                          <Store className="w-16 h-16 text-blue-600" />
                        </motion.div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">Connect Your Store</h3>
                        
                        <div className="max-w-md mx-auto mb-4">
                          <div className="flex space-x-3">
                            <Input
                              value={typingText}
                              placeholder="your-store.myshopify.com"
                              className="flex-1 h-12 text-lg"
                              readOnly
                            />
                            <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                              Connect Store
                            </Button>
                          </div>
                        </div>
                        
                        <motion.p 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1 }}
                          className="text-sm text-gray-500"
                        >
                          💡 No login needed, just your public store URL
                        </motion.p>
                      </motion.div>
                    )}

                    {/* Step 2: Analysis */}
                    {currentStep === 1 && (
                      <motion.div
                        key="analyze"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.5 }}
                        className="text-center"
                      >
                        <h3 className="text-2xl font-bold text-gray-900 mb-6">Instant Store Analysis</h3>
                        
                        {/* Scanning Animation */}
                        <div className="flex items-center justify-center mb-8">
                          <motion.div
                            className="relative"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          >
                            <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full" />
                          </motion.div>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6 mb-6">
                          <motion.div className="text-center">
                            <BarChart3 className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                            <h4 className="font-semibold text-gray-900 mb-2">Store Score</h4>
                            <motion.div 
                              className="text-3xl font-bold text-blue-600"
                              key={animatedScore}
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 0.3 }}
                            >
                              {animatedScore}/100
                            </motion.div>
                          </motion.div>

                          <motion.div className="text-center">
                            <Zap className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
                            <h4 className="font-semibold text-gray-900 mb-2">Issues Found</h4>
                            <motion.div 
                              className="text-3xl font-bold text-yellow-600"
                              key={animatedIssues}
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 0.3 }}
                            >
                              {animatedIssues}
                            </motion.div>
                          </motion.div>

                          <motion.div className="text-center">
                            <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-3" />
                            <h4 className="font-semibold text-gray-900 mb-2">Quick Fixes</h4>
                            <div className="text-3xl font-bold text-green-600">8</div>
                          </motion.div>
                        </div>

                        {/* Animated Suggestions */}
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3">Top Recommendations:</h4>
                          <div className="space-y-2">
                            <AnimatePresence>
                              {showSuggestions.map((suggestion, index) => (
                                <motion.div
                                  key={suggestion}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: index * 0.2 }}
                                  className="flex items-center text-sm text-gray-600"
                                >
                                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                                  {suggestion} optimization detected
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 3: Alex AI */}
                    {currentStep === 2 && (
                      <motion.div
                        key="alex"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.5 }}
                        className="text-center"
                      >
                        <h3 className="text-2xl font-bold text-gray-900 mb-6">Meet Alex - Your AI Manager</h3>
                        
                        <div className="flex justify-center mb-6">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", bounce: 0.5 }}
                            className="relative"
                          >
                            <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                              <Bot className="w-12 h-12 text-white" />
                            </div>
                            <motion.div
                              className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full"
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 1, repeat: Infinity }}
                            />
                          </motion.div>
                        </div>

                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.5 }}
                          className="bg-blue-50 rounded-2xl p-6 max-w-md mx-auto relative"
                        >
                          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                            <div className="w-6 h-6 bg-blue-50 rotate-45" />
                          </div>
                          <p className="text-gray-700 mb-4">
                            "Hey 👋 I see <span className="font-semibold text-blue-600">12 things</span> we can improve right now. Want me to guide you?"
                          </p>
                          <div className="flex space-x-3 justify-center">
                            <Button size="sm" variant="outline">Maybe Later</Button>
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Let's Do It!</Button>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}

                    {/* Step 4: Boost Results */}
                    {currentStep === 3 && (
                      <motion.div
                        key="boost"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.5 }}
                        className="text-center"
                      >
                        <h3 className="text-2xl font-bold text-gray-900 mb-6">Boost & Fix</h3>
                        
                        <div className="flex justify-center mb-8">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", delay: 0.2 }}
                          >
                            <TrendingUp className="w-20 h-20 text-green-600" />
                          </motion.div>
                        </div>

                        {/* Animated Revenue Growth */}
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 mb-6">
                          <motion.div
                            className="text-4xl font-bold text-green-600 mb-2"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 0.5, repeat: 2 }}
                          >
                            +26% 📈
                          </motion.div>
                          <p className="text-gray-700 font-medium">Increase in Conversion Potential</p>
                        </div>

                        {/* Progress Bar Animation */}
                        <div className="mb-6">
                          <div className="flex justify-between mb-2">
                            <span className="text-sm text-gray-600">Revenue Growth</span>
                            <span className="text-sm text-gray-600">26%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <motion.div
                              className="bg-gradient-to-r from-green-500 to-blue-500 h-3 rounded-full"
                              initial={{ width: "0%" }}
                              animate={{ width: "26%" }}
                              transition={{ duration: 2, delay: 0.5 }}
                            />
                          </div>
                        </div>

                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1 }}
                        >
                          <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8">
                            Try It Now – Get Your Free Report
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Play/Pause Control */}
          <div className="text-center mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-gray-600 hover:text-gray-900"
            >
              {isPlaying ? 'Pause Demo' : 'Play Demo'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}