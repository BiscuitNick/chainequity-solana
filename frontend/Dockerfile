FROM node:20-alpine

WORKDIR /app

# Install build dependencies for native modules (usb, etc.)
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Run the application
CMD ["npm", "run", "dev"]
