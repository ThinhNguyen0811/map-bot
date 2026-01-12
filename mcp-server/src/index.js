import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Logger (stderr because stdout is used for MCP protocol)
const log = {
  info: (msg, data) => console.error(`[MCP] ${msg}`, data ? JSON.stringify(data) : ''),
  error: (msg, err) => console.error(`[MCP ERROR] ${msg}`, err?.message || err),
};

log.info("Using OpenStreetMap APIs (free, no API key required)");

// User agent for Nominatim (required by their usage policy)
const USER_AGENT = "MapBot/1.0 (https://github.com/map-bot)";

// OpenStreetMap API helpers with logging

// Search for places using Nominatim
async function searchPlaces(query, location, radius = 5000) {
  log.info("API Request: searchPlaces", { query, location, radius });

  let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;

  // Add viewbox if location is provided (bias results to area)
  if (location) {
    const delta = radius / 111000; // Convert meters to degrees (approximate)
    url += `&viewbox=${location.lng - delta},${location.lat + delta},${location.lng + delta},${location.lat - delta}&bounded=0`;
  }

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await response.json();

  log.info("API Response: searchPlaces", { results: data.length });

  if (!Array.isArray(data)) {
    throw new Error("Invalid response from Nominatim");
  }

  return data.map((place) => ({
    name: place.name || place.display_name.split(",")[0],
    address: place.display_name,
    location: { lat: parseFloat(place.lat), lng: parseFloat(place.lon) },
    type: place.type,
    placeId: place.place_id,
    category: place.category,
  }));
}

// Get place details using Nominatim
async function getPlaceDetails(placeId) {
  log.info("API Request: getPlaceDetails", { placeId });

  const url = `https://nominatim.openstreetmap.org/details?place_id=${placeId}&format=json&addressdetails=1&extratags=1`;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await response.json();

  log.info("API Response: getPlaceDetails", { found: !!data.place_id });

  if (!data.place_id) {
    throw new Error("Place not found");
  }

  return {
    name: data.names?.name || data.localname || "Unknown",
    address: data.address ? Object.values(data.address).join(", ") : "",
    location: { lat: parseFloat(data.centroid?.coordinates[1] || data.lat), lng: parseFloat(data.centroid?.coordinates[0] || data.lon) },
    type: data.type,
    category: data.category,
    extratags: data.extratags,
  };
}

