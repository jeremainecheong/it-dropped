# Stüssy Drop Radar - Technical Architecture

## Overview

Stüssy Drop Radar is a real-time product tracking application that monitors Stüssy stores worldwide for new drops, restocks, and price changes. The application provides a clean, minimalist interface for viewing the latest product updates across multiple regions.

## Tech Stack

### Frontend
- **Next.js 14** with App Router
- **React 19** with modern hooks
- **TypeScript** for type safety
- **Tailwind CSS v4** with custom design tokens
- **shadcn/ui** + **Radix UI** for accessible components

### Backend
- **Next.js API Routes** as BFF (Backend for Frontend)
- **DropRadar API** external service for product data
- **Next.js Caching** with revalidation strategies

### Infrastructure
- **Vercel** for deployment and hosting
- **Vercel Analytics** for usage metrics

## Architecture

### Data Flow

```
User → Frontend → Next.js API Routes → DropRadar API → Response
```

### API Integration

The application integrates with the DropRadar API through Next.js API routes:

- **GET /api/dropradar/products** - Fetches available products
  - Query params: `region`, `available`, `limit`, `offset`
  - Cache: 5 minutes (products change less frequently)

- **GET /api/dropradar/drops** - Fetches latest drops and changes
  - Query params: `region`, `type`, `notified`, `limit`, `offset`
  - Cache: 1 minute (drops are time-sensitive)

- **GET /api/dropradar/status** - System health and recent scrapes
  - Cache: 30 seconds

### Features

1. **Multi-Region Support**: Track products across US, UK, EU, JP, and AU stores
2. **Drop Types**: 
   - NEW - Brand new products
   - RESTOCK - Previously sold-out items back in stock
   - PRICE DROP - Discounted items
   - PRICE INCREASE - Price went up
   - SIZE RESTOCK - Specific sizes restocked

3. **Real-time Updates**: Automatic data refresh based on cache strategies
4. **Responsive Design**: Mobile-first approach with desktop enhancements
5. **Search Functionality**: Filter products by name or category

### Performance Optimizations

- **Smart Caching**: Different revalidation times based on data sensitivity
- **Image Optimization**: Next.js automatic image optimization
- **Code Splitting**: Automatic route-based code splitting
- **Edge Functions**: API routes deployed to edge for low latency

### Design System

- **Monochrome Palette**: Black, white, and grays for clean aesthetic
- **Typography**: Geist Sans for headings, Geist Mono for data
- **Spacing**: Consistent 8px grid system
- **Animations**: Subtle transitions for smooth UX

## Environment Variables

```bash
DROPRADAR_API_URL=https://api.dropradar.dev
```

## Future Enhancements

- Real-time WebSocket updates for instant drop notifications
- User accounts for personalized alerts
- Wishlist and favorites functionality
- Price history charts
- Email/SMS notifications for specific drops
- Advanced filtering and sorting options
