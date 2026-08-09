# Build Stage
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Run Stage
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/knexfile.ts ./
COPY --from=builder /usr/src/app/src/database ./src/database

EXPOSE 3000
CMD ["npm", "start"]
