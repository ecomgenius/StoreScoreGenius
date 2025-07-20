import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageCircle, X, Send, Bot, Zap, BookOpen, Camera, Edit3, Plus, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { API_ENDPOINTS } from "@shared/constants";

/**
 * Chat message interface for Alex AI conversations
 */
interface Message {
  id: number;
  content: string;
  isFromAlex: boolean;
  createdAt: Date;
  actions?: BotAction[];
}

/**
 * Chat session interface for managing multiple conversations
 */
interface ChatSession {
  id: number;
  title: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Action button interface for interactive bot responses
 */
interface BotAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  variant?: "default" | "secondary" | "outline";
}

/**
 * Store insight data for Alex AI context
 */
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

/**
 * Alex AI Bot component - Intelligent assistant for e-commerce store optimization
 * Provides contextual advice, education, and recommendations based on store data
 */
export default function AlexBot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [showProactiveNotification, setShowProactiveNotification] = useState(false);
  const [proactiveMessage, setProactiveMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get user stores and recent analyses
  const { data: stores = [] } = useQuery({
    queryKey: [API_ENDPOINTS.STORES.LIST],
    enabled: !!user
  });

  const { data: insights } = useQuery<StoreInsight[]>({
    queryKey: [API_ENDPOINTS.ALEX.INSIGHTS],
    enabled: !!user && isOpen
  });

  // Proactive outreach check - runs in background
  const { data: proactiveOutreach } = useQuery({
    queryKey: [API_ENDPOINTS.ALEX.PROACTIVE],
    enabled: !!user && !isOpen, // Only check when chat is closed
    refetchInterval: 60000, // Check every minute
    staleTime: 30000 // Consider stale after 30 seconds
  });

  // Get user's chat sessions
  const { data: sessions = [], refetch: refetchSessions } = useQuery<ChatSession[]>({
    queryKey: [API_ENDPOINTS.ALEX.SESSIONS],
    enabled: !!user && isOpen
  });

  // Get messages for current session
  const { data: sessionMessages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: [API_ENDPOINTS.ALEX.SESSIONS, currentSessionId, 'messages'],
    enabled: !!user && !!currentSessionId
  });

  // Update messages when sessionMessages changes, but preserve temporary messages
  useEffect(() => {
    if (sessionMessages) {
      // Remove temporary messages and replace with real ones
      setMessages(prev => {
        const tempMessages = prev.filter(m => m.isTemporary);
        const realMessages = sessionMessages.filter(m => !m.isTemporary);
        
        // If we have temp messages, keep them until the server responds
        if (tempMessages.length > 0 && realMessages.length === prev.filter(m => !m.isTemporary).length) {
          return prev; // Keep temp messages
        }
        
        return realMessages;
      });
    }
  }, [sessionMessages]);

  /**
   * Mutation for sending chat messages to Alex AI
   */
  const chatMutation = useMutation({
    mutationFn: async (data: { message: string; context?: any; sessionId?: number }) => {
      return apiRequest('POST', API_ENDPOINTS.ALEX.CHAT, data);
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

  /**
   * Mutation for creating new chat sessions
   */
  const createSessionMutation = useMutation({
    mutationFn: async (title: string) => {
      return apiRequest('POST', API_ENDPOINTS.ALEX.SESSIONS, { title });
    },
    onSuccess: (session: ChatSession) => {
      setCurrentSessionId(session.id);
      setMessages([]);
      refetchSessions();
    }
  });

  /**
   * Mutation for deleting chat sessions
   */
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return apiRequest('DELETE', `${API_ENDPOINTS.ALEX.SESSIONS}/${sessionId}`);
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
    
    // Immediately add user message to the UI for responsive feel
    const tempUserMessage = {
      id: Date.now(),
      content: messageToSend,
      isFromAlex: false,
      createdAt: new Date(),
      isTemporary: true
    };
    
    setMessages(prev => [...prev, tempUserMessage]);
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
  };

  const handleDeleteSession = (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSessionMutation.mutate(sessionId);
  };

  // Remove initializeChat function as we're handling this in useEffects

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
    if (stores && Array.isArray(stores) && stores.length > 0) {
      window.location.href = `/dashboard/stores/${stores[0].id}/recommendations/products`;
    }
  };

  const navigateToRecommendations = () => {
    if (stores && Array.isArray(stores) && stores.length > 0) {
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

  // Don't auto-create sessions - let user click "New Chat" manually

  // Auto-select first session when sessions load (only run once)
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions.length]); // Only sessions.length to prevent infinite loops

  // Handle proactive outreach notifications
  useEffect(() => {
    if (proactiveOutreach && proactiveOutreach.shouldNotify && !isOpen && !showProactiveNotification) {
      setProactiveMessage(proactiveOutreach.message);
      setShowProactiveNotification(true);
      
      // Auto-hide after 10 seconds
      setTimeout(() => {
        setShowProactiveNotification(false);
      }, 10000);
    }
  }, [proactiveOutreach, isOpen, showProactiveNotification]);

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
      case 'Check':
        return <span className="text-green-500">✅</span>;
      case 'X':
        return <span className="text-red-500">❌</span>;
      case 'Search':
        return <span>🔍</span>;
      default:
        return null;
    }
  };

  const handleActionClick = (action: any) => {
    if (action.type === 'response') {
      // Immediately add user response to the UI
      const tempUserMessage = {
        id: Date.now(),
        content: action.text,
        isFromAlex: false,
        createdAt: new Date(),
        isTemporary: true
      };
      
      setMessages(prev => [...prev, tempUserMessage]);
      setIsTyping(true);
      
      // Send the action text as a message
      chatMutation.mutate({ 
        message: action.text,
        sessionId: currentSessionId 
      });
    } else if (action.action && typeof action.action === 'function') {
      action.action();
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
      {/* Proactive Notification */}
      <AnimatePresence>
        {showProactiveNotification && (
          <motion.div
            initial={{ opacity: 0, x: 400, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 400, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-24 right-6 z-50 max-w-xs"
          >
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-lg shadow-lg relative">
              <button
                onClick={() => setShowProactiveNotification(false)}
                className="absolute top-2 right-2 text-white/80 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-sm pr-6">{proactiveMessage}</p>
              <div className="flex justify-end mt-3 space-x-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowProactiveNotification(false);
                    setIsOpen(true);
                  }}
                  className="bg-white/20 hover:bg-white/30 text-white text-xs"
                >
                  Chat now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowProactiveNotification(false)}
                  className="text-white/80 hover:text-white hover:bg-white/10 text-xs"
                >
                  Later
                </Button>
              </div>
              {/* Speech bubble tail */}
              <div className="absolute bottom-0 right-8 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-purple-600 transform translate-y-full"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bot Avatar - Bottom Right */}
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <Button
          onClick={() => {
            setShowProactiveNotification(false);
            setIsOpen(true);
          }}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg"
          size="sm"
        >
          <Bot className="h-6 w-6 text-white" />
        </Button>
        
        {/* Notification dot for proactive messages or insights */}
        {(showProactiveNotification || (insights && insights.some(i => i.healthScore < 70))) && (
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
                    {sessions.find(s => s.id === currentSessionId)?.title || "Your AI E-commerce Manager"}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {/* Session Selector */}
                <DropdownMenu>
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
              {!currentSessionId && sessions.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <div className="text-center">
                    <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm mb-4">Welcome to Alex AI Assistant!</p>
                    <Button 
                      onClick={handleNewChat}
                      disabled={createSessionMutation.isPending}
                      className="mb-2"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Start Your First Chat
                    </Button>
                  </div>
                </div>
              )}
              
              {messages.length === 0 && currentSessionId && !isTyping && (
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
                            {typeof action.icon === 'string' ? getActionIcon(action.icon) : action.icon}
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
            {currentSessionId && (
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
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}