// Get directions using OSRM (Open Source Routing Machine)
async function getDirections(origin, destination, mode = "driving") {
  log.info("API Request: getDirections", { origin, destination, mode });

  // First geocode the origin and destination if they're addresses
  let originCoords, destCoords;

  if (typeof origin === "string") {
    const originGeo = await geocode(origin);
    originCoords = originGeo.location;
  } else {
    originCoords = origin;
  }

  if (typeof destination === "string") {
    const destGeo = await geocode(destination);
    destCoords = destGeo.location;
  } else {
    destCoords = destination;
  }

  // Map mode to OSRM profile
  const profileMap = {
    driving: "car",
    walking: "foot",
    bicycling: "bike",
    transit: "car", // OSRM doesn't support transit, fallback to car
  };
  const profile = profileMap[mode] || "car";

  // Use OSRM demo server (for production, use your own instance)
  const url = `https://router.project-osrm.org/route/v1/${profile}/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson&steps=true`;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await response.json();

  log.info("API Response: getDirections", { status: data.code, routes: data.routes?.length || 0 });

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error(`Routing error: ${data.code || "No route found"}`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  // Convert coordinates from [lng, lat] to [lat, lng] for Leaflet
  const routeCoordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

  return {
    distance: formatDistance(route.distance),
    duration: formatDuration(route.duration),
    startAddress: origin,
    endAddress: destination,
    startLocation: originCoords,
    endLocation: destCoords,
    steps: leg.steps.map((step) => ({
      instruction: step.maneuver?.instruction || step.name || "Continue",
      distance: formatDistance(step.distance),
      duration: formatDuration(step.duration),
    })),
    routeCoordinates, // For drawing on map
  };
}

// Geocode address using Nominatim
async function geocode(address) {
  log.info("API Request: geocode", { address });

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await response.json();

  log.info("API Response: geocode", { results: data.length });

  if (!data.length) {
    throw new Error(`Address not found: ${address}`);
  }

  const result = data[0];
  return {
    formattedAddress: result.display_name,
    location: { lat: parseFloat(result.lat), lng: parseFloat(result.lon) },
    placeId: result.place_id,
  };
}

// Reverse geocode using Nominatim
async function reverseGeocode(lat, lng) {
  log.info("API Request: reverseGeocode", { lat, lng });

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await response.json();

  log.info("API Response: reverseGeocode", { found: !!data.display_name });

  if (!data.display_name) {
    throw new Error("Location not found");
  }

  return [
    {
      formattedAddress: data.display_name,
      address: data.address,
    },
  ];
}

// Nearby search using Nominatim with Overpass API for POI
async function nearbySearch(location, type, radius = 1500) {
  log.info("API Request: nearbySearch", { location, type, radius });

  // Use Overpass API for nearby POI search
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"="${type}"](around:${radius},${location.lat},${location.lng});
      way["amenity"="${type}"](around:${radius},${location.lat},${location.lng});
    );
    out center 10;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await response.json();

  log.info("API Response: nearbySearch", { results: data.elements?.length || 0 });

  if (!data.elements?.length) {
    // Fallback to Nominatim search
    return searchPlaces(`${type} near ${location.lat},${location.lng}`, location, radius);
  }

  return data.elements.slice(0, 10).map((el) => ({
    name: el.tags?.name || el.tags?.amenity || type,
    address: el.tags?.["addr:street"]
      ? `${el.tags?.["addr:housenumber"] || ""} ${el.tags?.["addr:street"]}, ${el.tags?.["addr:city"] || ""}`
      : "Address not available",
    location: {
      lat: el.lat || el.center?.lat,
      lng: el.lon || el.center?.lon,
    },
    type: el.tags?.amenity || type,
    placeId: el.id,
  }));
}

