# Build Stage
FROM node:22-slim AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Build the app
# The GEMINI_API_KEY is baked into the build at this stage
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY
RUN npm run build

# Runtime Stage
FROM node:22-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built files and server script
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts

# Start the server
EXPOSE 3000
CMD ["npm", "start"]
