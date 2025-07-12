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
- **Database ORM**: Drizzle ORM with PostgreSQL support
- **Schema Validation**: Zod for runtime type checking
- **AI Integration**: OpenAI GPT-4o for store analysis
- **Data Storage**: In-memory storage for development (easily replaceable with PostgreSQL)

## Key Components

### Core Application Components
1. **HeroSection**: Main landing interface with store input forms
2. **LoadingSection**: Animated loading state during analysis
3. **ResultsSection**: Comprehensive display of analysis results with scores and suggestions
4. **CTASection**: Call-to-action for premium features
5. **Header/Footer**: Navigation and branding elements

### API Layer
- **Store Analysis Endpoint** (`/api/analyze-store`): Main service for analyzing Shopify and eBay stores
- **Store Analyzer Services**: Specialized services for scraping and analyzing different store types
- **OpenAI Integration**: AI-powered analysis with structured output

### Database Schema
- **Store Analyses Table**: Stores analysis results with scores, suggestions, and metadata
- **Support for Multiple Store Types**: Flexible schema accommodating both Shopify URLs and eBay usernames

## Data Flow

1. **User Input**: User provides store URL (Shopify) or username (eBay) via the frontend form
2. **Request Validation**: Zod schemas validate input data and ensure proper store type requirements
3. **Store Scraping**: Backend fetches store content using HTTP requests with appropriate headers
4. **Content Processing**: HTML content is cleaned and prepared for AI analysis
5. **AI Analysis**: OpenAI API processes store content and returns structured scoring and recommendations
6. **Data Storage**: Analysis results are stored in the database for future reference
7. **Response Delivery**: Frontend receives comprehensive analysis results and displays them to the user

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

### Scalability Considerations
- **Stateless Backend**: Express server can be horizontally scaled
- **Database Connection Pooling**: PostgreSQL with connection management
- **CDN-Ready**: Static assets can be served via CDN for global distribution
- **API Rate Limiting**: Ready for rate limiting implementation on AI endpoints