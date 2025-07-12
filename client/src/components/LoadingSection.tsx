import { useEffect, useState } from "react";

export default function LoadingSection() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const increment = Math.random() * 20;
        const newProgress = prev + increment;
        return newProgress > 100 ? 100 : newProgress;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-6"></div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Analyzing Your Store...</h2>
        <p className="text-gray-600 mb-8">Our AI is examining your store's design, products, and performance metrics.</p>
        <div className="max-w-md mx-auto bg-gray-200 rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-1000" 
            style={{ width: `${Math.min(progress, 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
