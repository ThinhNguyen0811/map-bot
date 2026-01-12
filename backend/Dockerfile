FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy MCP server files
COPY ../mcp-server /mcp-server
WORKDIR /mcp-server
RUN npm install

# Back to app
WORKDIR /app

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Start the server
CMD ["node", "src/server.js"]
