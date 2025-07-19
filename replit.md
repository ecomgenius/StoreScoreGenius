# StoreScore - AI-Powered Store Analysis Platform

## Overview

StoreScore is a comprehensive e-commerce store analysis platform that provides AI-powered insights and scoring for both Shopify and eBay stores. The application analyzes store performance across multiple dimensions (design, catalog, trust, and performance) and provides actionable recommendations for improvement.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a full-stack architecture with a clear separation between frontend and backend concerns, utilizing modern web technologies for optimal performance and user experience.

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with CSS variables for theming
- **Build Tool**: Vite for fast development and optimized builds

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API endpoints
- **Database**: PostgreSQL with Neon serverless hosting
- **Database ORM**: Drizzle ORM with full schema management
- **Schema Validation**: Zod for runtime type checking
- **AI Integration**: OpenAI GPT-4o for store analysis
- **Authentication**: Session-based authentication with secure middleware
- **Payment Processing**: Stripe integration for credit purchases
- **Data Storage**: PostgreSQL database with comprehensive user and analysis management

## Key Components

### Core Application Components
1. **HeroSection**: Main landing interface with store input forms for guest users
2. **Dashboard**: Authenticated user interface with real-time credit tracking and analysis management
3. **NewResultsSection**: Comprehensive display of analysis results with detailed scoring and actionable suggestions
4. **AuthModal**: User registration and login with secure authentication
5. **DashboardLayout**: Authenticated user navigation with sidebar and user management
6. **Past Analysis**: Complete history of user analyses with detailed tracking
7. **User Stores**: Store management interface for saving and connecting multiple stores
8. **Settings**: User profile and subscription management

### API Layer
- **Authentication Endpoints**: `/api/auth/*` for registration, login, logout, and user management
- **Store Analysis Endpoint** (`/api/analyze-store`): Main service for analyzing Shopify and eBay stores with credit deduction
- **User Store Management**: `/api/stores/*` for connecting and managing multiple user stores
- **Credit Management**: `/api/credits/*` for tracking usage and purchasing additional credits
- **Analysis History**: `/api/analyses/*` for retrieving past analysis results
- **Payment Integration**: `/api/payments/*` and `/api/webhooks/stripe` for Stripe payment processing
- **Store Analyzer Services**: Specialized services for scraping and analyzing different store types
- **OpenAI Integration**: AI-powered analysis with structured output and comprehensive scoring

### Database Schema
- **Store Analyses Table**: Stores analysis results with scores, suggestions, and metadata
- **Users Table**: Complete user management with authentication, credits, and subscription tracking
- **User Stores Table**: Manages connected user stores for easy re-analysis
- **Credit Transactions Table**: Tracks all credit purchases, usage, and refunds
- **User Sessions Table**: Secure session management for authentication
- **Support for Multiple Store Types**: Flexible schema accommodating both Shopify URLs and eBay usernames

## Data Flow

### Authenticated User Analysis
1. **User Authentication**: Session-based authentication validates user identity and permissions
2. **Credit Verification**: System checks available user credits before proceeding with analysis
3. **User Input**: User provides store URL (Shopify) or username (eBay) via the dashboard interface
4. **Request Validation**: Zod schemas validate input data and ensure proper store type requirements
5. **Store Scraping**: Backend fetches store content using HTTP requests with appropriate headers
6. **Content Processing**: HTML content is cleaned and prepared for AI analysis
7. **AI Analysis**: OpenAI API processes store content and returns structured scoring and recommendations
8. **Credit Deduction**: System deducts 1 credit from user account and logs the transaction
9. **Data Storage**: Analysis results are stored with user association for future reference
10. **Response Delivery**: Frontend receives analysis results and updates dashboard statistics

### Guest User Analysis (Freemium)
1. **User Input**: Guest provides store details via the landing page interface
2. **Limited Analysis**: System performs basic analysis without credit requirements
3. **Data Storage**: Results stored without user association for recent analyses display
4. **CTA Integration**: Results include prompts to register for full features and detailed insights

## External Dependencies

### AI Services
- **OpenAI API**: Powers the core store analysis functionality using GPT-4o model
- **Environment Variable**: `OPENAI_API_KEY` required for AI analysis

### Database
- **PostgreSQL**: Production database (configured via `DATABASE_URL`)
- **Neon Database**: Cloud PostgreSQL provider support via `@neondatabase/serverless`

### Development Tools
- **Replit Integration**: Special handling for Replit development environment
- **Error Handling**: Runtime error overlay for development debugging

### UI/UX Libraries
- **Radix UI**: Comprehensive set of accessible UI primitives
- **Lucide Icons**: Modern icon library for consistent iconography
- **TanStack Query**: Advanced server state management with caching and background updates

## Deployment Strategy

### Development Environment
- **Hot Module Replacement**: Vite provides instant updates during development
- **TypeScript Compilation**: Real-time type checking and compilation
- **In-Memory Storage**: Fast development iteration without database setup

### Production Build
- **Frontend**: Vite builds optimized static assets to `dist/public`
- **Backend**: esbuild compiles TypeScript server code to `dist/index.js`
- **Environment Configuration**: Production mode switches to PostgreSQL database
- **Static File Serving**: Express serves built frontend assets in production

### Configuration Management
- **Environment Variables**: Database URL, OpenAI API key, and Node environment
- **Build Scripts**: Separate development and production build processes
- **Database Migrations**: Drizzle Kit handles schema changes and migrations

