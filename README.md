# Map Bot - OpenStreetMap Chatbot

A conversational chatbot for maps using MCP (Model Context Protocol), LangChain JS, React, Leaflet, and Mistral AI.

**🆓 No API keys required for maps!** Uses free OpenStreetMap services.

## Features

- 🗺️ **Interactive Map** - Leaflet + OpenStreetMap with markers and route visualization
- 💬 **Natural Language Chat** - Ask questions about places, directions, and locations
- 🔧 **MCP Tools** - Modular tools via Model Context Protocol
- 🤖 **Mistral AI** - Powered by Mistral's large language model
- ⚡ **Real-time** - WebSocket-based communication for instant responses
- 🆓 **Free** - No Google Maps API key needed!

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React App     │◄────│  Express Server │◄────│   MCP Server    │
│ (Leaflet + OSM) │ WS  │   (Backend)     │stdio│ (OpenStreetMap) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
   OpenStreetMap           LangChain +              Nominatim
   Tile Server            Mistral AI               OSRM, Overpass
```

## OpenStreetMap Services Used

| Service | Purpose |
|---------|---------|
| [Nominatim](https://nominatim.org/) | Geocoding, reverse geocoding, place search |
| [OSRM](https://project-osrm.org/) | Routing / directions |
| [Overpass API](https://overpass-api.de/) | Nearby POI search |
| [OSM Tiles](https://www.openstreetmap.org/) | Map tiles |

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_places` | Search for places by query |
| `get_place_details` | Get details about a place |
| `get_directions` | Get directions (driving, walking, cycling) |
| `geocode` | Convert address to coordinates |
| `reverse_geocode` | Convert coordinates to address |
| `nearby_search` | Find places of a specific type nearby |

## Prerequisites

- Node.js 18+
- Mistral API Key (for the chatbot AI)

## Setup

### 1. Clone and Install

```bash
cd map-bot
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../mcp-server && npm install
cd ..
```

### 2. Configure Environment Variables

Create a `.env.development` file in the `backend` directory:

```env
# Mistral API Key (required for chatbot)
# Get from: https://console.mistral.ai/api-keys
MISTRAL_API_KEY=your_mistral_api_key_here

# Server Port (optional)
PORT=3001
```

Create a `.env.development` file in the `frontend` directory:

```env
VITE_WS_URL=ws://localhost:3001
```

### 3. Get Mistral API Key

1. Go to [Mistral Console](https://console.mistral.ai)
2. Create an account
3. Generate an API key

## Running the Application

### Option 1: Docker Compose (Recommended)

Build and run both services with one command:

```bash
docker compose up -d --build
```

Stop the services:

```bash
docker compose down
```

### Option 2: Development Mode (Local Node.js)

Run all services simultaneously:

```bash
npm run dev
```

Or run services individually:

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/health

## Usage Examples

### Search for Places
> "Find cafes near Times Square"
> "What restaurants are in downtown Seattle?"
> "Search for hotels near JFK Airport"

### Get Directions
> "How do I get from Central Park to Brooklyn Bridge?"
> "Walking directions from Empire State Building to Grand Central"
> "Cycling route from Golden Gate Bridge to Fisherman's Wharf"

### Find Nearby Places
> "What's near latitude 40.7128, longitude -74.006?"
> "Find pharmacies near me"

### Geocoding
> "What's the address at coordinates 40.7484, -73.9857?"
> "Convert 'Statue of Liberty' to coordinates"

## Project Structure

```
map-bot/
├── backend/                 # Express + LangChain server
│   ├── src/
│   │   └── server.js       # Main server with agent logic
│   └── package.json
├── frontend/               # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.jsx
│   │   │   ├── MapView.jsx    # Leaflet map
│   │   │   └── SearchBar.jsx  # Nominatim search
│   │   ├── styles/
│   │   │   └── index.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
├── mcp-server/             # MCP OpenStreetMap tools
│   ├── src/
│   │   └── index.js        # MCP server with OSM APIs
│   └── package.json
├── package.json            # Root workspace config
└── README.md
```

## Supported Amenity Types for Nearby Search

When using `nearby_search`, you can search for these types:
- `restaurant`, `cafe`, `bar`, `fast_food`
- `hospital`, `pharmacy`, `doctors`, `dentist`
- `bank`, `atm`
- `fuel`, `parking`
- `hotel`, `hostel`
- `school`, `university`, `library`
- `supermarket`, `convenience`
- And many more OSM amenity types!

## License

MIT
