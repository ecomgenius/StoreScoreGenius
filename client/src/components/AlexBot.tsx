import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageCircle, X, Send, Bot, Zap, BookOpen, Camera, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  timestamp: Date;
  actions?: BotAction[];
}

interface BotAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  variant?: "default" | "secondary" | "outline";
}

interface StoreInsight {
  storeId: number;
  storeName: string;
  healthScore: number;
  totalProducts: number;
  weakestAreas: string[];
  lastAnalyzed: string;
  topIssues: Array<{
    category: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export default function AlexBot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get user stores and recent analyses
  const { data: stores = [] } = useQuery({
    queryKey: ['/api/stores'],
    enabled: !!user
  });

  const { data: insights } = useQuery<StoreInsight[]>({
    queryKey: ['/api/alex/insights'],
    enabled: !!user && isOpen
  });

  const chatMutation = useMutation({
    mutationFn: async (data: { message: string; context?: any }) => {
      return apiRequest('POST', '/api/alex/chat', data);
    },
    onSuccess: (response: any) => {
      const botMessage: Message = {
        id: Date.now().toString(),
        text: response.message,
        isBot: true,
        timestamp: new Date(),
        actions: response.actions || []
      };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    },
    onError: () => {
      setIsTyping(false);
    }
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    chatMutation.mutate({ 
      message: inputValue,
      context: { stores, insights }
    });
  };

  const initializeChat = () => {
    if (messages.length > 0) return;

    setIsTyping(true);
    
    // Generate initial greeting based on available data
    setTimeout(() => {
      const greeting = generateInitialGreeting();
      const initialMessage: Message = {
        id: "initial",
        text: greeting.message,
        isBot: true,
        timestamp: new Date(),
        actions: greeting.actions
      };
      setMessages([initialMessage]);
      setIsTyping(false);
    }, 1000);
  };

  const generateInitialGreeting = () => {
    if (!insights || insights.length === 0) {
      return {
        message: "Hey there! 👋 I'm Alex, your AI e-commerce manager. I haven't analyzed your store data yet. Want me to take a look and give you some personalized insights?",
        actions: [
          {
            id: 'analyze',
            label: 'Analyze My Store',
            icon: <Zap className="h-4 w-4" />,
            action: () => triggerStoreAnalysis()
          }
        ]
      };
    }

    const mainStore = insights[0];
    
    if (mainStore.healthScore < 60) {
      return {
        message: `Hi! 🎯 I've been looking at ${mainStore.storeName} - your health score is ${mainStore.healthScore}/100. I found some quick wins we can tackle right away!

Top issues I spotted:
${mainStore.topIssues.slice(0, 2).map(issue => `• ${issue.description}`).join('\n')}

Ready to fix these?`,
        actions: [
          {
            id: 'fix-titles',
            label: 'Fix Product Titles',
            icon: <Edit3 className="h-4 w-4" />,
            action: () => navigateToOptimization('titles')
          },
          {
            id: 'fix-images',
            label: 'Improve Images',
            icon: <Camera className="h-4 w-4" />,
            action: () => navigateToOptimization('images')
          },
          {
            id: 'learn',
            label: 'Teach Me Why',
            icon: <BookOpen className="h-4 w-4" />,
            action: () => startEducationalSession()
          }
        ]
      };
    } else if (mainStore.healthScore >= 80) {
      return {
        message: `Awesome! 🚀 ${mainStore.storeName} is performing well with a ${mainStore.healthScore}/100 score. You're ready for the next level - let's talk scaling strategies!

Since your basics are solid, want to explore:`,
        actions: [
          {
            id: 'scale',
            label: 'Scaling Strategies',
            icon: <Zap className="h-4 w-4" />,
            action: () => startScalingSession()
          },
          {
            id: 'ads',
            label: 'Generate Ad Creatives',
            icon: <Camera className="h-4 w-4" />,
            action: () => navigateToAdCreator()
          },
          {
            id: 'advanced',
            label: 'Advanced Tips',
            icon: <BookOpen className="h-4 w-4" />,
            action: () => startAdvancedEducation()
          }
        ]
      };
    } else {
      return {
        message: `Hey! 👋 ${mainStore.storeName} is looking decent (${mainStore.healthScore}/100), but I see some opportunities to boost your performance. Want to dive in?`,
        actions: [
          {
            id: 'optimize',
            label: 'Show Optimizations',
            icon: <Zap className="h-4 w-4" />,
            action: () => navigateToRecommendations()
          },
          {
            id: 'weak-products',
            label: 'Fix Weak Products',
            icon: <Edit3 className="h-4 w-4" />,
            action: () => showWeakestProducts()
          }
        ]
      };
    }
  };

  // Action handlers
  const triggerStoreAnalysis = () => {
    // Navigate to store analysis page
    window.location.href = '/dashboard';
  };

  const navigateToOptimization = (type: string) => {
    if (stores.length > 0) {
      window.location.href = `/dashboard/stores/${stores[0].id}/recommendations/products`;
    }
  };

  const navigateToRecommendations = () => {
    if (stores.length > 0) {
      window.location.href = `/dashboard/stores/${stores[0].id}/recommendations`;
    }
  };

  const navigateToAdCreator = () => {
    window.location.href = '/dashboard/ad-creator';
  };

  const startEducationalSession = () => {
    chatMutation.mutate({ 
      message: "Teach me about product optimization",
      context: { type: 'education', stores, insights }
    });
  };

  const startScalingSession = () => {
    chatMutation.mutate({ 
      message: "I want to learn scaling strategies",
      context: { type: 'scaling', stores, insights }
    });
  };

  const startAdvancedEducation = () => {
    chatMutation.mutate({ 
      message: "Show me advanced e-commerce techniques",
      context: { type: 'advanced', stores, insights }
    });
  };

  const showWeakestProducts = () => {
    chatMutation.mutate({ 
      message: "Show me my weakest products",
      context: { type: 'weak_products', stores, insights }
    });
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      initializeChat();
    }
  }, [isOpen, insights]);

  const TypingIndicator = () => (
    <div className="flex items-center space-x-1 p-3">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
      </div>
      <span className="text-sm text-muted-foreground ml-2">Alex is thinking...</span>
    </div>
  );

  if (!user) return null;

  return (
    <>
      {/* Bot Avatar - Bottom Right */}
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg"
          size="sm"
        >
          <Bot className="h-6 w-6 text-white" />
        </Button>
        
        {/* Notification dot for new insights */}
        {insights && insights.some(i => i.healthScore < 70) && (
          <div className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full border-2 border-white">
            <div className="h-full w-full bg-red-500 rounded-full animate-ping"></div>
          </div>
        )}
      </motion.div>

      {/* Chat Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 400 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 400 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 w-96 h-[500px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Alex</h3>
                  <p className="text-xs text-muted-foreground">Your AI E-commerce Manager</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 h-80">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.isBot
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'bg-blue-500 text-white'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-line">{message.text}</p>
                    
                    {/* Action Buttons */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {message.actions.map((action) => (
                          <Button
                            key={action.id}
                            variant={action.variant || "outline"}
                            size="sm"
                            onClick={action.action}
                            className="h-8 text-xs"
                          >
                            {action.icon}
                            <span className="ml-1">{action.label}</span>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isTyping && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="flex space-x-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask Alex anything..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || chatMutation.isPending}
                  size="sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}