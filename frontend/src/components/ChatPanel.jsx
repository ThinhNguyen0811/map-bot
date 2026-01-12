import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

function ChatPanel({ messages, onSendMessage, thinkingStatus, streamingContent, disabled }) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, thinkingStatus, streamingContent])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim() && !disabled && !thinkingStatus && !streamingContent) {
      onSendMessage(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const suggestedQueries = [
    'Find cafes near Times Square',
    'Directions from Central Park to Brooklyn Bridge',
    'What restaurants are in Manhattan?',
    'Find hotels near JFK Airport',
  ]

  const isProcessing = thinkingStatus || streamingContent

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && !isProcessing && (
          <div className="welcome-suggestions">
            <p className="suggestions-title">Try asking:</p>
            <div className="suggestions-list">
              {suggestedQueries.map((query, idx) => (
                <button
                  key={idx}
                  className="suggestion-chip"
                  onClick={() => !disabled && onSendMessage(query)}
                  disabled={disabled}
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, idx) => (
          <div
            key={idx}
            className={`message ${message.role} ${message.isError ? 'error' : ''}`}
          >
            <div className="message-avatar">
              {message.role === 'user' ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 100 100">
                  <defs>
                    <linearGradient id={`avatarGrad${idx}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#FF6B6B' }} />
                      <stop offset="100%" style={{ stopColor: '#4ECDC4' }} />
                    </linearGradient>
                  </defs>
                  <circle cx="50" cy="50" r="45" fill={`url(#avatarGrad${idx})`} />
                  <path
                    d="M50 20 C35 20 25 32 25 45 C25 60 50 80 50 80 C50 80 75 60 75 45 C75 32 65 20 50 20 Z"
                    fill="white"
                  />
                  <circle cx="50" cy="42" r="10" fill={`url(#avatarGrad${idx})`} />
                </svg>
              )}
            </div>
            <div className="message-content">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
        ))}

        {/* Thinking status indicator */}
        {thinkingStatus && !streamingContent && (
          <div className="message assistant thinking">
            <div className="message-avatar">
              <svg viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="thinkingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#FF6B6B' }} />
                    <stop offset="100%" style={{ stopColor: '#4ECDC4' }} />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="45" fill="url(#thinkingGrad)" />
                <path
                  d="M50 20 C35 20 25 32 25 45 C25 60 50 80 50 80 C50 80 75 60 75 45 C75 32 65 20 50 20 Z"
                  fill="white"
                />
                <circle cx="50" cy="42" r="10" fill="url(#thinkingGrad)" />
              </svg>
            </div>
            <div className="message-content">
              <div className="thinking-status">
                <div className="thinking-spinner"></div>
                <span>{thinkingStatus}</span>
              </div>
            </div>
          </div>
        )}

        {/* Streaming response */}
        {streamingContent && (
          <div className="message assistant streaming">
            <div className="message-avatar">
              <svg viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="streamingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#FF6B6B' }} />
                    <stop offset="100%" style={{ stopColor: '#4ECDC4' }} />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="45" fill="url(#streamingGrad)" />
                <path
                  d="M50 20 C35 20 25 32 25 45 C25 60 50 80 50 80 C50 80 75 60 75 45 C75 32 65 20 50 20 Z"
                  fill="white"
                />
                <circle cx="50" cy="42" r="10" fill="url(#streamingGrad)" />
              </svg>
            </div>
            <div className="message-content">
              <ReactMarkdown>{streamingContent}</ReactMarkdown>
              <span className="streaming-cursor">▊</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Connecting...' : 'Ask about places, directions, or locations...'}
            disabled={disabled || isProcessing}
            rows={1}
          />
          <button type="submit" disabled={disabled || !input.trim() || isProcessing}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}

export default ChatPanel
