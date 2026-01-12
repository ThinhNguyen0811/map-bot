import { useState, useEffect, useCallback, useRef } from 'react'
import ChatPanel from './components/ChatPanel'
import MapView from './components/MapView'
import SearchBar from './components/SearchBar'

function App() {
  const [messages, setMessages] = useState([])
  const [thinkingStatus, setThinkingStatus] = useState(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [ws, setWs] = useState(null)
  const [connected, setConnected] = useState(false)
  const [mapState, setMapState] = useState({
    center: [40.7128, -74.006], // NYC default [lat, lng]
    zoom: 12,
    markers: [],
    route: null,
    selectedPlace: null,
  })
  const streamingRef = useRef('')

  // WebSocket connection
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
    const socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      console.log('Connected to server')
      setConnected(true)
    }

    socket.onclose = () => {
      console.log('Disconnected from server')
      setConnected(false)
    }

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'response':
          // Non-streaming response (welcome message)
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.content },
          ])
          if (data.mapAction) {
            handleMapAction(data.mapAction)
          }
          break

        case 'thinking':
          // Thinking/tool use status
          setThinkingStatus(data.status)
          break

        case 'map_action':
          // Immediate map action - update map while response is still streaming
          console.log('Immediate map action:', data.mapAction)
          handleMapAction(data.mapAction)
          break

        case 'stream':
          // Streaming text chunk
          streamingRef.current += data.content
          setStreamingContent(streamingRef.current)
          break

        case 'stream_end':
          // Stream complete - add final message
          // Use data.content if we have it, otherwise use what we accumulated
          const finalContent = streamingRef.current || data.content
          if (finalContent?.trim()) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: finalContent },
            ])
          }
          // Reset streaming state
          streamingRef.current = ''
          setStreamingContent('')
          setThinkingStatus(null)

          if (data.mapAction) {
            handleMapAction(data.mapAction)
          }
          break

        case 'error':
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.content, isError: true },
          ])
          setThinkingStatus(null)
          streamingRef.current = ''
          setStreamingContent('')
          break
      }
    }

    socket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    setWs(socket)

    return () => {
      socket.close()
    }
  }, [])

  const handleMapAction = useCallback((action) => {
    console.log('Map action:', action)
    switch (action.type) {
      case 'SHOW_MARKERS':
        setMapState((prev) => ({
          ...prev,
          markers: action.markers || [],
          route: null,
          routeKey: null, // Clear route key when showing markers
          center: action.center || prev.center,
          zoom: action.zoom || prev.zoom,
          fitBounds: action.fitBounds,
          bounds: action.bounds,
          // Add timestamp to force re-render when same action type comes again
          markersKey: Date.now(),
        }))
        break
      case 'SHOW_ROUTE':
        setMapState((prev) => ({
          ...prev,
          markers: [],
          route: action.route,
          fitBounds: true,
          bounds: action.bounds,
          // Add timestamp to force re-render when same action type comes again
          routeKey: Date.now(),
        }))
        break
      case 'CENTER':
        setMapState((prev) => ({
          ...prev,
          center: action.center,
          zoom: action.zoom || prev.zoom,
        }))
        break
    }
  }, [])

  const sendMessage = useCallback(
    (message) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        setMessages((prev) => [...prev, { role: 'user', content: message }])
        // Reset streaming state before new message
        streamingRef.current = ''
        setStreamingContent('')
        ws.send(JSON.stringify({ type: 'chat', content: message }))
      }
    },
    [ws]
  )

  // Handle place selection from search
  const handlePlaceSelect = useCallback((place) => {
    if (place.lat && place.lon) {
      const location = [parseFloat(place.lat), parseFloat(place.lon)]
      setMapState((prev) => ({
        ...prev,
        center: location,
        zoom: 15,
        markers: [
          {
            position: location,
            title: place.display_name?.split(',')[0] || 'Selected Location',
            info: place.display_name,
          },
        ],
        selectedPlace: place,
        route: null,
      }))
    }
  }, [])

  // Handle map click
  const handleMapClick = useCallback((latlng) => {
    setMapState((prev) => ({
      ...prev,
      markers: [
        ...prev.markers,
        {
          position: [latlng.lat, latlng.lng],
          title: `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`,
          info: 'Clicked location',
        },
      ],
    }))
  }, [])

  // Clear markers
  const clearMarkers = useCallback(() => {
    setMapState((prev) => ({
      ...prev,
      markers: [],
      route: null,
      selectedPlace: null,
    }))
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <svg viewBox="0 0 100 100" className="logo-icon">
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#FF6B6B' }} />
                <stop offset="100%" style={{ stopColor: '#4ECDC4' }} />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" fill="url(#logoGrad)" />
            <path
              d="M50 20 C35 20 25 32 25 45 C25 60 50 80 50 80 C50 80 75 60 75 45 C75 32 65 20 50 20 Z"
              fill="white"
            />
            <circle cx="50" cy="42" r="10" fill="url(#logoGrad)" />
          </svg>
          <h1>Map Bot</h1>
        </div>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot"></span>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <main className="app-main">
        <div className="map-container">
          <SearchBar onPlaceSelect={handlePlaceSelect} />
          <MapView
            mapState={mapState}
            setMapState={setMapState}
            onMapClick={handleMapClick}
            onClearMarkers={clearMarkers}
          />
        </div>
        <div className="chat-container">
          <ChatPanel
            messages={messages}
            onSendMessage={sendMessage}
            thinkingStatus={thinkingStatus}
            streamingContent={streamingContent}
            disabled={!connected}
          />
        </div>
      </main>
    </div>
  )
}

export default App