// Helper functions
function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours} hr ${mins} min`;
}

// Create MCP Server
const server = new Server(
  {
    name: "openstreetmap-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_places",
        description:
          "Search for places on OpenStreetMap by query. Returns a list of matching places with names, addresses, and locations.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'coffee shops in Seattle')",
            },
            lat: {
              type: "number",
              description: "Optional latitude for location-biased search",
            },
            lng: {
              type: "number",
              description: "Optional longitude for location-biased search",
            },
            radius: {
              type: "number",
              description: "Search radius in meters (default: 5000)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_place_details",
        description:
          "Get detailed information about a specific place.",
        inputSchema: {
          type: "object",
          properties: {
            placeId: {
              type: "string",
              description: "OpenStreetMap Place ID",
            },
          },
          required: ["placeId"],
        },
      },
      {
        name: "get_directions",
        description:
          "Get directions between two locations. Returns route with distance, duration, and step-by-step instructions.",
        inputSchema: {
          type: "object",
          properties: {
            origin: {
              type: "string",
              description: "Starting location (address or place name)",
            },
            destination: {
              type: "string",
              description: "Destination location (address or place name)",
            },
            mode: {
              type: "string",
              enum: ["driving", "walking", "bicycling"],
              description: "Travel mode (default: driving). Note: transit is not supported.",
            },
          },
          required: ["origin", "destination"],
        },
      },
      {
        name: "geocode",
        description:
          "Convert an address to geographic coordinates (latitude and longitude).",
        inputSchema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "Address to geocode",
            },
          },
          required: ["address"],
        },
      },
      {
        name: "reverse_geocode",
        description:
          "Convert geographic coordinates to a human-readable address.",
        inputSchema: {
          type: "object",
          properties: {
            lat: {
              type: "number",
              description: "Latitude",
            },
            lng: {
              type: "number",
              description: "Longitude",
            },
          },
          required: ["lat", "lng"],
        },
      },
      {
        name: "nearby_search",
        description:
          "Search for places of a specific type near a location (e.g., restaurant, cafe, hospital, pharmacy, fuel).",
        inputSchema: {
          type: "object",
          properties: {
            lat: {
              type: "number",
              description: "Latitude of the center point",
            },
            lng: {
              type: "number",
              description: "Longitude of the center point",
            },
            type: {
              type: "string",
              description:
                "Place type/amenity (e.g., restaurant, cafe, hospital, pharmacy, fuel, bank, parking)",
            },
            radius: {
              type: "number",
              description: "Search radius in meters (default: 1500)",
            },
          },
          required: ["lat", "lng", "type"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  log.info(`Tool called: ${name}`, args);

  try {
    let result;
    let mapAction = null;

    switch (name) {
      case "search_places": {
        const location =
          args.lat && args.lng ? { lat: args.lat, lng: args.lng } : null;
        result = await searchPlaces(args.query, location, args.radius);
        if (result.length > 0) {
          mapAction = {
            type: "SHOW_MARKERS",
            markers: result.map((p) => ({
              position: [p.location.lat, p.location.lng],
              title: p.name,
              info: `${p.name}\n${p.address}`,
            })),
            fitBounds: true,
          };
        }
        break;
      }

      case "get_place_details": {
        result = await getPlaceDetails(args.placeId);
        mapAction = {
          type: "SHOW_MARKERS",
          markers: [
            {
              position: [result.location.lat, result.location.lng],
              title: result.name,
              info: `${result.name}\n${result.address}`,
            },
          ],
          center: [result.location.lat, result.location.lng],
          zoom: 16,
        };
        break;
      }

      case "get_directions": {
        result = await getDirections(args.origin, args.destination, args.mode);
        mapAction = {
          type: "SHOW_ROUTE",
          route: result.routeCoordinates,
          bounds: [
            [result.startLocation.lat, result.startLocation.lng],
            [result.endLocation.lat, result.endLocation.lng],
          ],
        };
        // Remove routeCoordinates from result to keep response clean
        delete result.routeCoordinates;
        break;
      }

      case "geocode": {
        result = await geocode(args.address);
        mapAction = {
          type: "SHOW_MARKERS",
          markers: [
            {
              position: [result.location.lat, result.location.lng],
              title: result.formattedAddress,
            },
          ],
          center: [result.location.lat, result.location.lng],
          zoom: 15,
        };
        break;
      }

      case "reverse_geocode": {
        result = await reverseGeocode(args.lat, args.lng);
        mapAction = {
          type: "SHOW_MARKERS",
          markers: [
            {
              position: [args.lat, args.lng],
              title: result[0]?.formattedAddress || "Location",
            },
          ],
          center: [args.lat, args.lng],
          zoom: 15,
        };
        break;
      }

      case "nearby_search": {
        result = await nearbySearch(
          { lat: args.lat, lng: args.lng },
          args.type,
          args.radius
        );
        if (result.length > 0) {
          mapAction = {
            type: "SHOW_MARKERS",
            markers: result.map((p) => ({
              position: [p.location.lat, p.location.lng],
              title: p.name,
              info: `${p.name}\n${p.address}`,
            })),
            center: [args.lat, args.lng],
            fitBounds: true,
          };
        }
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    log.info(`Tool success: ${name}`, {
      resultCount: Array.isArray(result) ? result.length : 1,
      hasMapAction: !!mapAction,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ result, mapAction }, null, 2),
        },
      ],
    };
  } catch (error) {
    log.error(`Tool failed: ${name}`, error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error.message,
            tool: name,
            args: args,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("OpenStreetMap MCP Server started");
}

main().catch(console.error);
