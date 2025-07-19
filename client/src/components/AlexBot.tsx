import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageCircle, X, Send, Bot, Zap, BookOpen, Camera, Edit3, Plus, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

interface Message {
  id: number;
  content: string;
  isFromAlex: boolean;
  createdAt: Date;
  actions?: BotAction[];
}

interface ChatSession {
  id: number;
  title: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [showSessionSelector, setShowSessionSelector] = useState(false);
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

  // Get user's chat sessions
  const { data: sessions = [], refetch: refetchSessions } = useQuery<ChatSession[]>({
    queryKey: ['/api/alex/sessions'],
    enabled: !!user && isOpen
  });

  // Get messages for current session
  const { data: sessionMessages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ['/api/alex/sessions', currentSessionId, 'messages'],
    enabled: !!user && !!currentSessionId
  });

  // Update messages when sessionMessages changes
  useEffect(() => {
    if (sessionMessages) {
      setMessages(sessionMessages);
    }
  }, [sessionMessages]);

  const chatMutation = useMutation({
    mutationFn: async (data: { message: string; context?: any; sessionId?: number }) => {
      return apiRequest('POST', '/api/alex/chat', data);
    },
    onSuccess: (response: any) => {
      setIsTyping(false);
      if (response.sessionId) {
        setCurrentSessionId(response.sessionId);
      }
      // Force refetch messages after a small delay to ensure DB is updated
      setTimeout(() => {
        refetchMessages();
        refetchSessions();
      }, 100);
    },
    onError: (error: any) => {
      console.error('Alex chat error:', error);
      setIsTyping(false);
    }
  });

  const createSessionMutation = useMutation({
    mutationFn: async (title: string) => {
      return apiRequest('POST', '/api/alex/sessions', { title });
    },
    onSuccess: (session: ChatSession) => {
      setCurrentSessionId(session.id);
      setMessages([]);
      refetchSessions();
    }
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return apiRequest('DELETE', `/api/alex/sessions/${sessionId}`);
    },
    onSuccess: () => {
      refetchSessions();
      if (currentSessionId && sessions.length > 1) {
        // Switch to another session
        const otherSession = sessions.find(s => s.id !== currentSessionId);
        if (otherSession) {
          setCurrentSessionId(otherSession.id);
        } else {
          setCurrentSessionId(null);
          setMessages([]);
        }
      } else {
        setCurrentSessionId(null);
        setMessages([]);
      }
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

    const messageToSend = inputValue;
    setInputValue("");
    setIsTyping(true);

    chatMutation.mutate({ 
      message: messageToSend,
      sessionId: currentSessionId || undefined,
      context: { stores, insights }
    });
  };

  const handleNewChat = () => {
    const title = `New Chat ${new Date().toLocaleDateString()}`;
    createSessionMutation.mutate(title);
  };

  const handleSwitchSession = (sessionId: number) => {
    setCurrentSessionId(sessionId);
    setShowSessionSelector(false);
  };

  const handleDeleteSession = (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSessionMutation.mutate(sessionId);
  };

  const initializeChat = () => {
    // If no current session and no sessions exist, create first session
    if (!currentSessionId && sessions.length === 0) {
      handleNewChat();
    } else if (!currentSessionId && sessions.length > 0) {
      // Load the most recent session
      setCurrentSessionId(sessions[0].id);
    }
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
    if (isOpen) {
      initializeChat();
    }
  }, [isOpen, sessions]);

  // Auto-select first session when sessions load
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId]);

  const getCurrentSession = () => {
    return sessions.find(s => s.id === currentSessionId);
  };

  const getActionIcon = (iconName: string) => {
    switch (iconName) {
      case 'BookOpen':
        return <BookOpen className="h-3 w-3" />;
      case 'Zap':
        return <Zap className="h-3 w-3" />;
      case 'Camera':
        return <Camera className="h-3 w-3" />;
      case 'Edit3':
        return <Edit3 className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const handleActionClick = (action: any) => {
    if (action.action === 'education') {
      handleEducationQuestion();
    } else if (action.action === 'optimize') {
      handleOptimizeAction();
    } else if (action.action === 'ads') {
      handleCreateAds();
    }
  };

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
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">Alex</h3>
                  <p className="text-xs text-muted-foreground">
                    {getCurrentSession()?.title || "Your AI E-commerce Manager"}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {/* Session Selector */}
                <DropdownMenu open={showSessionSelector} onOpenChange={setShowSessionSelector}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <History className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <div className="p-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNewChat}
                        className="w-full mb-2"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Chat
                      </Button>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="max-h-64 overflow-y-auto">
                      {sessions.map((session) => (
                        <DropdownMenuItem
                          key={session.id}
                          onClick={() => handleSwitchSession(session.id)}
                          className={`flex items-center justify-between cursor-pointer ${
                            session.id === currentSessionId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          <div className="flex-1 text-sm truncate">
                            {session.title}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            className="h-6 w-6 p-0 ml-2"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 h-80">
              {messages.length === 0 && !isTyping && (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <div className="text-center">
                    <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Start a conversation with Alex!</p>
                  </div>
                </div>
              )}
              
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isFromAlex ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.isFromAlex
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'bg-blue-500 text-white'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-line">{message.content}</p>
                    
                    {/* Action Buttons */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {message.actions.map((action) => (
                          <Button
                            key={action.id}
                            variant={action.variant || "outline"}
                            size="sm"
                            onClick={() => handleActionClick(action)}
                            className="h-8 text-xs"
                          >
                            {getActionIcon(action.icon)}
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