### Recent Changes (July 13, 2025)
- **Fixed Critical Authentication Bug**: Resolved database connection issues causing empty responses for authenticated users
- **Implemented Real-time Dashboard**: Added dynamic credit tracking, analysis counting, and store management
- **Completed SaaS Functionality**: Full user account system with credit deduction and transaction logging
- **Enhanced User Experience**: Dashboard now shows live statistics with automatic refresh after analyses
- **Fixed Store Analysis Consistency**: Implemented comprehensive change detection system preventing duplicate AI analysis for unchanged stores
- **Added Shopify OAuth Integration**: Complete Shopify app integration with OAuth authentication, real-time data access, and automated analysis working like AutoDS/Dropship.io
- **Built Store Management System**: Full store connection dashboard with status tracking, sync monitoring, and AI analysis triggers
- **Fixed Analysis Display Issues**: Resolved "undefined/100" score display and implemented automatic redirect to analysis results page
- **Enhanced Store Cards**: Added last analysis score display with color coding and AI recommendations count for future management features
- **Streamlined Analysis Flow**: Removed popup notifications and implemented seamless redirect to detailed analysis page after completion
- **Fixed Authentication System**: Resolved API response parsing issues that caused authentication failures and "response.json is not a function" errors
- **Built AI Recommendations Page**: Created comprehensive AI-powered store optimization interface with individual and bulk product improvements, accessible from store cards
- **Fixed AI Title Generation System**: Replaced placeholder content with real OpenAI GPT-4o powered product title optimization, generating conversion-focused, SEO-optimized titles under 60 characters
- **Resolved Shopify Write Permissions Issue**: Updated OAuth scope to request 'write_products' permission enabling actual product updates, added proper error handling and user guidance for permission upgrades
- **Implemented Product Optimization Tracking**: Added comprehensive database tracking for AI optimizations with new productOptimizations table, filtering system to hide optimized products from recommendation lists, and visual badges showing optimization status
- **Enhanced Optimization UX**: Products are automatically removed from optimization lists after being processed, counters decrease accurately, and optimization badges provide clear visual feedback on which products have been AI-enhanced
- **Fixed Keyword Optimization Bug**: Resolved issue where keyword optimizations weren't being saved or tracked properly, now uses OpenAI to generate relevant SEO keywords and updates product tags correctly
- **Enhanced AI Pricing Optimization**: Implemented comprehensive pricing strategy using OpenAI with market analysis, psychological pricing principles, competitive positioning, and conversion optimization logic including premium/value/psychological pricing strategies
- **Fixed Critical Frontend Bug**: Resolved issue where frontend was sending 'title' as recommendationType for all optimizations regardless of actual tab clicked, now correctly passes keywords/pricing optimization types to server
- **Built Comprehensive AI Recommendations System**: Created multi-category recommendation architecture with General Recommendations hub, dedicated Product and Design optimization pages, supporting 6 recommendation categories (Products, Design, Reviews/Trust, Conversion, SEO/Categories, Legal Pages)
- **Enhanced Product Route Architecture**: Restructured routing so AI Recommendations button leads to general hub (/recommendations) with Products sub-page (/products) and Design sub-page (/design), maintaining backward compatibility
- **Implemented Design Recommendations API**: Added OpenAI-powered design analysis endpoint generating specific color, typography, layout, images, and mobile optimization suggestions with one-click application via Shopify theme API integration
- **Completed Mandatory Subscription Flow**: Fixed registration to require credit card input and trial subscription setup before dashboard access, preventing users from bypassing subscription requirements and ensuring proper $49/month billing after 7-day trial
- **Enhanced Payment Security**: Implemented separate Stripe elements for card number, expiry date, and CVV validation, removing test card information from user interface while maintaining comprehensive payment verification
- **AI Time Savings Integration**: Added OpenAI-powered time savings calculation system showing users exactly how much manual work they save with each optimization, displayed in individual product previews with detailed breakdowns of research, creation, review, and implementation time
- **Critical Shopify API Migration**: Migrated entire application from deprecated REST APIs (2023-10) to new GraphQL Product APIs (2024-04+) for compliance with Shopify deprecation timeline (Feb 2025 for public apps, April 2025 for custom apps), ensuring future compatibility and avoiding feature limitations
- **Fixed Legacy Route Support**: Added missing route pattern (/recommendations/:storeId) to handle backward compatibility with legacy URLs, resolving 404 errors when accessing AI Recommendations via "Optimize with AI" button
- **Implemented Product Filtering System**: Added comprehensive filtering functionality with "All", "To optimize", and "Optimized" buttons allowing users to easily view product optimization status across all recommendation categories
- **Added AI Optimization Badges**: Products now display green "✓ AI Optimized" badges next to titles for items that have been processed by AI, providing clear visual feedback on optimization status and helping users track their progress

### Scalability Considerations
- **Stateless Backend**: Express server can be horizontally scaled
- **Database Connection Pooling**: PostgreSQL with Neon serverless architecture
- **CDN-Ready**: Static assets can be served via CDN for global distribution
- **API Rate Limiting**: Ready for rate limiting implementation on AI endpoints
- **Credit System**: Scalable payment processing with Stripe integration
- **Session Management**: Efficient session handling with automatic cleanup