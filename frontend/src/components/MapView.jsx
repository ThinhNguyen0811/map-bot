import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icon issue with webpack/vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom marker icons
const createIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  })
}

const defaultIcon = createIcon('#FF6B6B')
const startIcon = createIcon('#4ECDC4')
const endIcon = createIcon('#FF6B6B')

// Component to handle map state changes
function MapController({ mapState }) {
  const map = useMap()

  // Handle bounds/route changes - use routeKey to detect new routes
  useEffect(() => {
    if (mapState.bounds && mapState.fitBounds) {
      // Small delay to ensure route is rendered first
      setTimeout(() => {
        map.fitBounds(mapState.bounds, { padding: [50, 50] })
      }, 100)
    } else if (mapState.center) {
      map.setView(mapState.center, mapState.zoom)
    }
  }, [map, mapState.center, mapState.zoom, mapState.bounds, mapState.fitBounds, mapState.routeKey])

  // Fit bounds to markers
  useEffect(() => {
    if (mapState.fitBounds && mapState.markers.length > 0 && !mapState.bounds) {
      const bounds = L.latLngBounds(mapState.markers.map(m => m.position))
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [map, mapState.markers, mapState.fitBounds, mapState.bounds, mapState.markersKey])

  return null
}

function MapView({ mapState, setMapState, onMapClick, onClearMarkers }) {
  const mapRef = useRef(null)

  // Handle map click
  const handleMapClick = (e) => {
    if (onMapClick) {
      onMapClick(e.latlng)
    }
  }

  return (
    <div className="map-wrapper">
      {/* Clear button */}
      {(mapState.markers.length > 0 || mapState.route) && (
        <button className="clear-markers-btn" onClick={onClearMarkers}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
          Clear
        </button>
      )}

      <MapContainer
        center={mapState.center}
        zoom={mapState.zoom}
        ref={mapRef}
        style={{ width: '100%', height: '100%' }}
        onClick={handleMapClick}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController mapState={mapState} />

        {/* Markers */}
        {mapState.markers.map((marker, idx) => (
          <Marker
            key={`marker-${mapState.markersKey || 'default'}-${marker.position[0]}-${marker.position[1]}-${idx}`}
            position={marker.position}
            icon={marker.icon === 'start' ? startIcon : marker.icon === 'end' ? endIcon : defaultIcon}
          >
            <Popup>
              <div className="info-window">
                <h3>{marker.title}</h3>
                {marker.info && (
                  <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{marker.info}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Route Polyline */}
        {mapState.route && (
          <>
            <Polyline
              key={`route-${mapState.routeKey || 'default'}`}
              positions={mapState.route}
              pathOptions={{
                color: '#4ECDC4',
                weight: 5,
                opacity: 0.8,
              }}
            />
            {/* Start marker */}
            <Marker 
              key={`start-${mapState.routeKey || 'default'}`}
              position={mapState.route[0]} 
              icon={startIcon}
            >
              <Popup>Start</Popup>
            </Marker>
            {/* End marker */}
            <Marker 
              key={`end-${mapState.routeKey || 'default'}`}
              position={mapState.route[mapState.route.length - 1]} 
              icon={endIcon}
            >
              <Popup>End</Popup>
            </Marker>
          </>
        )}
      </MapContainer>
    </div>
  )
}

export default MapView
